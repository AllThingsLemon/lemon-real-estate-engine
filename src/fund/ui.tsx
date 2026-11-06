// Small pieces shared by the panel, the positions and the portfolio.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

/** A label and value row in a .fp-list. */
export function Row({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className={tone ? `fp-${tone}` : undefined}>{value}</span>
        {sub && <span className="fp-sub">{sub}</span>}
      </dd>
    </div>
  );
}

/** True while the media query matches, updating as the window resizes. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/**
 * The chain's current time in seconds, ticking every few seconds so due
 * dates turn over on their own. `offset` is the chain's clock minus this
 * browser's (from projectQuery).
 */
export function useChainNow(offset = 0) {
  const [local, setLocal] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setLocal(Date.now() / 1000), 5_000);
    return () => clearInterval(t);
  }, []);
  return BigInt(Math.floor(local + offset));
}

export const plural = (n: bigint | number, word: string) => `${n} ${word}${BigInt(n) === 1n ? '' : 's'}`;
