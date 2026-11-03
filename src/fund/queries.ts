// Live data for the wallet pages, read with contract calls only (no event
// logs: the public RPCs refuse eth_getLogs). Each read is a query option set,
// so a page can run one project's (useQuery) or several (useQueries):
//   link      the link check and the project's wiring, once per page load
//   project   raise, rates, status and payment health, every 30 s
//   deposits  every deposit record, every 30 s, once a wallet is connected
//   wallet    the wallet's approval, token balance and allowance
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { erc20Abi, multicall3Abi, type Address, type PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { projectAbi, projectFactoryAbi, projectLensAbi } from './abi';

/** The site's trusted factories, lens and owners (site.config.json "fund"). */
export interface Trust {
  factories: readonly Address[];
  lens: Address;
  trustedOwners: readonly Address[];
}

/** A listing linked to a project. */
export interface Listing {
  project: Address;
  title: string;
  /** Empty for a hidden listing, which has no page. */
  url: string;
}

export type LinkCheck =
  | { trusted: false; reason: string }
  | { trusted: true; token: { address: Address; decimals: number; symbol: string }; cycleDuration: bigint };

const REFRESH_MS = 30_000;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

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
        return { trusted: false, reason: `its owner ${owner.result} isn't in fund.trustedOwners` };
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

export type ProjectData = NonNullable<ReturnType<typeof useProjectState>['data']>;
export type Deposit = NonNullable<ReturnType<typeof useDeposits>['data']>[number];

export const useLinkCheck = (trust: Trust, project: Address) => useQuery(linkQuery(usePublicClient(), trust, project));
export const useProjectState = (lens: Address, project: Address, enabled: boolean) =>
  useQuery(projectQuery(usePublicClient(), lens, project, enabled));
export const useDeposits = (project: Address, enabled: boolean) => useQuery(depositsQuery(usePublicClient(), project, enabled));
export const useWallet = (project: Address, token: Address | undefined, account: Address | undefined) =>
  useQuery(walletQuery(usePublicClient(), project, token, account));

/** Re-read a project's state, deposits and wallet figures, after a transaction. */
export function useRefreshProject() {
  const queryClient = useQueryClient();
  return useCallback(
    (project: Address) =>
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== 'fund-link' && same(String(q.queryKey[1]), project),
      }),
    [queryClient],
  );
}
