// The one React root on a wallet page: wallet connection (wagmi + RainbowKit,
// set up as in loans-dapp) and the connect button. The invest panel renders
// from here too, through a portal, so the whole page shares one connection.
import '@rainbow-me/rainbowkit/styles.css';
import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Chain } from 'viem';
import { ConnectButton, RainbowKitProvider, connectorsForWallets, lightTheme } from '@rainbow-me/rainbowkit';
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig } from 'wagmi';
import { chainFor } from './chains';
import InvestPanel from './InvestPanel';
import { buildTransport } from './transport';
import type { FundLink } from './useListing';

export interface WalletProps {
  chainId: number;
  /** Reown (WalletConnect) project ID. Without one, only browser wallets can connect. */
  walletConnectProjectId: string;
  /** The client's name and icon, shown in the connect dialog and in phone wallets. */
  appName: string;
  appIcon: string;
  accent: string;
  /** Set on a listing linked to a project: shows the invest panel. */
  link?: FundLink;
}

function makeWagmiConfig({ chainId, walletConnectProjectId, appName, appIcon }: WalletProps) {
  const chain = chainFor(chainId);
  const origin = window.location.origin;
  // MetaMask, Rainbow and WalletConnect all connect phones through WalletConnect.
  const wallets = walletConnectProjectId
    ? [injectedWallet, metaMaskWallet, walletConnectWallet, rainbowWallet]
    : [injectedWallet];
  const connectors = connectorsForWallets([{ groupName: 'Recommended', wallets }], {
    appName,
    projectId: walletConnectProjectId,
    appUrl: origin,
    appIcon: appIcon ? new URL(appIcon, origin).href : undefined,
  });
  return createConfig({
    chains: [chain],
    connectors,
    transports: { [chain.id]: buildTransport(chain.rpcUrls.default.http) },
    pollingInterval: 4000,
    batch: { multicall: { batchSize: 1024, wait: 16 } },
  });
}

/** Dark or white text on the client's accent colour, whichever reads better. */
function textOn(accent: string) {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(accent.trim())?.[1];
  if (!hex) return '#111827';
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#111827' : '#ffffff';
}

/** True while the media query matches, updating as the window resizes. */
function useMedia(query: string) {
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
 * The listing page has two slots for the panel (PanelSlot.astro): the side column, and
 * after the summary for phones, where the side column drops below the text.
 */
function PanelPortal({ link, chain }: { link: FundLink; chain: Chain }) {
  const narrow = useMedia('(max-width: 900px)');
  const target = document.querySelector(`[data-fund-panel="${narrow ? 'inline' : 'side'}"]`);
  return target ? createPortal(<InvestPanel link={link} chain={chain} />, target) : null;
}

export default function WalletIsland(props: WalletProps) {
  // Logo, button and menu share a phone's header, so the label gets shorter.
  const narrow = useMedia('(max-width: 480px)');
  const [wagmiConfig] = useState(() => makeWagmiConfig(props));
  const [queryClient] = useState(() => new QueryClient());
  const [theme] = useState(() => {
    const t = lightTheme({ accentColor: props.accent, accentColorForeground: textOn(props.accent), borderRadius: 'medium' });
    return { ...t, fonts: { body: 'var(--font)' } };
  });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} appInfo={{ appName: props.appName }} modalSize="compact">
          <ConnectButton
            label={narrow ? 'Connect' : 'Connect wallet'}
            showBalance={false}
            chainStatus="icon"
            accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
          />
          {props.link && <PanelPortal link={props.link} chain={chainFor(props.chainId)} />}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
