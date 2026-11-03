// The BNB chains the wallet pages can run on, as in loans-dapp
// (src/config/wagmi.ts). Only the binance dataseeds answer browsers reliably:
// publicnode refuses browser requests from production sites and the nodereal
// key is rate-limited. None of them serve eth_getLogs, so nothing here may
// depend on event logs (see docs/WALLET_PLAN.md, "Without a backend").
import { defineChain, type Chain } from 'viem';

export const BSC_RPC_URLS = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed4.binance.org',
];

export const BSC_TESTNET_RPC_URLS = [
  'https://data-seed-prebsc-1-s1.binance.org:8545',
  'https://data-seed-prebsc-2-s1.binance.org:8545',
  'https://data-seed-prebsc-1-s2.binance.org:8545',
];

const multicall3 = '0xca11bde05977b3631167028862be2a173976ca11';

export const bsc = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: { decimals: 18, name: 'BNB', symbol: 'BNB' },
  rpcUrls: { default: { http: BSC_RPC_URLS } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://bscscan.com' } },
  contracts: { multicall3: { address: multicall3, blockCreated: 15921452 } },
});

export const bscTestnet = defineChain({
  id: 97,
  name: 'BNB Smart Chain Testnet',
  nativeCurrency: { decimals: 18, name: 'tBNB', symbol: 'tBNB' },
  rpcUrls: { default: { http: BSC_TESTNET_RPC_URLS } },
  blockExplorers: { default: { name: 'BscScan Testnet', url: 'https://testnet.bscscan.com' } },
  contracts: { multicall3: { address: multicall3, blockCreated: 17422483 } },
  testnet: true,
});

const CHAINS: Record<number, Chain> = { [bsc.id]: bsc, [bscTestnet.id]: bscTestnet };

/** The chain for a site's `fund.chainId`; client-dir.mjs only lets 56 and 97 through. */
export function chainFor(chainId: number): Chain {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported fund chain ${chainId}`);
  return chain;
}
