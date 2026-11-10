// The project's flows, run as jobs (ui.tsx useJob): one or more transactions
// and a closing line saying what happened. The forms check their inputs; the
// contract still has the final say, and its refusal shows in plain words.
import { useSyncExternalStore } from 'react';
import { parseEventLogs, type PublicClient, type TransactionReceipt } from 'viem';
import { projectAbi } from '../abi';
import { NONE } from '../format';
import { same } from '../queries';
import { plural } from '../ui';
import type { JobCtx } from './ui';
import type { QuickAction, View } from './view';

/** Deposits per payDue call: keeps each transaction well under the block gas limit. */
export const PAY_BATCH = 50n;

/** The project's events in a receipt, decoded, in log order. */
const projectEvents = (rc: TransactionReceipt, v: View) => parseEventLogs({ abi: projectAbi, logs: rc.logs }).filter((l) => same(l.address, v.listing.project));

/** The arguments of each event of this name the project emitted in a receipt. */
const events = (rc: TransactionReceipt, v: View, name: string) =>
  projectEvents(rc, v)
    .filter((e) => e.eventName === name)
    .map((e) => e.args as Record<string, unknown>);

/** How many of an event the project emitted in a receipt, and their amounts added up. */
export function count(rc: TransactionReceipt, v: View, name: string): { n: number; total: bigint } {
  const found = events(rc, v, name);
  const total = found.reduce((t, a) => t + BigInt((a.amount ?? a.usdtReceived ?? a.principal ?? 0n) as bigint), 0n);
  return { n: found.length, total };
}

/**
 * Where the LEMX went when a purchase finished or was cancelled: locked in
 * the pool, or held because it's below the pool's minimum. Empty if none was bought.
 */
export function lemxOutcome(rc: TransactionReceipt, v: View): string {
  if (events(rc, v, 'LemxDeposited').length) return 'The LEMX bought is locked in the pool.';
  const bought = events(rc, v, 'CompoundFinalized').reduce((t, a) => t + (a.lemxReceived as bigint), 0n);
  return bought > 0n ? "The LEMX bought is below the pool's minimum, so it's held until there's enough to lock." : '';
}

/** What a payment run did, added up over its transactions. */
interface PayTally {
  /** Interest paid per deposit: cycles and amount. */
  interest: Map<bigint, { cycles: number; amount: bigint }>;
  /** Management fees sent to the fee wallet, deferred ones paid off included. */
  feesPaid: bigint;
  /** Fees still deferred after the run's last fee event; null if no fee was deferred or paid off. */
  deferredLeft: bigint | null;
  /** The deposit the run stopped at, and how much more its cycle needed. */
  waiting: { id: bigint; short: bigint } | null;
}

function tallyReceipt(t: PayTally, rc: TransactionReceipt, v: View) {
  // In log order: a fee deferred early in a run can be paid off by the end of it.
  for (const e of projectEvents(rc, v)) {
    if (e.eventName === 'InterestPaid') {
      const prev = t.interest.get(e.args.depositId) ?? { cycles: 0, amount: 0n };
      t.interest.set(e.args.depositId, { cycles: prev.cycles + 1, amount: prev.amount + e.args.amount });
    } else if (e.eventName === 'MgmtFeePaid') t.feesPaid += e.args.amount;
    else if (e.eventName === 'DeferredMgmtFeePaid') {
      t.feesPaid += e.args.amount;
      t.deferredLeft = e.args.deferredAfter;
    } else if (e.eventName === 'MgmtFeeDeferred') t.deferredLeft = e.args.deferredAfter;
    else if (e.eventName === 'InterestWaiting') t.waiting = { id: e.args.depositId, short: e.args.needed - e.args.reserveAvailable };
  }
}

/** The closing line of a payment run: what each deposit got, the fees, and what's still waiting (or due). */
function paySummary(t: PayTally, v: View, current: boolean) {
  const parts: string[] = [];
  const paid = [...t.interest].sort(([a], [b]) => (a < b ? -1 : 1));
  if (paid.length) {
    const total = paid.reduce((s, [, x]) => s + x.amount, 0n);
    const each = paid.map(([id, x], i) => `${i ? '#' : 'deposit #'}${id} (${plural(x.cycles, 'cycle')})`).join(', ');
    parts.push(`Paid ${v.amount(total)} of interest: ${each}.`);
  } else parts.push('No interest paid.');
  const fees = [
    t.feesPaid ? `${v.amount(t.feesPaid)} paid to the fee wallet` : '',
    t.deferredLeft ? `${v.amount(t.deferredLeft)} deferred until the management reserve has money` : '',
  ].filter(Boolean);
  if (fees.length) parts.push(`Management fees: ${fees.join('; ')}.`);
  if (t.waiting) parts.push(`Deposit #${t.waiting.id} is waiting: its next cycle needs ${v.amount(t.waiting.short)} more. Add money or collect pool earnings, then pay again.`);
  else parts.push(current ? 'Investors are current.' : 'More cycles are due: run it again.');
  return parts.join(' ');
}

// The last payment run per project, so the Investor payments card keeps
// showing what it did after the toast goes. Lost on reload.
const lastRuns = new Map<string, { text: string; at: bigint }>();
const runListeners = new Set<() => void>();
const subscribeRuns = (onChange: () => void) => {
  runListeners.add(onChange);
  return () => runListeners.delete(onChange);
};
export const useLastPayRun = (project: string) => useSyncExternalStore(subscribeRuns, () => lastRuns.get(project.toLowerCase()));

/**
 * Pay every due cycle, oldest deposit first: payDue in batches from the
 * cursor until payments are current, or until a cycle has to wait for money
 * (reported, not an error: nothing is skipped).
 */
export async function payInvestors(ctx: JobCtx, v: View, client: PublicClient) {
  const p = v.listing.project;
  const read = <T,>(functionName: 'payCursor' | 'nextDue' | 'blockedFrom') => client.readContract({ address: p, abi: projectAbi, functionName }) as Promise<T>;
  const t: PayTally = { interest: new Map(), feesPaid: 0n, deferredLeft: null, waiting: null };
  const finish = (text: string, at: bigint) => {
    lastRuns.set(p.toLowerCase(), { text, at });
    runListeners.forEach((l) => l());
    ctx.done(text);
  };
  for (let run = 1; run <= 25; run++) {
    const [cursor, nextDue, blocked, block] = await Promise.all([read<bigint>('payCursor'), read<bigint>('nextDue'), read<bigint>('blockedFrom'), client.getBlock()]);
    if (nextDue > block.timestamp && blocked === NONE) {
      return finish(run === 1 ? 'Payments were already current.' : paySummary(t, v, true), block.timestamp);
    }
    const from = blocked !== NONE && blocked < cursor ? blocked : cursor;
    const rc = await ctx.send(run === 1 ? 'Pay investors' : `Pay investors (run ${run})`, { functionName: 'payDue', args: [from, PAY_BATCH] });
    tallyReceipt(t, rc, v);
    if (t.waiting) return finish(paySummary(t, v, false), block.timestamp);
  }
  finish(paySummary(t, v, false), (await client.getBlock()).timestamp);
}

/** The BNB fee a payable call sends: the pool's fee on deposits or on withdrawals. */
export const feeFor = (v: View, kind: 'deposit' | 'withdraw') => (v.u.fees ? v.u.fees[kind] : null);

/** One-click actions from the Needs attention list. */
export async function quick(ctx: JobCtx, v: View, client: PublicClient, action: QuickAction, arg?: bigint) {
  const fee = (kind: 'deposit' | 'withdraw') => feeFor(v, kind) || undefined;
  switch (action) {
    case 'payInvestors':
      return payInvestors(ctx, v, client);
    case 'sweep': {
      const rc = await ctx.send('Collect pool earnings', { functionName: 'sweep', value: fee('withdraw') });
      const c = count(rc, v, 'EarningsClaimed');
      return ctx.done(c.n ? `Collected ${v.amount(c.total)} into the reserves and earnings.` : 'Nothing new to collect.');
    }
    case 'deployPrincipal':
      await ctx.send('Place principal in the pool', { functionName: 'deployPrincipal', value: fee('deposit') });
      return ctx.done('Principal placed in the pool.');
    case 'payoffNext': {
      const rc = await ctx.send('Repay the next deposit', { functionName: 'payoffNext' });
      return ctx.done(`Repaid ${v.amount(count(rc, v, 'BalloonPaid').total)}.`);
    }
    case 'finalizeCompound': {
      const rc = await ctx.send('Finish buying LEMX', { functionName: 'finalizeCompound', value: fee('deposit') });
      return ctx.done(`Purchase finished. ${lemxOutcome(rc, v)}`.trim());
    }
    case 'depositHeldLemx':
      await ctx.send('Lock held LEMX', { functionName: 'depositHeldLemx', value: fee('deposit') });
      return ctx.done('LEMX locked in the pool.');
    case 'requestMaturedPrincipal':
      await ctx.send('Ask the pool for unlocked principal', { functionName: 'requestMaturedPrincipal' });
      return ctx.done('Withdrawal requested. Claim it once the pool funds it.');
    case 'claimLpWithdrawal': {
      const rc = await ctx.send(`Claim pool withdrawal #${arg}`, { functionName: 'claimLpWithdrawal', args: [arg!], value: fee('withdraw') });
      return ctx.done(`Claimed ${v.amount(count(rc, v, 'LpWithdrawalClaimed').total)} into earnings.`);
    }
    case 'acceptOwnership':
      await ctx.send('Accept ownership', { functionName: 'acceptOwnership' });
      return ctx.done('You are now the owner.');
    case 'acceptCompanyWallet':
      await ctx.send('Accept the company wallet', { functionName: 'acceptCompanyWallet' });
      return ctx.done('Company wallet changed.');
    case 'acceptMgmtFeeWallet':
      await ctx.send('Accept the fee wallet', { functionName: 'acceptMgmtFeeWallet' });
      return ctx.done('Management fee wallet changed.');
  }
}

/** Which BNB fee a quick action needs, so its button can wait for a price. */
export const QUICK_FEE: Partial<Record<QuickAction, 'deposit' | 'withdraw'>> = {
  sweep: 'withdraw',
  deployPrincipal: 'deposit',
  finalizeCompound: 'deposit',
  depositHeldLemx: 'deposit',
  claimLpWithdrawal: 'withdraw',
};
