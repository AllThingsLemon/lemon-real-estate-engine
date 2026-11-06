// A project's status and payment health in the page's words, shared by the
// listing panel and the manage page.
import { NONE, formatTime } from './format';
import type { ProjectData } from './queries';
import type { Tone } from './ui';

type State = ProjectData['state'];

/** The contract keeps its interest reserve at 2 cycles of interest (INTEREST_RESERVE_CYCLES). */
export const COVER_TARGET = 2n;

export function projectStatus(s: State): { label: string; tone: Tone; note?: string; open: boolean } {
  if (s.fullyRepaid) return { label: 'Fully repaid', tone: 'neutral', open: false };
  if (s.filled) return { label: 'Fully funded', tone: 'neutral', open: false };
  if (s.closed) return { label: 'Raise closed', tone: 'neutral', open: false };
  if (s.killed) return { label: 'Deposits stopped', tone: 'warn', note: 'Deposits are stopped for this project right now.', open: false };
  if (s.paused) return { label: 'Paused', tone: 'warn', note: 'This project is paused. Deposits will reopen when it resumes.', open: false };
  return { label: 'Open for investment', tone: 'ok', open: true };
}

/**
 * Payments are current while nextDue is in the future; blockedFrom is set
 * when a payment came due and the interest reserve couldn't cover it. Null
 * when nothing is active.
 */
export function paymentHealth(s: State, nextDue: bigint, now: bigint, withTime: boolean): { value: string; sub?: string; tone: Tone } | null {
  if (s.blockedFrom !== NONE) return { value: `Late since deposit #${s.blockedFrom}`, tone: 'bad' };
  if (nextDue === NONE) return null;
  if (nextDue <= now) return { value: 'Due, not yet paid', sub: `Due since ${formatTime(nextDue, withTime)}`, tone: 'warn' };
  return { value: 'Up to date', sub: `Next due ${formatTime(nextDue, withTime)}`, tone: 'ok' };
}

/** Interest reserve ÷ interest owed per cycle, to one decimal. Null with nothing owed. */
export function interestCover(s: State): { value: string; tone?: Tone } | null {
  if (s.monthlyInterestOwed === 0n) return null;
  const tenths = (s.interestReserve * 10n) / s.monthlyInterestOwed;
  return {
    value: `${tenths / 10n}.${tenths % 10n} cycles`,
    tone: tenths < 10n ? 'bad' : tenths < COVER_TARGET * 10n ? 'warn' : undefined,
  };
}

/** Payments are behind until a payDue sweep reaches every deposit: split and withdrawDev refuse until then. */
export const paymentsDue = (s: State, nextDue: bigint, now: bigint) => s.blockedFrom !== NONE || nextDue <= now;
