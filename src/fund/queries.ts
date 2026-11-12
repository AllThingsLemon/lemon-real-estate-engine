// Live data for the wallet pages, read with contract calls only (no event
// logs: the public RPCs refuse eth_getLogs). Each read is a query option set,
// so a page can run one project's (useQuery) or several (useQueries):
//   link      the link check and the project's wiring, once per page load
//   project   raise, rates, status and payment health, every 30 s
//   deposits  every deposit record, every 30 s, once a wallet is connected
//   wallet    the wallet's approval, token balance and allowance
//   roles     the wallet's roles and the project's wallets (manage page)
//   upkeep    what the Maintenance checklist needs from the pool and lens
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { erc20Abi, multicall3Abi, parseAbi, zeroAddress, type Address, type PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { projectAbi, projectFactoryAbi, projectLensAbi } from './abi';
import { ROLES, ROLE_ID, type Role } from './roles';

/** The site's trusted factories, lens and owners (site.config.json "fund"). */
export interface Trust {
  factories: readonly Address[];
  lens: Address;
  trustedOwners: readonly Address[];
}

/** A listing linked to a project, or (on /manage/) a project no listing links to yet. */
export interface Listing {
  project: Address;
  title: string;
  /** Empty for a hidden listing, which has no page, and for an unlisted project. */
  url: string;
  /** No listing links to it: found through the indexer, or created on /manage/. */
  unlisted?: boolean;
  /** The listing's name in the editor, for "Edit project page". None for an unlisted project. */
  slug?: string;
}

/** A trusted owner (editor → Site settings → Project owners) and what the editor calls it. */
export interface Owner {
  address: Address;
  name: string;
}

/** A listing in the editor with no project yet, for linking one. */
export interface EditorListing {
  slug: string;
  title: string;
}

export type LinkCheck =
  | { trusted: false; reason: string }
  | { trusted: true; token: { address: Address; decimals: number; symbol: string }; cycleDuration: bigint };

const REFRESH_MS = 30_000;
/** Two addresses (or any hex strings) are the same, whatever their case. */
export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** One of this site's trusted owners: they create projects and can open /manage/. */
export const isTrustedOwner = (trust: Trust, account: string | undefined) => Boolean(account && trust.trustedOwners.some((o) => same(o, account)));

/**
 * The checks in docs/WALLET_PLAN.md ("Checking the link before any money
 * moves"): the project was made by a factory this site trusts, that factory
 * vouches for it, and its owner is one this site trusts. Anyone can deploy a
 * project and a CMS editor can paste any address, so nothing else is shown
 * until these pass.
 */
export const linkQuery = (client: PublicClient | undefined, trust: Trust, project: Address) =>
  queryOptions({
    queryKey: ['fund-link', project],
    staleTime: Infinity,
    enabled: Boolean(client),
    queryFn: async (): Promise<LinkCheck> => {
      const { factories, trustedOwners } = trust;
      const [[factory, owner, usdt, cycleDuration], vouched] = await Promise.all([
        client!.multicall({
          allowFailure: true,
          contracts: [
            { address: project, abi: projectAbi, functionName: 'factory' },
            { address: project, abi: projectAbi, functionName: 'owner' },
            { address: project, abi: projectAbi, functionName: 'usdt' },
            { address: project, abi: projectAbi, functionName: 'cycleDuration' },
          ],
        }),
        client!.multicall({
          allowFailure: true,
          contracts: factories.map((f) => ({ address: f, abi: projectFactoryAbi, functionName: 'isProject', args: [project] }) as const),
        }),
      ]);
      if (factory.status !== 'success' || owner.status !== 'success' || usdt.status !== 'success' || cycleDuration.status !== 'success') {
        return { trusted: false, reason: `${project} isn't a fund project on this network` };
      }
      const i = factories.findIndex((f) => same(f, factory.result));
      if (i < 0) return { trusted: false, reason: `its factory ${factory.result} isn't in fund.factories` };
      if (vouched[i].status !== 'success' || vouched[i].result !== true) {
        return { trusted: false, reason: `factory ${factory.result} doesn't list it as one of its projects` };
      }
      if (!trustedOwners.some((o) => same(o, owner.result))) {
        return { trusted: false, reason: `its owner ${owner.result} isn't one of this site's trusted owners (editor → Site settings → Project owners)` };
      }
      const [decimals, symbol] = await client!.multicall({
        allowFailure: false,
        contracts: [
          { address: usdt.result, abi: erc20Abi, functionName: 'decimals' },
          { address: usdt.result, abi: erc20Abi, functionName: 'symbol' },
        ],
      });
      return { trusted: true, token: { address: usdt.result, decimals, symbol }, cycleDuration: cycleDuration.result };
    },
  });

/** Raise, rates, status and payment health, plus the chain's clock. */
export const projectQuery = (client: PublicClient | undefined, lens: Address, project: Address, enabled: boolean) =>
  queryOptions({
    queryKey: ['fund-project', project],
    enabled: enabled && Boolean(client),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const multicall3 = client!.chain!.contracts!.multicall3!.address;
      const [state, config, nextDue, payCursor, chainTime] = await client!.multicall({
        allowFailure: false,
        contracts: [
          { address: lens, abi: projectLensAbi, functionName: 'getProjectState', args: [project] },
          { address: project, abi: projectAbi, functionName: 'config' },
          { address: project, abi: projectAbi, functionName: 'nextDue' },
          { address: project, abi: projectAbi, functionName: 'payCursor' },
          { address: multicall3, abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp' },
        ],
      });
      // The chain's clock against this browser's, so due dates follow the chain.
      return { state, config, nextDue, payCursor, clockOffset: Number(chainTime) - Date.now() / 1000 };
    },
  });

/** How many getDeposit calls go in one multicall. */
const DEPOSIT_BATCH = 250;

/**
 * Every deposit record. There's no on-chain list of a wallet's deposits, so
 * the page reads them all (at most about raise cap ÷ minimum) and keeps the
 * wallet's own. The rest are needed anyway for place in line and for paying
 * older deposits first.
 */
export const depositsQuery = (client: PublicClient | undefined, project: Address, enabled: boolean) =>
  queryOptions({
    queryKey: ['fund-deposits', project],
    enabled: enabled && Boolean(client),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const count = await client!.readContract({ address: project, abi: projectAbi, functionName: 'depositCount' });
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
      const batches = [];
      for (let i = 0; i < ids.length; i += DEPOSIT_BATCH) {
        batches.push(
          client!.multicall({
            allowFailure: false,
            contracts: ids.slice(i, i + DEPOSIT_BATCH).map((id) => ({ address: project, abi: projectAbi, functionName: 'getDeposit', args: [id] }) as const),
          }),
        );
      }
      return (await Promise.all(batches)).flat().map((d, i) => ({ ...d, id: BigInt(i) }));
    },
  });

/** The connected wallet's approval for this project, token balance and allowance. */
export const walletQuery = (client: PublicClient | undefined, project: Address, token: Address | undefined, account: Address | undefined) =>
  queryOptions({
    queryKey: ['fund-wallet', project, account],
    enabled: Boolean(client && token && account),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const [investorClass, balance, allowance, gasBalance] = await Promise.all([
        client!.readContract({ address: project, abi: projectAbi, functionName: 'investorClass', args: [account!] }),
        client!.readContract({ address: token!, abi: erc20Abi, functionName: 'balanceOf', args: [account!] }),
        client!.readContract({ address: token!, abi: erc20Abi, functionName: 'allowance', args: [account!, project] }),
        client!.getBalance({ address: account! }),
      ]);
      return { investorClass, balance, allowance, gasBalance };
    },
  });

/** The wallet's roles on a project, and the project's owner and wallets with any handover pending. */
async function readRoles(client: PublicClient, project: Address, account: Address) {
  const [[owner, pendingOwner, companyWallet, pendingCompanyWallet, mgmtFeeWallet, pendingMgmtFeeWallet], held] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: [
        { address: project, abi: projectAbi, functionName: 'owner' },
        { address: project, abi: projectAbi, functionName: 'pendingOwner' },
        { address: project, abi: projectAbi, functionName: 'companyWallet' },
        { address: project, abi: projectAbi, functionName: 'pendingCompanyWallet' },
        { address: project, abi: projectAbi, functionName: 'mgmtFeeWallet' },
        { address: project, abi: projectAbi, functionName: 'pendingMgmtFeeWallet' },
      ],
    }),
    client.multicall({
      allowFailure: false,
      contracts: ROLES.map((r) => ({ address: project, abi: projectAbi, functionName: 'hasRole', args: [ROLE_ID[r], account] }) as const),
    }),
  ]);
  const me = (a: Address) => same(a, account);
  const orNull = (a: Address) => (a === zeroAddress ? null : a);
  return {
    owner,
    pendingOwner: orNull(pendingOwner),
    companyWallet,
    pendingCompanyWallet: orNull(pendingCompanyWallet),
    mgmtFeeWallet,
    pendingMgmtFeeWallet: orNull(pendingMgmtFeeWallet),
    roles: ROLES.filter((_, i) => held[i]),
    isOwner: me(owner),
    isPendingOwner: pendingOwner !== zeroAddress && me(pendingOwner),
    isCompanyWallet: me(companyWallet),
    isFeeWallet: me(mgmtFeeWallet),
  };
}

export type Roles = Awaited<ReturnType<typeof readRoles>>;

export const rolesQuery = (client: PublicClient | undefined, project: Address, account: Address | undefined, enabled: boolean) =>
  queryOptions({
    queryKey: ['fund-roles', project, account],
    enabled: enabled && Boolean(client && account),
    refetchInterval: REFRESH_MS,
    queryFn: () => readRoles(client!, project, account!),
  });

/**
 * The pool's views the upkeep and the New project form need, which the fund
 * repo's ABIs don't cover.
 * The real Loans LiquidityPool prices its BNB fee in USD through its
 * PriceHelper (depositFeeUSD on deposits, withdrawFeeUSD on claims) and lists
 * a wallet's open withdrawal requests. The sandbox pool has one flat
 * nativeFee and a public request list instead.
 */
export const poolAbi = parseAbi([
  'function minimumDepositValue() view returns (uint256)',
  'struct LockDurationTier { uint256 duration; uint256 interestMultiplier; bool isEnabled; }',
  'function getAssetLockTiers(address token) view returns (LockDurationTier[])',
  'function previewPendingEarnings(address account) view returns (uint256)',
  'function getUserStatus(address user) view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256)',
  'function getPoolStatus() view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256)',
  'struct DepositEntry { address token; uint256 tokenAmount; uint256 stableTokenValue; uint256 liquidityShares; uint256 interestShares; uint256 unlockTime; uint256 lockDuration; }',
  'function getUserDepositEntries(address user) view returns (DepositEntry[])',
  'event Deposited(address indexed user, address indexed token, uint256 tokenAmount, uint256 stableTokenValue, uint256 liquidityShares, uint256 interestShares, uint256 expiresAt, uint256 lockDuration, bool nonEarning)',
  'function getDepositCredit(address token, uint256 amount) view returns (uint256)',
  'function feeReceiver() view returns (address)',
  'function FEE_BPS() view returns (uint256)',
  'function BPS_DENOMINATOR() view returns (uint256)',
  'function priceHelper() view returns (address)',
  'function nativeGasToken() view returns (address)',
  'function depositFeeUSD() view returns (uint256)',
  'function withdrawFeeUSD() view returns (uint256)',
  'struct WithdrawalRequest { address user; uint256 amount; uint256 amountFunded; uint256 liquiditySharesBurned; uint256 interestSharesBurned; uint256 requestTime; }',
  'function getUserWithdrawalRequests(address user) view returns (uint256[] requestIds, WithdrawalRequest[] requests)',
  'function nativeFee() view returns (uint256)',
  'function requestCount() view returns (uint256)',
  'function requests(uint256 id) view returns (address user, uint256 amount, bool funded, bool claimed)',
]);

/** The pool's fee on what it takes in, added on top of the amount: null when it charges none (no fee wallet). */
export type PoolFee = { bps: bigint; denom: bigint } | null;
export const poolFeeOf = (feeTo: Address | null | undefined, bps: bigint | null | undefined, denom: bigint | null | undefined): PoolFee =>
  feeTo && feeTo !== zeroAddress && bps ? { bps, denom: denom || 10_000n } : null;

/** What `gross` puts in the pool once the fee is added on top (Project._netOfPoolFee). */
export const netOfPoolFee = (gross: bigint, fee: PoolFee) => (fee ? (gross * fee.denom) / (fee.denom + fee.bps) : gross);

/** The pool takes `gross` in one go: what's left after its fee reaches its minimum (Project.deployPrincipal). */
export const poolTakes = (gross: bigint, min: bigint | null, fee: PoolFee) => {
  const net = netOfPoolFee(gross, fee);
  return min !== null && net > 0n && net + 1n >= min;
};
const priceHelperAbi = parseAbi(['function getNativeFee(address nativeToken, uint256 feeUSD) view returns (uint256)']);
const feedAbi = parseAbi(['function getPrice(address token) view returns (uint256)']);
/** The SwapScheduler's swaps() (IProjectSwapScheduler in the fund repo). */
const schedulerAbi = parseAbi([
  'function swaps(bytes32 swapId) view returns (address srcToken, address dstToken, uint256 srcLeft, uint256 dstTokenTotal, uint256 amountPerSwap, uint256 frequency, uint256 lastSwapTimestamp, uint256 completedSwaps, uint8 state, uint256 aggregateSrcTokenTotal, uint256 minPrice, uint256 maxPrice)',
]);

/** SwapState.Completed in the scheduler. */
const SWAP_COMPLETED = 1;
const NO_SWAP = `0x${'0'.repeat(64)}`;
/** Quotes move with the BNB price between reading and sending; the pool and the project refund any excess. */
const padFee = (fee: bigint) => fee + fee / 20n;

/**
 * Everything the Maintenance checklist, the compounding actions and the BNB
 * fee quotes need from the pool, the scheduler, the price feed and the lens.
 */
export const upkeepQuery = (client: PublicClient | undefined, lens: Address, project: Address, enabled: boolean) =>
  queryOptions({
    queryKey: ['fund-upkeep', project],
    enabled: enabled && Boolean(client),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const c = client!;
      const [pool, scheduler, feed, lemx, nextPayoffId, count, activeSwapId, lemxHeld] = await c.multicall({
        allowFailure: false,
        contracts: [
          { address: project, abi: projectAbi, functionName: 'pool' },
          { address: project, abi: projectAbi, functionName: 'scheduler' },
          { address: project, abi: projectAbi, functionName: 'feed' },
          { address: project, abi: projectAbi, functionName: 'lemx' },
          { address: project, abi: projectAbi, functionName: 'nextPayoffId' },
          { address: project, abi: projectAbi, functionName: 'depositCount' },
          { address: project, abi: projectAbi, functionName: 'activeSwapId' },
          { address: project, abi: projectAbi, functionName: 'lemxHeld' },
        ],
      });
      const [minimum, pending, status, poolStatus, entries, feeReceiver, feeBps, bpsDenominator, helper, gasToken, depositUsd, withdrawUsd, open, flatFee, requestCount, overdue, lemxPrice] =
        await c.multicall({
          allowFailure: true,
          contracts: [
            { address: pool, abi: poolAbi, functionName: 'minimumDepositValue' },
            { address: pool, abi: poolAbi, functionName: 'previewPendingEarnings', args: [project] },
            { address: pool, abi: poolAbi, functionName: 'getUserStatus', args: [project] },
            { address: pool, abi: poolAbi, functionName: 'getPoolStatus' },
            { address: pool, abi: poolAbi, functionName: 'getUserDepositEntries', args: [project] },
            { address: pool, abi: poolAbi, functionName: 'feeReceiver' },
            { address: pool, abi: poolAbi, functionName: 'FEE_BPS' },
            { address: pool, abi: poolAbi, functionName: 'BPS_DENOMINATOR' },
            { address: pool, abi: poolAbi, functionName: 'priceHelper' },
            { address: pool, abi: poolAbi, functionName: 'nativeGasToken' },
            { address: pool, abi: poolAbi, functionName: 'depositFeeUSD' },
            { address: pool, abi: poolAbi, functionName: 'withdrawFeeUSD' },
            { address: pool, abi: poolAbi, functionName: 'getUserWithdrawalRequests', args: [project] },
            { address: pool, abi: poolAbi, functionName: 'nativeFee' },
            { address: pool, abi: poolAbi, functionName: 'requestCount' },
            { address: lens, abi: projectLensAbi, functionName: 'overdueBalloons', args: [project, nextPayoffId, count - nextPayoffId] },
            { address: feed, abi: feedAbi, functionName: 'getPrice', args: [lemx] },
          ],
        });
      const ok = <T,>(r: { status: string; result?: T }) => (r.status === 'success' ? (r.result as T) : null);

      // BNB fees: the real pool's USD fees through its PriceHelper, else the sandbox's flat fee.
      let fees: { deposit: bigint; withdraw: bigint } | null = null;
      const h = ok(helper), g = ok(gasToken), du = ok(depositUsd), wu = ok(withdrawUsd);
      if (h && g && du !== null && wu !== null) {
        const [d, w] = await c.multicall({
          allowFailure: true,
          contracts: [
            { address: h, abi: priceHelperAbi, functionName: 'getNativeFee', args: [g, du] },
            { address: h, abi: priceHelperAbi, functionName: 'getNativeFee', args: [g, wu] },
          ],
        });
        // A failed quote (no BNB price) leaves fees null: the buttons say why instead of guessing.
        if (d.status === 'success' && w.status === 'success') fees = { deposit: padFee(d.result), withdraw: padFee(w.result) };
      } else {
        const flat = ok(flatFee) ?? 0n;
        fees = { deposit: padFee(flat), withdraw: padFee(flat) };
      }

      // Withdrawal requests the project has open: ready once the pool has funded them.
      // The real pool says when each was made; the sandbox's doesn't. Null: neither could be read.
      let requests: { id: bigint; amount: bigint; ready: boolean; requested: bigint | null }[] | null = null;
      const real = ok(open);
      if (real) {
        requests = real[0].map((id, i) => ({ id, amount: real[1][i].amount, ready: real[1][i].amountFunded >= real[1][i].amount, requested: real[1][i].requestTime }));
      } else if (ok(requestCount) !== null) {
        const n = Number(ok(requestCount));
        const all = n
          ? await c.multicall({
              allowFailure: false,
              contracts: Array.from({ length: n }, (_, i) => ({ address: pool, abi: poolAbi, functionName: 'requests', args: [BigInt(i)] }) as const),
            })
          : [];
        requests = all.flatMap(([user, amount, funded, claimed], i) =>
          same(user, project) && !claimed ? [{ id: BigInt(i), amount, ready: funded, requested: null }] : [],
        );
      }

      // Held LEMX can be locked once its credit, net of the pool's incoming fee, reaches the minimum.
      let lemxLockable = false;
      const min = ok(minimum);
      const poolFee = poolFeeOf(ok(feeReceiver), ok(feeBps), ok(bpsDenominator));
      if (lemxHeld > 0n && min !== null) {
        const net = netOfPoolFee(lemxHeld, poolFee);
        const credit = await c.readContract({ address: pool, abi: poolAbi, functionName: 'getDepositCredit', args: [lemx, net] }).catch(() => 0n);
        lemxLockable = credit + 1n >= min;
      }

      // The LEMX purchase in progress, if any.
      let swap: {
        srcLeft: bigint;
        bought: bigint;
        amountPerSwap: bigint;
        frequency: bigint;
        lastSwap: bigint;
        completed: bigint;
        done: boolean;
        minPrice: bigint;
      } | null = null;
      if (activeSwapId !== NO_SWAP) {
        const s = await c.readContract({ address: scheduler, abi: schedulerAbi, functionName: 'swaps', args: [activeSwapId] });
        swap = {
          srcLeft: s[2],
          bought: s[3],
          amountPerSwap: s[4],
          frequency: s[5],
          lastSwap: s[6],
          completed: s[7],
          done: s[2] === 0n || s[8] === SWAP_COMPLETED,
          minPrice: s[10],
        };
      }

      // getUserStatus: shares, interest shares, total principal, unlocked, locked, pending earnings, total claimed.
      const userStatus = ok(status);
      // Interest still in Loans: the next pull (Collect does one) spreads it over the pool's interest
      // shares. The project's part, as the loans dapp's Pending Distribution works it out.
      // getPoolStatus: value, shares, interest shares, accumulator, last pull, interest in Loans, next pull.
      const ps = ok(poolStatus);
      const poolWaiting = userStatus && ps && ps[2] > 0n ? (ps[5] * userStatus[1]) / ps[2] : 0n;
      // Each entry's unlockTime is the pool's own: the lock's end, rounded up to the pool's weekly unlock grid.
      const held = ok(entries);
      return {
        pool,
        poolMinimum: min,
        /** The pool's fee on deposits: placing principal needs the minimum after it. */
        poolFee,
        poolEarnings: ok(pending) ?? 0n,
        /** The project's share of interest still in Loans, which Collect pulls first. An estimate: expiries swept at the pull can shift it. */
        poolWaiting,
        /** The project's deposits in the pool, soonest unlock first; null when the pool can't list them (the sandbox's). */
        poolEntries: held
          ? [...held]
              .sort((a, b) => (a.unlockTime < b.unlockTime ? -1 : a.unlockTime > b.unlockTime ? 1 : 0))
              .map((e) => ({ token: e.token, value: e.stableTokenValue, unlock: e.unlockTime }))
          : null,
        unlockedPrincipal: userStatus ? userStatus[3] : 0n,
        lockedPrincipal: userStatus ? userStatus[4] : 0n,
        earningsCollected: userStatus ? userStatus[6] : 0n,
        requests,
        /** Null when the lens couldn't be read: the page works it out from the deposits instead. */
        overdue: ok(overdue),
        fees,
        lemxPrice: ok(lemxPrice),
        lemxLockable,
        swap,
      };
    },
  });

/** One wallet's investor type on a project (0 none, 1 US, 2 International). */
export const classQuery = (client: PublicClient | undefined, project: Address, wallet: Address | null) =>
  queryOptions({
    queryKey: ['fund-class', project, wallet],
    enabled: Boolean(client && wallet),
    queryFn: () => client!.readContract({ address: project, abi: projectAbi, functionName: 'investorClass', args: [wallet!] }),
  });

/** Investor types for a list of wallets (the manage page's investor list). */
export const classesQuery = (client: PublicClient | undefined, project: Address, wallets: readonly Address[]) =>
  queryOptions({
    queryKey: ['fund-classes', project, wallets.join()],
    enabled: Boolean(client && wallets.length),
    queryFn: () =>
      client!.multicall({
        allowFailure: false,
        contracts: wallets.map((w) => ({ address: project, abi: projectAbi, functionName: 'investorClass', args: [w] }) as const),
      }),
  });

/** Whether a wallet holds a role (the Access tab checks one address at a time). */
export const hasRoleQuery = (client: PublicClient | undefined, project: Address, role: Role, wallet: Address | null) =>
  queryOptions({
    queryKey: ['fund-hasrole', project, role, wallet],
    enabled: Boolean(client && wallet),
    queryFn: () => client!.readContract({ address: project, abi: projectAbi, functionName: 'hasRole', args: [ROLE_ID[role], wallet!] }),
  });

export type ProjectData = NonNullable<ReturnType<typeof useProjectState>['data']>;
export type UpkeepData = Awaited<ReturnType<NonNullable<ReturnType<typeof upkeepQuery>['queryFn']>>>;
export type Deposit = NonNullable<ReturnType<typeof useDeposits>['data']>[number];

export const useLinkCheck = (trust: Trust, project: Address) => useQuery(linkQuery(usePublicClient(), trust, project));
export const useProjectState = (lens: Address, project: Address, enabled: boolean) =>
  useQuery(projectQuery(usePublicClient(), lens, project, enabled));
export const useDeposits = (project: Address, enabled: boolean) => useQuery(depositsQuery(usePublicClient(), project, enabled));
export const useWallet = (project: Address, token: Address | undefined, account: Address | undefined) =>
  useQuery(walletQuery(usePublicClient(), project, token, account));

/** Re-read a project's state, deposits and wallet figures (or only what the indexer serves), after a transaction. */
export function useRefreshProject() {
  const queryClient = useQueryClient();
  return useCallback(
    (project: Address, indexerOnly = false) =>
      queryClient.invalidateQueries({
        predicate: (q) => (indexerOnly ? q.queryKey[0] === 'fund-ix' : q.queryKey[0] !== 'fund-link') && same(String(q.queryKey[1]), project),
      }),
    [queryClient],
  );
}
