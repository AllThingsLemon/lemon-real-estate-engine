// An investor's positions, worked out from the deposit records with the
// contract's own formulas (docs/WALLET_PLAN.md, "Investor").
import type { Address } from 'viem';
import type { Deposit, ProjectData } from './queries';

const PCT = 100_000_000n;

export type PositionStatus = 'current' | 'due' | 'waiting' | 'matured' | 'repaid';

export interface Position {
  deposit: Deposit;
  /** Interest for one cycle, at the rate fixed when it was made. */
  perCycle: bigint;
  /** Exact: cycles are only ever paid whole. */
  received: bigint;
  cyclesOwed: bigint;
  owed: bigint;
  /** When the next cycle comes due. */
  nextCycle: bigint;
  matured: boolean;
  /** Unrepaid deposits ahead of this one in the repayment line, and their principal. */
  ahead: bigint;
  principalAhead: bigint;
  status: PositionStatus;
}

/** Cycles due but unpaid, as Project.cyclesOwed works it out. */
export function cyclesOwed(d: Deposit, cycleDuration: bigint, now: bigint): bigint {
  if (d.repaid || now <= BigInt(d.start)) return 0n;
  const due = (now - BigInt(d.start)) / cycleDuration;
  const paid = BigInt(d.cyclesPaid);
  return due > paid ? due - paid : 0n;
}

const perCycle = (d: Deposit) => (d.principal * d.rate) / PCT;

export function positionsFor(
  account: Address,
  deposits: readonly Deposit[],
  data: ProjectData,
  cycleDuration: bigint,
  now: bigint,
): Position[] {
  const { state } = data;
  const mine = account.toLowerCase();
  // Only the oldest unrepaid deposit is ever repaid, so everything from
  // nextPayoffId up is still in line.
  const principalBefore: bigint[] = [];
  let running = 0n;
  for (const d of deposits) {
    principalBefore.push(running);
    if (d.id >= state.nextPayoffId) running += d.principal;
  }
  return deposits
    .filter((d) => d.investor.toLowerCase() === mine)
    .map((d) => {
      const owedCycles = cyclesOwed(d, cycleDuration, now);
      const matured = !d.repaid && now >= BigInt(d.maturity);
      // Waiting only while the reserve can't cover the sweep through this
      // deposit, the same test as the Collect button. blockedFrom stays set
      // after money comes in, until someone pays again.
      const plan = owedCycles > 0n ? collectPlan(d.id, deposits, data, cycleDuration, now) : null;
      const status: PositionStatus = d.repaid
        ? 'repaid'
        : plan
          ? plan.needed > plan.available
            ? 'waiting'
            : 'due'
          : matured
            ? 'matured'
            : 'current';
      return {
        deposit: d,
        perCycle: perCycle(d),
        received: BigInt(d.cyclesPaid) * perCycle(d),
        cyclesOwed: owedCycles,
        owed: owedCycles * perCycle(d),
        nextCycle: BigInt(d.start) + (BigInt(d.cyclesPaid) + owedCycles + 1n) * cycleDuration,
        matured,
        ahead: d.repaid ? 0n : d.id - state.nextPayoffId,
        principalAhead: d.repaid ? 0n : principalBefore[Number(d.id)],
        status,
      };
    })
    .reverse(); // newest first
}

export interface CollectPlan {
  /** payDue(from, count) */
  from: bigint;
  count: bigint;
  /** Interest owed from `from` through this deposit, against what the reserve can draw on. */
  needed: bigint;
  available: bigint;
  /** Older deposits with interest due that the sweep pays first. */
  older: number;
}

/**
 * "Collect interest due": payDue can't start past min(blockedFrom,
 * payCursor), so it sweeps from there through this deposit, paying every
 * older deposit's due interest too. The sweep stops at the first deposit the
 * interest reserve (topped up from net earnings) can't cover.
 */
export function collectPlan(id: bigint, deposits: readonly Deposit[], { state, payCursor }: ProjectData, cycleDuration: bigint, now: bigint): CollectPlan {
  const limit = state.blockedFrom < payCursor ? state.blockedFrom : payCursor;
  const from = id < limit ? id : limit;
  let needed = 0n;
  let older = 0;
  for (let i = from; i <= id; i++) {
    const d = deposits[Number(i)];
    const owed = cyclesOwed(d, cycleDuration, now);
    needed += owed * perCycle(d);
    if (i < id && owed > 0n) older++;
  }
  return { from, count: id - from + 1n, needed, available: state.interestReserve + state.netEarnings, older };
}
