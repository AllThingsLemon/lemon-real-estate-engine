// Numbers on the wallet pages, in the words the plan's glossary uses
// (docs/WALLET_PLAN.md): full amounts with separators, rates per cycle, and
// lengths of time from the contract's seconds.
import { formatUnits } from 'viem';

/** The contract's "none" (type(uint256).max) for blockedFrom and nextDue. */
export const NONE = 2n ** 256n - 1n;

/** Token amount → "12,345.67". */
export function formatAmount(value: bigint, decimals: number, dp = 2): string {
  const [int, frac = ''] = formatUnits(value, decimals).split('.');
  const cut = frac.slice(0, dp).replace(/0+$/, '');
  return BigInt(int).toLocaleString('en-US') + (cut ? `.${cut}` : '');
}

/** 1e8-precision rate → "2.5%". */
export function formatRate(rate: bigint): string {
  return `${(Number(rate) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
}

const UNITS = [
  ['year', 365 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
] as const;

/** Seconds → "30 days", "5 years", "5 minutes": the largest unit that divides it exactly. */
export function formatDuration(seconds: bigint | number): string {
  const sec = Number(seconds);
  const [name, size] = UNITS.find(([, size]) => sec >= size && sec % size === 0) ?? UNITS[UNITS.length - 1];
  const n = sec / size;
  return `${n.toLocaleString('en-US')} ${name}${n === 1 ? '' : 's'}`;
}

/**
 * Unix time → "Nov 30" ("Nov 30, 2027" in another year), with the time of
 * day when cycles are shorter than a day.
 */
export function formatTime(unix: bigint, withTime: boolean): string {
  const date = new Date(Number(unix) * 1000);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
