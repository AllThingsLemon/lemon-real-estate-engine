// Ported from loans-dapp (src/config/stickyFallback.ts). Keep the two in step.
import {
  createTransport,
  HttpRequestError,
  shouldThrow,
  TimeoutError,
  type EIP1193RequestFn,
  type Transport,
} from 'viem';

/** How long a later transport keeps the lead before the first is retried. */
export const RECHECK_MS = 5 * 60_000;

/**
 * The endpoint itself didn't answer: the request failed at the network level,
 * timed out, or came back with an HTTP error status (403 from a filter, 429
 * from a rate limit, 5xx). A JSON-RPC error in a normal response is the
 * opposite: a node answered, and any other route to the same nodes would get
 * the same answer.
 */
export const isUnreachable = (error: unknown) => error instanceof HttpRequestError || error instanceof TimeoutError;

/**
 * viem's fallback(), except each request starts at the transport that last
 * answered instead of always at the first, and with an optional last resort.
 *
 * fallback() walks its list from the top on every request, so when the first
 * endpoints are unreachable (a firewall, DNS filter or ad blocker blocking
 * binance.org) every request pays for those failed attempts again before
 * reaching one that answers. Here a blocked visitor walks the list once, then
 * goes straight to the endpoint that worked. After RECHECK_MS the first is
 * tried again, since whatever stopped it (a VPN, an outage) may have cleared.
 *
 * `lastResort` is for an RPC proxy that relays to the same nodes, so it's only
 * tried when none of them could be reached. The engine has none yet (no
 * backend); loans-dapp uses its /api/rpc Worker here.
 *
 * Errors that would fail the same everywhere (a revert, a rejected request)
 * are thrown at once, as fallback() does.
 */
export function stickyFallback(
  transports: readonly Transport[],
  config: { lastResort?: Transport; retryCount?: number; retryDelay?: number } = {},
): Transport {
  const all = config.lastResort ? [...transports, config.lastResort] : transports;
  const last = config.lastResort ? all.length - 1 : -1;
  let preferred = 0;
  let preferredSince = 0;

  /** The preferred transport first; the last resort after every other. */
  const order = () => {
    const primaries = transports.map((_, k) => (preferred === last ? k : (preferred + k) % transports.length));
    if (last === -1) return primaries;
    return preferred === last ? [last, ...primaries] : [...primaries, last];
  };

  return ({ chain, timeout, ...rest }) =>
    createTransport(
      {
        key: 'stickyFallback',
        name: 'Sticky Fallback',
        type: 'fallback',
        retryCount: config.retryCount,
        retryDelay: config.retryDelay,
        request: (async ({ method, params }) => {
          if (preferred !== 0 && Date.now() - preferredSince > RECHECK_MS) preferred = 0;
          let lastError: unknown;
          let answered = false;
          for (const i of order()) {
            if (i === last && answered) break;
            // As in fallback(): retries come from each transport's own config.
            const transport = all[i]({ ...rest, chain, retryCount: 0, timeout });
            try {
              const response = await transport.request({ method, params });
              if (i !== preferred) {
                preferred = i;
                preferredSince = Date.now();
              }
              return response;
            } catch (err) {
              if (shouldThrow(err as Error)) throw err;
              if (!isUnreachable(err)) {
                // The last resort relayed a node's answer: the others share
                // those nodes, so there is nothing left to try.
                if (i === last) throw err;
                answered = true;
              }
              lastError = err;
            }
          }
          throw lastError;
        }) as EIP1193RequestFn,
      },
      // viem's watch actions read `transports` off any 'fallback' transport
      // to choose between polling and subscribing, as fallback() provides.
      { transports: all.map((transport) => transport({ chain, retryCount: 0 })) },
    );
}
