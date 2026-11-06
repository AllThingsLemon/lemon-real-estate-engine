// Ported from loans-dapp (src/config/transport.ts), without its /api/rpc
// proxy: the engine has no backend yet.
import { http, type Transport } from 'viem';
import { stickyFallback } from './stickyFallback';

/**
 * How long each endpoint gets to answer before the next is tried. The
 * dataseeds answer in well under a second; a firewall that silently drops
 * their packets would otherwise hold each request for viem's default 10 s.
 */
export const ENDPOINT_TIMEOUT_MS = 4_000;

/**
 * stickyFallback over the endpoints, each tried once (with several mirrors,
 * retrying one only delays reaching the next), and the whole walk retried
 * when every endpoint failed.
 */
export function buildTransport(urls: readonly string[]): Transport {
  return stickyFallback(
    urls.map((url) => http(url, { retryCount: 0, timeout: ENDPOINT_TIMEOUT_MS })),
    { retryCount: 3, retryDelay: 500 },
  );
}
