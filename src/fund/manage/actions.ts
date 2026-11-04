// The project's flows, run as jobs (ui.tsx useJob): one or more transactions
// and a closing line saying what happened. The forms check their inputs; the
// contract still has the final say, and its refusal shows in plain words.
import { decodeEventLog, type PublicClient, type TransactionReceipt } from 'viem';
import { projectAbi } from '../abi';
import { NONE } from '../format';
import type { JobCtx } from './ui';
import type { QuickAction, View } from './view';

/** Deposits per payDue call: keeps each transaction well under the block gas limit. */
export const PAY_BATCH = 50n;

/** How many of an event the project emitted in a receipt, and their amounts added up. */
export function count(rc: TransactionReceipt, v: View, name: string): { n: number; total: bigint } {
  let n = 0;
  let total = 0n;
  for (const l of rc.logs) {
    if (l.address.toLowerCase() !== v.listing.project.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: projectAbi, data: l.data, topics: l.topics });
      if (d.eventName === name) {
        const a = d.args as Record<string, unknown>;
        n++;
        total += BigInt((a.amount ?? a.usdtReceived ?? a.principal ?? 0n) as bigint);
      }
    } catch {
      // Not one of the project's events.
    }
  }
  return { n, total };
}

/**
 * Pay every due cycle, oldest deposit first: payDue in batches from the
 * cursor until payments are current, or until a cycle has to wait for money
 * (reported, not an error: nothing is skipped).
 */
export async function payInvestors(ctx: JobCtx, v: View, client: PublicClient) {
  const p = v.listing.project;
  const read = <T,>(functionName: 'payCursor' | 'nextDue' | 'blockedFrom') => client.readContract({ address: p, abi: projectAbi, functionName }) as Promise<T>;
  let cycles = 0;
  let paid = 0n;
  for (let run = 1; run <= 25; run++) {
    const [cursor, nextDue, blocked, block] = await Promise.all([read<bigint>('payCursor'), read<bigint>('nextDue'), read<bigint>('blockedFrom'), client.getBlock()]);
    if (nextDue > block.timestamp && blocked === NONE) {
      ctx.done(run === 1 ? 'Payments were already current.' : `Investors are current. Paid ${cycles} cycle${cycles === 1 ? '' : 's'} (${v.amount(paid)}).`);
      return;
    }
    const from = blocked !== NONE && blocked < cursor ? blocked : cursor;
    const rc = await ctx.send(run === 1 ? 'Pay investors' : `Pay investors (run ${run})`, { functionName: 'payDue', args: [from, PAY_BATCH] });
    const c = count(rc, v, 'InterestPaid');
    cycles += c.n;
    paid += c.total;
    if (count(rc, v, 'InterestWaiting').n > 0) {
      const waiting = await read<bigint>('blockedFrom');
      ctx.done(`Paid ${cycles} cycle${cycles === 1 ? '' : 's'} (${v.amount(paid)}). Deposit #${waiting} is waiting for money: collect earnings or add money, then pay again.`);
      return;
    }
  }
  ctx.done(`Paid ${cycles} cycles (${v.amount(paid)}). More are due: run it again.`);
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
    case 'finalizeCompound':
      await ctx.send('Finish buying LEMX', { functionName: 'finalizeCompound', value: fee('deposit') });
      return ctx.done('LEMX locked in the pool.');
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
