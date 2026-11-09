// One project's live state for /manage/, read from the chain only, and the
// rules that turn it into the project's health and its Needs attention list.
// The rules are the fund dashboard's (real-estate-fund dashboard/src/data/
// derive.ts), on the engine's reads.
import { queryOptions, useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { zeroAddress, type Address, type Chain, type PublicClient } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { projectAbi } from '../abi';
import { NONE, formatAmount } from '../format';
import { cyclesOwed } from '../positions';
import {
  depositsQuery,
  projectQuery,
  rolesQuery,
  upkeepQuery,
  useLinkCheck,
  type Deposit,
  type Listing,
  type ProjectData,
  type Roles,
  type Trust,
  type UpkeepData,
} from '../queries';
import { ROLE_LABEL, type Role } from '../roles';
import { useChainNow } from '../ui';

/** A role an action needs. The owner is a single wallet rather than a role holder list. */
export type Need = Role | 'OWNER';
export const NEED_LABEL: Record<Need, string> = { OWNER: 'Owner', ...ROLE_LABEL };

const PCT = 100_000_000n;
/** A project page re-reads the chain this often (the investor pages every 30 s). */
const REFRESH_MS = 12_000;
const NO_SWAP = `0x${'0'.repeat(64)}`;

/** Totals the dashboard shows that the other wallet pages don't read. */
const ledgerQuery = (client: PublicClient | undefined, project: Address, enabled: boolean) =>
  queryOptions({
    queryKey: ['fund-ledger', project],
    enabled: enabled && Boolean(client),
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const [monthlyMgmtFee, compoundMinPrice, usPaid, globalPaid, usRepaid, globalRepaid, owner, pendingOwner, companyWallet, pendingCompanyWallet, mgmtFeeWallet, pendingMgmtFeeWallet] =
        await client!.multicall({
          allowFailure: false,
          contracts: [
            { address: project, abi: projectAbi, functionName: 'monthlyMgmtFee' },
            { address: project, abi: projectAbi, functionName: 'compoundMinPrice' },
            { address: project, abi: projectAbi, functionName: 'interestPaidByClass', args: [1] },
            { address: project, abi: projectAbi, functionName: 'interestPaidByClass', args: [2] },
            { address: project, abi: projectAbi, functionName: 'principalRepaidByClass', args: [1] },
            { address: project, abi: projectAbi, functionName: 'principalRepaidByClass', args: [2] },
            { address: project, abi: projectAbi, functionName: 'owner' },
            { address: project, abi: projectAbi, functionName: 'pendingOwner' },
            { address: project, abi: projectAbi, functionName: 'companyWallet' },
            { address: project, abi: projectAbi, functionName: 'pendingCompanyWallet' },
            { address: project, abi: projectAbi, functionName: 'mgmtFeeWallet' },
            { address: project, abi: projectAbi, functionName: 'pendingMgmtFeeWallet' },
          ],
        });
      const orNull = (a: Address) => (a === zeroAddress ? null : a);
      return {
        monthlyMgmtFee,
        compoundMinPrice,
        interestPaid: { us: usPaid, global: globalPaid },
        principalRepaid: { us: usRepaid, global: globalRepaid },
        /** The project's wallets and any handover waiting, readable without a wallet connected. */
        wallets: {
          owner,
          pendingOwner: orNull(pendingOwner),
          companyWallet,
          pendingCompanyWallet: orNull(pendingCompanyWallet),
          mgmtFeeWallet,
          pendingMgmtFeeWallet: orNull(pendingMgmtFeeWallet),
        },
      };
    },
  });

export type State = ProjectData['state'];
export type Ledger = Awaited<ReturnType<NonNullable<ReturnType<typeof ledgerQuery>['queryFn']>>>;

export interface View {
  listing: Listing;
  chain: Chain;
  account?: Address;
  token: { address: Address; decimals: number; symbol: string };
  cycle: bigint;
  s: State;
  config: ProjectData['config'];
  nextDue: bigint;
  payCursor: bigint;
  deposits: readonly Deposit[];
  /** The connected wallet's roles and the project's wallets; null without a wallet. */
  roles: Roles | null;
  /** The pool and lens reads, with deposits past maturity always known. */
  u: UpkeepData & { overdue: readonly bigint[] };
  ledger: Ledger;
  /** The chain's time. */
  now: bigint;
  /** Times of day matter when cycles are shorter than a day (the sandbox). */
  withTime: boolean;
  /**
   * Show the International class: its rate differs, or it has principal
   * outstanding. A project created with equal rates reads as one class.
   */
  twoClasses: boolean;
  /** "12,345.67 tUSDT". */
  amount: (v: bigint | string, dp?: number) => string;
  /** Cycles owed by each unrepaid deposit with any owed. */
  owed: Map<bigint, bigint>;
  /** Interest owed across those deposits. */
  backlog: bigint;
  /** The next deposit in the repayment line. */
  head: Deposit | null;
  perCycle: (d: Deposit) => bigint;
  can: (need: Need | null) => boolean;
}

export type ViewState = { status: 'loading' } | { status: 'untrusted'; reason: string } | { status: 'error'; error: unknown } | { status: 'ready'; v: View };

export function useView(listing: Listing, trust: Trust, chain: Chain): ViewState {
  const client = usePublicClient();
  const { address: account } = useAccount();
  const { project } = listing;
  const link = useLinkCheck(trust, project);
  const trusted = link.data?.trusted === true;
  const state = useQuery({ ...projectQuery(client, trust.lens, project, trusted), refetchInterval: REFRESH_MS });
  const deposits = useQuery({ ...depositsQuery(client, project, trusted), refetchInterval: REFRESH_MS });
  const roles = useQuery({ ...rolesQuery(client, project, account, trusted), refetchInterval: REFRESH_MS });
  const upkeep = useQuery({ ...upkeepQuery(client, trust.lens, project, trusted), refetchInterval: REFRESH_MS });
  const ledger = useQuery(ledgerQuery(client, project, trusted));
  const now = useChainNow(state.data?.clockOffset);

  if (link.data && !link.data.trusted) return { status: 'untrusted', reason: link.data.reason };
  const error = link.error ?? state.error ?? deposits.error ?? upkeep.error ?? ledger.error;
  if (error && !(state.data && deposits.data && upkeep.data && ledger.data)) return { status: 'error', error };
  if (!link.data?.trusted || !state.data || !deposits.data || !upkeep.data || !ledger.data || (account && roles.isPending)) return { status: 'loading' };

  const { token, cycleDuration } = link.data;
  const s = state.data.state;
  const perCycle = (d: Deposit) => (d.principal * d.rate) / PCT;
  const owed = new Map<bigint, bigint>();
  let backlog = 0n;
  for (const d of deposits.data) {
    if (d.id < s.nextPayoffId) continue;
    const n = cyclesOwed(d, cycleDuration, now);
    if (n > 0n) {
      owed.set(d.id, n);
      backlog += n * perCycle(d);
    }
  }
  // Deposits past maturity and not repaid: from the lens, or from the deposits if it couldn't be read.
  const overdue = upkeep.data.overdue ?? deposits.data.filter((d) => d.id >= s.nextPayoffId && !d.repaid && d.maturity <= now).map((d) => d.id);
  const r = account ? (roles.data ?? null) : null;
  const can = (need: Need | null) => !need || (!!r && (need === 'OWNER' ? r.isOwner : r.roles.includes(need)));
  return {
    status: 'ready',
    v: {
      listing,
      chain,
      account,
      token,
      cycle: cycleDuration,
      s,
      config: state.data.config,
      nextDue: state.data.nextDue,
      payCursor: state.data.payCursor,
      deposits: deposits.data,
      roles: r,
      u: { ...upkeep.data, overdue },
      ledger: ledger.data,
      now,
      withTime: cycleDuration < 86400n,
      twoClasses: state.data.config.usInterestRate !== state.data.config.globalInterestRate || s.globalPrincipal > 0n,
      amount: (v, dp = 2) => `${formatAmount(BigInt(v), token.decimals, dp)} ${token.symbol}`,
      owed,
      backlog,
      head: s.nextPayoffId < s.depositCount ? (deposits.data[Number(s.nextPayoffId)] ?? null) : null,
      perCycle,
      can,
    },
  };
}

export const ViewContext = createContext<View>(null as never);
export const useV = () => useContext(ViewContext);

// ---------- Health and the Needs attention list ----------

export type Health = 'ok' | 'due' | 'attention' | 'late' | 'repaid';
export const HEALTH_LABEL: Record<Health, string> = { ok: 'On track', due: 'Payments due', attention: 'Needs attention', late: 'Late', repaid: 'Fully repaid' };

export type Section = 'overview' | 'raise' | 'investors' | 'earnings' | 'surplus' | 'repayment' | 'activity' | 'settings';

/** Actions a task runs in one click (no input needed). */
export type QuickAction =
  | 'sweep'
  | 'payInvestors'
  | 'deployPrincipal'
  | 'payoffNext'
  | 'finalizeCompound'
  | 'depositHeldLemx'
  | 'requestMaturedPrincipal'
  | 'claimLpWithdrawal'
  | 'acceptOwnership'
  | 'acceptCompanyWallet'
  | 'acceptMgmtFeeWallet';

export interface Task {
  id: string;
  severity: 'critical' | 'action' | 'info';
  title: string;
  detail: string;
  amount?: bigint;
  /** One-click action (open to any wallet unless `need` is set). */
  quick?: { action: QuickAction; label: string; arg?: bigint };
  /** Where the full flow lives. */
  section: Section;
  need: Need | null;
}

export interface Derived {
  health: Health;
  /** Payments are current: nextDue is still ahead (the contract's PaymentsLate rule). */
  current: boolean;
  /** A due cycle is waiting for money (blockedFrom is set). */
  waiting: boolean;
  /** The waiting cycle is covered now (reserve plus earnings): the next payment run pays it. */
  covered: boolean;
  /**
   * The cycle a payment run would try first, when the interest reserve and
   * earnings can't cover it: the run would pay nothing, so Pay investors waits
   * for money. `short` is how much more it needs.
   */
  stuck: { id: bigint; short: bigint } | null;
  compounding: boolean;
  tasks: Task[];
}

/** Below one cent of the token: reads as empty and raises no task (deployPrincipal can leave 1 wei). */
export const dust = (v: View) => 10n ** BigInt(Math.max(v.token.decimals - 2, 0));

export function healthOf(s: State, x: { current: boolean; overdue: boolean }): Health {
  if (s.fullyRepaid) return 'repaid';
  if (s.blockedFrom !== NONE || x.overdue) return 'late';
  if (!x.current && s.depositCount > 0n) return 'due';
  if (s.mgmtFeeDeferred > 0n || (s.interestReserve < s.interestTarget && s.monthlyInterestOwed > 0n)) return 'attention';
  return 'ok';
}

/** LEMX per token from the price feed (USD per LEMX, 8 decimals), 18 decimals; 0 when there's no price. */
export const lemxMarket = (u: UpkeepData) => (u.lemxPrice ? 10n ** 26n / u.lemxPrice : 0n);

/** Slices in the LEMX purchase: those done plus those its remaining USDT still covers. */
export function swapSlices(swap: NonNullable<UpkeepData['swap']>) {
  const left = swap.amountPerSwap > 0n ? (swap.srcLeft + swap.amountPerSwap - 1n) / swap.amountPerSwap : 0n;
  return { done: swap.completed, total: swap.completed + left };
}

export function derive(v: View): Derived {
  const { s, u, now } = v;
  const t: Task[] = [];
  const current = v.nextDue > now;
  const waiting = s.blockedFrom !== NONE;
  // A payment run starts at the waiting deposit or the sweep cursor (as payDue
  // requires) and stops at the first cycle it can't pay in full.
  const from = waiting && s.blockedFrom < v.payCursor ? s.blockedFrom : v.payCursor;
  const firstOwed = [...v.owed.keys()].filter((id) => id >= from).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
  const next = waiting ? v.deposits[Number(s.blockedFrom)] : firstOwed !== undefined ? v.deposits[Number(firstOwed)] : undefined;
  const have = s.interestReserve + s.netEarnings;
  const stuck = next && (waiting || !current) && v.perCycle(next) > have ? { id: next.id, short: v.perCycle(next) - have } : null;
  const covered = waiting && !stuck;
  const compounding = s.activeSwapId !== NO_SWAP;
  const amount = v.amount;

  // Payments: what investors are owed comes first.
  if (waiting && covered)
    t.push({
      id: 'waiting',
      severity: 'critical',
      title: `Interest payment waiting (deposit #${s.blockedFrom}): the money is in`,
      detail: 'The interest reserve and earnings cover it now. Pay investors to catch up, oldest deposit first.',
      amount: v.backlog || undefined,
      quick: { action: 'payInvestors', label: 'Pay investors' },
      section: 'earnings',
      need: null,
    });
  else if (waiting)
    t.push({
      id: 'waiting',
      severity: 'critical',
      title: `Interest payment waiting for money (deposit #${s.blockedFrom})`,
      detail: `Its next cycle needs ${amount(stuck?.short ?? 0n)} more than the interest reserve and earnings hold. Collect pool earnings or add money, then pay investors. Nothing is skipped or forgiven.`,
      amount: v.backlog || undefined,
      quick: u.poolEarnings > 0n ? { action: 'sweep', label: 'Collect earnings' } : undefined,
      section: 'earnings',
      need: null,
    });
  else if (!current && s.depositCount > 0n && !s.fullyRepaid)
    t.push({
      id: 'pay',
      severity: 'action',
      title: v.owed.size ? `Interest due on ${v.owed.size} deposit${v.owed.size === 1 ? '' : 's'}` : 'Payment run needed',
      detail: stuck
        ? `The interest reserve and earnings are ${amount(stuck.short)} short of deposit #${stuck.id}'s next cycle, so a payment run would pay nothing. Collect pool earnings or add money first.`
        : v.owed.size
          ? 'Pay investors pays every due cycle, oldest deposit first. Splitting earnings and development withdrawals wait until it has run.'
          : "Nothing is owed, but a payment run has to confirm it before earnings can be split or development funds withdrawn.",
      amount: v.backlog || undefined,
      // A run that can't pay the first cycle in line pays nothing, so it isn't offered then.
      quick: !stuck ? { action: 'payInvestors', label: 'Pay investors' } : u.poolEarnings > 0n ? { action: 'sweep', label: 'Collect earnings' } : undefined,
      section: 'earnings',
      need: null,
    });

  // The next deposit in line and other matured ones. A matured, unrepaid
  // deposit is late even when the repayment fund covers it, until it's repaid.
  const head = v.head;
  const headOverdue = !!head && !head.repaid && BigInt(head.maturity) <= now;
  if (head && !head.repaid) {
    // payoffNext pays the deposit's due cycles first, which fails while it's the one waiting.
    const headBlocked = waiting && s.blockedFrom === head.id;
    const covered = s.payoffPool >= head.principal;
    if (covered && !headBlocked)
      t.push({
        id: 'payoff',
        severity: headOverdue ? 'critical' : 'action',
        title: headOverdue ? `Deposit #${head.id} is past maturity, and the repayment fund covers it` : `The repayment fund covers deposit #${head.id}`,
        detail: 'Repay the next deposit in line. Its due interest is paid first.',
        amount: head.principal,
        quick: { action: 'payoffNext', label: 'Repay' },
        section: 'repayment',
        need: null,
      });
    else if (headOverdue)
      t.push({
        id: 'overdue',
        severity: 'critical',
        title: `Deposit #${head.id} has matured and isn't repaid`,
        detail: covered
          ? 'The repayment fund covers it, but its interest is waiting for money, which has to be paid before it can be repaid.'
          : `The repayment fund is ${amount(head.principal - s.payoffPool)} short. Add repayment money, split earnings to repayment, or renew the deposit.`,
        amount: covered ? undefined : head.principal - s.payoffPool,
        section: 'repayment',
        need: null,
      });
  }
  const otherOverdue = u.overdue.filter((id) => !head || id !== head.id);
  if (otherOverdue.length)
    t.push({
      id: 'overdue-more',
      severity: 'critical',
      title: `${otherOverdue.length} more matured deposit${otherOverdue.length === 1 ? '' : 's'} waiting to be repaid`,
      detail: `Deposits ${otherOverdue.map((x) => `#${x}`).join(', ')} are past maturity. Repayment goes first in, first out.`,
      section: 'repayment',
      need: null,
    });

  // Money that can move now.
  if (u.poolEarnings > 0n && !waiting)
    t.push({
      id: 'sweep',
      severity: 'action',
      title: 'Pool earnings ready to collect',
      detail: 'Collecting fills the interest reserve, then the management reserve, and the rest becomes earnings.',
      amount: u.poolEarnings,
      quick: { action: 'sweep', label: 'Collect' },
      section: 'earnings',
      need: null,
    });
  if (s.undeployedPrincipal >= dust(v)) {
    const ready = u.poolMinimum !== null && s.undeployedPrincipal >= u.poolMinimum;
    t.push(
      ready
        ? {
            id: 'deploy',
            severity: 'action',
            title: 'Principal ready to place in the pool',
            detail: "Lend raised principal into the liquidity pool so it starts earning.",
            amount: s.undeployedPrincipal,
            quick: { action: 'deployPrincipal', label: 'Place it' },
            section: 'raise',
            need: null,
          }
        : {
            id: 'deploy-wait',
            severity: 'info',
            title: "Principal waiting for the pool's minimum",
            detail: `It's below the pool's minimum deposit${u.poolMinimum !== null ? ` (${amount(u.poolMinimum)})` : ''}, and goes in once more is raised.`,
            amount: s.undeployedPrincipal,
            section: 'raise',
            need: null,
          },
    );
  }
  if (u.unlockedPrincipal > 0n)
    t.push({
      id: 'unlocked',
      severity: 'action',
      title: 'Pool principal has unlocked',
      detail: 'Ask the pool for it. Once the pool funds the withdrawal, claim it into earnings.',
      amount: u.unlockedPrincipal,
      quick: { action: 'requestMaturedPrincipal', label: 'Request it' },
      section: 'repayment',
      need: null,
    });
  for (const r of u.requests ?? [])
    t.push(
      r.ready
        ? {
            id: `claim-${r.id}`,
            severity: 'action',
            title: `Pool withdrawal #${r.id} to claim`,
            detail: 'The pool has funded it. Claiming adds it to earnings.',
            amount: r.amount,
            quick: { action: 'claimLpWithdrawal', label: 'Claim', arg: r.id },
            section: 'repayment',
            need: null,
          }
        : {
            id: `claim-${r.id}`,
            severity: 'info',
            title: `Pool withdrawal #${r.id} requested`,
            detail: "It's waiting for the pool to fund it (the money is lent out). Nothing to do yet.",
            amount: r.amount,
            section: 'repayment',
            need: null,
          },
    );

  // Compounding.
  if (compounding && u.swap) {
    const n = swapSlices(u.swap);
    const market = lemxMarket(u);
    t.push(
      u.swap.done
        ? { id: 'finalize', severity: 'action', title: 'LEMX purchase finished', detail: 'Collect the LEMX bought and lock it in the pool, or hold it while it’s below the pool’s minimum.', quick: { action: 'finalizeCompound', label: 'Finish' }, section: 'surplus', need: null }
        : market > 0n && market < v.ledger.compoundMinPrice
        ? {
            id: 'compounding',
            severity: 'action',
            title: `Buying LEMX: the market is below the floor (${n.done} of ${n.total} slices filled)`,
            detail: 'The price feed puts LEMX under the floor, so slices are likely being skipped. Lower the floor to keep buying, or wait for the price to come back.',
            amount: s.compoundInFlight,
            section: 'surplus',
            need: null,
          }
        : {
            id: 'compounding',
            severity: 'info',
            title: `Buying LEMX: ${n.done} of ${n.total} slices filled`,
            detail: 'The purchase buys LEMX in slices, at or above the floor price.',
            amount: s.compoundInFlight,
            section: 'surplus',
            need: null,
          },
    );
  } else if (s.lemxHeld > 0n)
    t.push(
      u.lemxLockable
        ? { id: 'held', severity: 'action', title: 'LEMX waiting to be locked', detail: "It was below the pool's minimum when the purchase finished. Lock it now.", quick: { action: 'depositHeldLemx', label: 'Lock LEMX' }, section: 'surplus', need: null }
        : { id: 'held', severity: 'info', title: 'LEMX waiting to be locked', detail: "It's still below the pool's minimum deposit. It can be locked once a later purchase adds to it.", section: 'surplus', need: null },
    );

  // The manager's decisions, once investors are current.
  if (current && !waiting) {
    if (s.netEarnings > 0n)
      t.push({
        id: 'split',
        severity: 'action',
        title: 'Earnings ready to split',
        detail: s.fullyRepaid ? 'Split earnings between development funds and buying LEMX.' : 'Split earnings between repaying investors, development funds and buying LEMX.',
        amount: s.netEarnings,
        section: 'surplus',
        need: 'MANAGER_ROLE',
      });
    if (s.devBalance > 0n && s.mgmtFeeDeferred === 0n && !s.paused)
      t.push({ id: 'dev', severity: 'action', title: 'Development funds available', detail: 'Withdraw them to the company wallet.', amount: s.devBalance, section: 'surplus', need: 'MANAGER_ROLE' });
    if (s.compoundPending > 0n && !compounding)
      t.push({ id: 'compound', severity: 'action', title: 'Money set aside to buy LEMX', detail: 'Start the LEMX purchase.', amount: s.compoundPending, section: 'surplus', need: 'MANAGER_ROLE' });
  }

  // Warnings.
  if (s.mgmtFeeDeferred > 0n)
    t.push({ id: 'deferred', severity: 'info', title: 'Management fees deferred', detail: "Fees the management reserve couldn't cover. They're paid from it first, once payments are current and it has money; until then development withdrawals wait. Add money or pool earnings refill it.", amount: s.mgmtFeeDeferred, section: 'earnings', need: null });
  if (s.interestReserve < s.interestTarget && !s.fullyRepaid && s.monthlyInterestOwed > 0n)
    t.push({
      id: 'reserve',
      severity: 'info',
      title: 'Interest reserve below target',
      detail: `Holding ${amount(s.interestReserve)} of its ${amount(s.interestTarget)} target (two cycles of interest). Pool earnings or added money refill it.`,
      amount: s.interestTarget - s.interestReserve,
      section: 'earnings',
      need: null,
    });

  // Handovers waiting on the connected wallet.
  const r = v.roles;
  if (r?.isPendingOwner)
    t.push({ id: 'accept-owner', severity: 'action', title: 'Ownership offered to you', detail: 'Accept to become the project owner.', quick: { action: 'acceptOwnership', label: 'Accept ownership' }, section: 'settings', need: null });
  if (r?.isCompanyWallet && r.pendingCompanyWallet)
    t.push({ id: 'accept-company', severity: 'action', title: 'Company wallet change waiting on you', detail: `Accept moving the company wallet to ${r.pendingCompanyWallet}.`, quick: { action: 'acceptCompanyWallet', label: 'Accept' }, section: 'settings', need: null });
  if (r?.isFeeWallet && r.pendingMgmtFeeWallet)
    t.push({ id: 'accept-fee', severity: 'action', title: 'Fee wallet change waiting on you', detail: `Accept moving the management fee wallet to ${r.pendingMgmtFeeWallet}.`, quick: { action: 'acceptMgmtFeeWallet', label: 'Accept' }, section: 'settings', need: null });

  const rank = { critical: 0, action: 1, info: 2 };
  t.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { health: healthOf(s, { current, overdue: headOverdue || otherOverdue.length > 0 }), current, waiting, covered, stuck, compounding, tasks: t };
}

export const DerivedContext = createContext<Derived>(null as never);
export const useD = () => useContext(DerivedContext);
