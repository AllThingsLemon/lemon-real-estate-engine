// The activity feed: each indexed event as one plain line (the fund
// dashboard's lib/events.ts and components/Feed.tsx), in the site's words.
import { CLASS_NAMES, shortAddress } from '../format';
import { ROLE_ID, ROLES, ROLE_LABEL, OWNER_ROLE_ID } from '../roles';
import type { IxEvent } from './ix';
import { TipLink, relative } from './ui';
import { useV, type View } from './view';

export type Kind = 'money-in' | 'money-out' | 'investor' | 'admin' | 'system';
interface Described {
  title: string;
  detail?: string;
  amount?: string;
  kind: Kind;
}

/** Project.Bucket, in the order of the enum. */
export const BUCKETS = ['Interest reserve', 'Management reserve', 'Earnings', 'Repayment fund', 'Development funds', 'Set aside for LEMX', 'Principal waiting to be placed'] as const;
/** Project.Source. */
const SOURCES = ['Pool earnings', 'Matured pool principal', 'Company funding', 'Added money', 'Operations', 'Split', 'Rebalance', 'Repaid release'] as const;

export const FEED_GROUPS: Record<string, { label: string; names: string[] }> = {
  payments: { label: 'Investor payments', names: ['InterestPaid', 'InterestWaiting', 'BalloonPaid', 'DepositRenewed', 'MgmtFeePaid', 'MgmtFeeDeferred', 'DeferredMgmtFeePaid'] },
  money: {
    label: 'Money in and out',
    names: ['DepositRecorded', 'EarningsClaimed', 'InjectionApplied', 'BucketFunded', 'PayoffFunded', 'SplitExecuted', 'DevWithdrawn', 'PrincipalDeployed', 'LpWithdrawalRequested', 'LpWithdrawalClaimed'],
  },
  compound: { label: 'Buying LEMX', names: ['CompoundStarted', 'CompoundFloorEscalated', 'CompoundFinalized', 'LemxDeposited'] },
  admin: {
    label: 'Team and settings',
    names: [
      'RoleGranted',
      'RoleRevoked',
      'InvestorSet',
      'OwnershipTransferStarted',
      'OwnershipTransferred',
      'Paused',
      'Unpaused',
      'KillSwitchActivated',
      'KillSwitchCancelled',
      'ProjectClosed',
      'ProjectFilled',
      'ProjectFullyRepaid',
      'CompanyWalletProposed',
      'CompanyWalletChanged',
      'MgmtFeeWalletProposed',
      'MgmtFeeWalletChanged',
      'ProjectInitialized',
    ],
  },
};

const ROLE_BY_ID: Record<string, string> = { [OWNER_ROLE_ID]: 'Owner', ...Object.fromEntries(ROLES.map((r) => [ROLE_ID[r], ROLE_LABEL[r]])) };
const role = (id: string) => ROLE_BY_ID[id] ?? 'A';
const cls = (c: unknown) => CLASS_NAMES[Number(c)] ?? '—';
const who = (a: unknown) => (typeof a === 'string' ? shortAddress(a) : '—');
const ZERO = '0x0000000000000000000000000000000000000000';

export function describe(e: IxEvent, v: View): Described {
  const a = e.args;
  const amt = (x: unknown) => v.amount(String(x ?? 0));
  switch (e.name) {
    case 'DepositRecorded':
      return {
        kind: 'money-in',
        title: `${Number(a.kind) === 1 ? 'Recorded deposit' : 'Deposit'} #${a.depositId} · ${cls(a.class)}`,
        detail: `${who(a.investor)}${Number(a.kind) === 1 ? ` · ${amt(a.usdtIn)} received` : ''}`,
        amount: amt(a.principal),
      };
    case 'InterestPaid':
      return { kind: 'money-out', title: `Interest paid · deposit #${a.depositId}`, detail: `Cycle ${a.cycle} · ${cls(a.class)} · ${who(a.investor)}`, amount: amt(a.amount) };
    case 'InterestWaiting':
      return { kind: 'system', title: `Interest waiting for money · deposit #${a.depositId}`, detail: `Cycle ${a.cycle}: needs ${amt(a.needed)}, ${amt(a.reserveAvailable)} available` };
    case 'MgmtFeePaid':
      return { kind: 'money-out', title: 'Management fee paid', detail: `Deposit #${a.depositId} · cycle ${a.cycle}`, amount: amt(a.amount) };
    case 'MgmtFeeDeferred':
      return { kind: 'system', title: 'Management fee deferred', detail: `Deposit #${a.depositId} · cycle ${a.cycle} (paid late)`, amount: amt(a.amount) };
    case 'DeferredMgmtFeePaid':
      return { kind: 'money-out', title: 'Deferred management fees paid', amount: amt(a.amount) };
    case 'BalloonPaid':
      return { kind: 'money-out', title: `Principal repaid · deposit #${a.depositId}`, detail: `${cls(a.class)} · ${who(a.investor)}`, amount: amt(a.principal) };
    case 'DepositRenewed':
      return { kind: 'investor', title: `Deposit #${a.depositId} renewed`, detail: `Renewal fee paid to ${who(a.investor)}`, amount: amt(a.fee) };
    case 'EarningsClaimed':
      return { kind: 'money-in', title: 'Pool earnings collected', amount: amt(a.usdtReceived) };
    case 'Allocated':
      return { kind: 'system', title: `Shared out · ${SOURCES[Number(a.source)] ?? 'money'}`, detail: `reserve ${amt(a.toInterestReserve)} · fees ${amt(a.toMgmtReserve)} · earnings ${amt(a.toNetEarnings)}`, amount: amt(a.amount) };
    case 'InjectionApplied':
      return { kind: 'money-in', title: 'Money added', detail: `${who(a.funder)} · reserve ${amt(a.toInterestReserve)} · fees ${amt(a.toMgmtReserve)} · earnings ${amt(a.toNetEarnings)}`, amount: amt(a.total) };
    case 'BucketFunded':
      return { kind: 'money-in', title: `${BUCKETS[Number(a.bucket)] ?? 'Bucket'} funded`, detail: who(a.funder), amount: amt(a.amount) };
    case 'BucketMoved':
      return { kind: 'system', title: `${BUCKETS[Number(a.from)]} → ${BUCKETS[Number(a.to)]}`, detail: SOURCES[Number(a.source)], amount: amt(a.amount) };
    case 'PayoffFunded':
      return { kind: 'money-in', title: `Repayment fund added to · ${SOURCES[Number(a.source)] ?? ''}`, detail: who(a.funder), amount: amt(a.amount) };
    case 'SplitExecuted':
      return { kind: 'admin', title: `Earnings split #${a.splitId}`, detail: `repayment ${amt(a.repay)} · development ${amt(a.dev)} · LEMX ${amt(a.compound)}` };
    case 'DevWithdrawn':
      return { kind: 'money-out', title: 'Development funds withdrawn', detail: `to ${who(a.to)}`, amount: amt(a.amount) };
    case 'PrincipalDeployed':
      return { kind: 'system', title: 'Principal placed in the pool', detail: a.feePaid && a.feePaid !== '0' ? `pool fee ${amt(a.feePaid)}` : undefined, amount: amt(a.amount) };
    case 'LpWithdrawalRequested':
      return { kind: 'system', title: `Pool withdrawal #${a.lpRequestId} requested`, amount: amt(a.amount) };
    case 'LpWithdrawalClaimed':
      return { kind: 'money-in', title: `Pool withdrawal #${a.lpRequestId} claimed`, amount: amt(a.usdtReceived) };
    case 'CompoundStarted':
      return { kind: 'admin', title: `LEMX purchase #${a.compoundId} started`, detail: `${a.slices} slices`, amount: amt(a.usdtAmount) };
    case 'CompoundFloorEscalated':
      return { kind: 'admin', title: `LEMX purchase #${a.compoundId}: floor lowered`, detail: who(a.by) };
    case 'CompoundFinalized':
      // Finishing and cancelling emit the same event; anything returned means it stopped before buying it all.
      return { kind: 'system', title: `LEMX purchase #${a.compoundId} ${BigInt(a.usdtReturned ?? 0) > 0n ? 'ended early' : 'finished'}`, detail: `spent ${amt(a.usdtSpent)} · returned ${amt(a.usdtReturned)}` };
    case 'LemxDeposited':
      return { kind: 'system', title: 'LEMX locked in the pool' };
    case 'InvestorSet':
      return Number(a.newClass) === 0
        ? { kind: 'investor', title: 'Investor approval removed', detail: who(a.investor) }
        : { kind: 'investor', title: `Investor ${Number(a.oldClass) === 0 ? 'approved' : 'changed'} · ${cls(a.newClass)}`, detail: who(a.investor) };
    case 'RoleGranted':
      return { kind: 'admin', title: `${role(a.role)} role granted`, detail: who(a.account) };
    case 'RoleRevoked':
      return { kind: 'admin', title: `${role(a.role)} role removed`, detail: who(a.account) };
    case 'OwnershipTransferStarted':
      return { kind: 'admin', title: 'Ownership offered', detail: `to ${who(a.pending)}` };
    case 'OwnershipTransferred':
      return { kind: 'admin', title: a.previous === ZERO ? 'Project created' : 'Ownership transferred', detail: `owner ${who(a.current)}` };
    case 'Paused':
      return { kind: 'admin', title: 'Project paused', detail: who(a.account) };
    case 'Unpaused':
      return { kind: 'admin', title: 'Project resumed', detail: who(a.account) };
    case 'KillSwitchActivated':
      return { kind: 'admin', title: 'Deposits stopped', detail: who(a.by) };
    case 'KillSwitchCancelled':
      return { kind: 'admin', title: 'Deposits resumed', detail: who(a.by) };
    case 'ProjectClosed':
      return { kind: 'admin', title: 'Raise closed', amount: amt(a.totalRaised) };
    case 'ProjectFilled':
      return { kind: 'admin', title: 'Raise filled', amount: amt(a.totalRaised) };
    case 'ProjectFullyRepaid':
      return { kind: 'admin', title: 'Project fully repaid' };
    case 'CompanyWalletProposed':
    case 'MgmtFeeWalletProposed':
      return { kind: 'admin', title: `${e.name.startsWith('Company') ? 'Company' : 'Fee'} wallet change proposed`, detail: `to ${who(a.proposed)}` };
    case 'CompanyWalletChanged':
    case 'MgmtFeeWalletChanged':
      return { kind: 'admin', title: `${e.name.startsWith('Company') ? 'Company' : 'Fee'} wallet changed`, detail: `${who(a.previous)} → ${who(a.current)}` };
    case 'ProjectInitialized':
      return { kind: 'admin', title: 'Project set up' };
    default:
      return { kind: 'system', title: e.name.replace(/([a-z])([A-Z])/g, '$1 $2') };
  }
}

export function Feed({ items }: { items: IxEvent[] }) {
  const v = useV();
  const explorer = v.chain.blockExplorers?.default.url;
  return (
    <ul className="mg-feed">
      {items.map((e) => {
        const d = describe(e, v);
        return (
          <li key={`${e.block}:${e.log_index}`}>
            <span className={`mg-dot mg-dot-${d.kind}`} aria-hidden="true" />
            <div>
              <div className="mg-feed-line">
                <span>{d.title}</span>
                {d.amount && <span className="mg-num">{d.amount}</span>}
              </div>
              <div className="mg-feed-meta">
                {d.detail && <span>{d.detail}</span>}
                {explorer ? (
                  <TipLink tip={`${new Date(e.block_time * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Opens the transaction in the block explorer.`} href={`${explorer}/tx/${e.tx_hash}`} className="mg-feed-time" external>
                    {relative(e.block_time, v.now)} <span aria-hidden="true">↗</span>
                    <span className="mg-sr"> (opens the transaction)</span>
                  </TipLink>
                ) : (
                  <span>{relative(e.block_time, v.now)}</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
