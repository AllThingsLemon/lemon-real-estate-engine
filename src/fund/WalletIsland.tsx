// The one React root on a wallet page: wallet connection (wagmi + RainbowKit,
// set up as in loans-dapp) and the connect button. The invest panel and the
// portfolio render from here too, through portals, so the whole page shares
// one connection and one transaction toast.
import '@rainbow-me/rainbowkit/styles.css';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Chain } from 'viem';
import { ConnectButton, RainbowKitProvider, connectorsForWallets, lightTheme } from '@rainbow-me/rainbowkit';
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig } from 'wagmi';
import { chainFor } from './chains';
import type { Disclosures } from './disclosures';
import InvestPanel from './InvestPanel';
import Portfolio from './Portfolio';
import type { Listing, Trust } from './queries';
import { buildTransport } from './transport';
import { TxProvider } from './tx';
import { useMedia } from './ui';

export interface WalletProps {
  chainId: number;
  /** Reown (WalletConnect) project ID. Without one, only browser wallets can connect. */
  walletConnectProjectId: string;
  /** The client's name and icon, shown in the connect dialog and in phone wallets. */
  appName: string;
  appIcon: string;
  accent: string;
  trust: Trust;
  disclosures: Disclosures | null;
  portfolioUrl: string;
  /** On a listing linked to a project: the invest panel. */
  listing?: Listing;
  /** On /portfolio/: every linked listing on this site. */
  portfolio?: Listing[];
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
  const rgb = parseHex(accent);
  return !rgb || luminance(rgb) > 0.179 ? '#111827' : '#ffffff';
}

/**
 * The accent, darkened until it reads as text on white (4.5:1). The connect
 * dialog uses the accent for link text such as "Learn More", which a light
 * accent like the default yellow makes unreadable. Null when it's already fine.
 */
function readableOnWhite(accent: string) {
  const rgb = parseHex(accent);
  if (!rgb) return null;
  let k = 1;
  while (luminance(rgb.map((c) => c * k)) > 0.183) k -= 0.05;
  if (k === 1) return null;
  return '#' + rgb.map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('');
}

function parseHex(color: string) {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The listing page has two slots for the panel (PanelSlot.astro): the side
 * column, and after the summary for phones, where the side column drops
 * below the text.
 */
function PanelPortal({ listing, chain, props }: { listing: Listing; chain: Chain; props: WalletProps }) {
  const narrow = useMedia('(max-width: 900px)');
  const target = document.querySelector(`[data-fund-panel="${narrow ? 'inline' : 'side'}"]`);
  if (!target) return null;
  return createPortal(
    <InvestPanel listing={listing} trust={props.trust} chain={chain} disclosures={props.disclosures} portfolioUrl={props.portfolioUrl} />,
    target,
  );
}

function PortfolioPortal({ listings, chain, trust }: { listings: Listing[]; chain: Chain; trust: Trust }) {
  const target = document.querySelector('[data-fund-portfolio]');
  return target ? createPortal(<Portfolio listings={listings} trust={trust} chain={chain} />, target) : null;
}

export default function WalletIsland(props: WalletProps) {
  // Logo, button and menu share a phone's header, so the label gets shorter.
  const narrow = useMedia('(max-width: 480px)');
  const [chain] = useState(() => chainFor(props.chainId));
  const [wagmiConfig] = useState(() => makeWagmiConfig(props));
  const [queryClient] = useState(() => new QueryClient());
  // Button text on the accent colour, for the panel's buttons too (they're portalled outside this root).
  useEffect(() => document.documentElement.style.setProperty('--on-accent', textOn(props.accent)), [props.accent]);
  const [theme] = useState(() => {
    const t = lightTheme({ accentColor: props.accent, accentColorForeground: textOn(props.accent), borderRadius: 'medium' });
    return { ...t, fonts: { body: 'var(--font)' } };
  });
  const [dialogAccent] = useState(() => readableOnWhite(props.accent));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} appInfo={{ appName: props.appName }} modalSize="compact">
          {dialogAccent && (
            // RainbowKit marks its dialogs with data-rk and role="dialog".
            <style>{`[data-rk][role="dialog"]{--rk-colors-accentColor:${dialogAccent};--rk-colors-accentColorForeground:#fff}`}</style>
          )}
          <TxProvider chain={chain}>
            <ConnectButton
              label={narrow ? 'Connect' : 'Connect wallet'}
              showBalance={false}
              chainStatus="icon"
              accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
            />
            {props.listing && <PanelPortal listing={props.listing} chain={chain} props={props} />}
            {props.portfolio && <PortfolioPortal listings={props.portfolio} chain={chain} trust={props.trust} />}
          </TxProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
