// The fund repo's indexer (real-estate-fund/indexer): lists and history for
// /manage/, as in the fund dashboard. Balances never come from it, only from
// the chain, so a slow or missing indexer can't make a figure wrong. Without
// fund.indexerUrl, or while it's down, the lists say so and everything else
// works.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useRef } from 'react';
import type { Address } from 'viem';

export interface IxMember {
  role: string;
  account: Address;
  since_block: number;
  since_time: number;
}
export interface IxProjectDetail {
  address: Address;
  name: string;
  members: IxMember[];
}
export interface IxInvestor {
  investor: Address;
  class: number;
  referrer: Address | null;
  allowlisted: boolean;
  updated_time: number | null;
  deposits: number;
  active_deposits: number;
  principal_active: string;
  principal_repaid: string;
  interest_paid: string;
  next_maturity: number | null;
}
export interface IxDeposit {
  deposit_id: number;
  investor: Address;
  kind: number;
  usdt_in: string;
  repaid_time: number | null;
}
export interface IxEvent {
  block: number;
  log_index: number;
  tx_hash: string;
  block_time: number;
  name: string;
  args: Record<string, string>;
}
/** A project the indexer's factory created (GET /v1/projects). `owner` is the current owner. */
export interface IxProjectRow {
  address: Address;
  name: string;
  owner: Address;
  creator: Address;
  block: number;
  block_time: number;
}
export interface IxStatus {
  state: { chain_id: number; cursor: number; head: number | null; updated_at: number | null } | null;
  lastError: string | null;
}

/** The indexer's URL for this site, '' when it has none. */
export const IndexerContext = createContext('');
export const useIndexerUrl = () => useContext(IndexerContext);

export class NoIndexer extends Error {}

async function get<T>(base: string, path: string): Promise<T> {
  if (!base) throw new NoIndexer('No indexer is set for this site.');
  const r = await fetch(`${base}${path}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `indexer ${path}: HTTP ${r.status}`);
  return body as T;
}

const lc = (a: string) => a.toLowerCase();
/** Polling a live indexer. Without one there's nothing to try again: fail once and stay failed. */
const poll = (base: string, every: number) =>
  base ? ({ refetchInterval: every, retry: 1 } as const) : ({ refetchInterval: false, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false } as const);

/**
 * Keeps a failed query's error while it tries again. React Query clears the
 * error of a query that has never had data each time it refetches, so without
 * this a page swaps between "unavailable" and "Loading…" every few seconds,
 * remounting what's inside (Check a wallet lost what was typed).
 */
function useSteady<Q extends { data: unknown; error: Error | null }>(q: Q): Q {
  const last = useRef<Error | null>(null);
  if (q.error) last.current = q.error;
  else if (q.data !== undefined) last.current = null;
  return !q.error && last.current ? ({ ...q, error: last.current, isError: true, isPending: false, status: 'error' } as Q) : q;
}

export function useIxStatus() {
  const base = useIndexerUrl();
  return useSteady(useQuery({ queryKey: ['fund-ix', 'status', base], queryFn: () => get<IxStatus>(base, '/v1/status'), ...poll(base, 10_000), retry: false }));
}

/** Every project the indexer's factory has created, newest first. */
export function useIxProjects(enabled = true, live = true) {
  const base = useIndexerUrl();
  // A query polls at its fastest observer's interval, so /manage/ keeps polling when the header doesn't.
  return useSteady(useQuery({ queryKey: ['fund-ix', 'projects', base], queryFn: () => get<IxProjectRow[]>(base, '/v1/projects'), enabled, staleTime: 5_000, ...poll(base, 30_000), ...(live ? {} : { refetchInterval: false as const }) }));
}

export function useIxProject(p: Address) {
  const base = useIndexerUrl();
  return useSteady(useQuery({ queryKey: ['fund-ix', lc(p), 'project'], queryFn: () => get<IxProjectDetail>(base, `/v1/projects/${lc(p)}`), staleTime: 5_000, ...poll(base, 10_000) }));
}

export function useIxInvestors(p: Address) {
  const base = useIndexerUrl();
  return useSteady(useQuery({ queryKey: ['fund-ix', lc(p), 'investors'], queryFn: () => get<IxInvestor[]>(base, `/v1/projects/${lc(p)}/investors`), staleTime: 5_000, ...poll(base, 10_000) }));
}

/** Deposit details only the events have (credited deposits, repayment times). */
export function useIxDeposits(p: Address, investor?: Address) {
  const base = useIndexerUrl();
  const q = investor ? `?investor=${lc(investor)}` : '';
  return useSteady(useQuery({ queryKey: ['fund-ix', lc(p), 'deposits', investor ? lc(investor) : null], queryFn: () => get<IxDeposit[]>(base, `/v1/projects/${lc(p)}/deposits${q}`), staleTime: 5_000, ...poll(base, 10_000) }));
}

export interface IxLpWithdrawal {
  request_id: string;
  amount: string;
  requested_time: number;
  requested_tx: string;
  claimed_amount: string | null;
  claimed_time: number | null;
  claimed_tx: string | null;
}

/** The project's pool withdrawal requests, open and claimed. */
export function useIxLpWithdrawals(p: Address) {
  const base = useIndexerUrl();
  return useSteady(useQuery({ queryKey: ['fund-ix', lc(p), 'lp-withdrawals'], queryFn: () => get<IxLpWithdrawal[]>(base, `/v1/projects/${lc(p)}/lp-withdrawals`), staleTime: 5_000, ...poll(base, 10_000) }));
}

/** ProjectSnapshot events: the balances-over-time chart. */
export function useIxSnapshots(p: Address) {
  const base = useIndexerUrl();
  return useSteady(useQuery({ queryKey: ['fund-ix', lc(p), 'snapshots'], queryFn: () => get<IxEvent[]>(base, `/v1/projects/${lc(p)}/snapshots`), ...poll(base, 30_000) }));
}

/** Events newest first, a page at a time. `investor` keeps the events naming that wallet. */
export function useIxActivity(p: Address, names?: readonly string[], limit = 30, investor?: Address) {
  const base = useIndexerUrl();
  return useSteady(useInfiniteQuery({
    queryKey: ['fund-ix', lc(p), 'activity', names?.join(',') ?? '', limit, investor ? lc(investor) : null],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (pageParam) q.set('before', pageParam);
      if (names?.length) q.set('names', names.join(','));
      if (investor) q.set('investor', lc(investor));
      return get<{ items: IxEvent[]; next: string | null }>(base, `/v1/projects/${lc(p)}/activity?${q}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    ...poll(base, 15_000),
  }));
}

/** Why a list is missing: no indexer for this site, or it can't be reached. `one`: `what` is singular. */
export function ixProblem(error: unknown, what: string, one = false): string {
  const come = one ? 'comes' : 'come';
  return error instanceof NoIndexer
    ? `${what} ${come} from the fund indexer, and this site doesn't have one set (fund.indexerUrl).`
    : `${what} ${come} from the fund indexer, which can't be reached right now. Balances and actions are unaffected.`;
}
