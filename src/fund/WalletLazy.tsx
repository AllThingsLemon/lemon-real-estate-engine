// The wallet island on pages with nothing on-chain (the home page, About…):
// just the header's Connect button and Manage link. It loads once the page
// is idle, so the page's own content comes first.
import { Suspense, lazy, useEffect, useState } from 'react';
import type { WalletProps } from './WalletIsland';

const WalletIsland = lazy(() => import('./WalletIsland'));

export default function WalletLazy(props: WalletProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const go = () => setReady(true);
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(go, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(go, 300);
    return () => clearTimeout(t);
  }, []);
  return ready ? (
    <Suspense fallback={null}>
      <WalletIsland {...props} />
    </Suspense>
  ) : null;
}
