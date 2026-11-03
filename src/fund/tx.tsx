// Sending transactions from the wallet pages: switch the wallet to the site's
// network if needed, simulate first (so a call the contract would refuse
// never opens the wallet), pad the gas estimate, send, and wait. A toast shows
// each step in plain words, and a transaction still pending survives a reload.
// A Safe (any contract wallet) doesn't send straight away: the other signers
// approve it in Safe{Wallet} first, so the toast says so instead of waiting.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Abi, Address, Chain, Hash, TransactionReceipt } from 'viem';
import { useAccount, useConfig, usePublicClient } from 'wagmi';
import { switchChain, writeContract } from 'wagmi/actions';
import { explain } from './errors';
import { useRefreshProject } from './queries';

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

interface Toast {
  label: string;
  status: 'wallet' | 'submitted' | 'confirmed' | 'failed' | 'safe';
  hash?: Hash;
  detail?: string;
}

interface SendOptions {
  /** The project to re-read once it's confirmed. */
  project: Address;
  /** Formats token amounts in error messages. */
  amount?: (v: unknown) => string;
}

/** Resolves with the receipt, or null when a Safe has queued it for its other signers. */
type Send = (label: string, call: Call, opts: SendOptions) => Promise<TransactionReceipt | null>;

const TxContext = createContext<Send | null>(null);

/** Public RPC gas estimates can come in about 1% short (seen in the fund console). */
const GAS_PAD = (gas: bigint) => (gas * 13n) / 10n;
const PENDING_KEY = 'fund-pending-tx';

interface Pending {
  hash: Hash;
  label: string;
  project: Address;
  chainId: number;
}

// Browser storage can be unavailable (private windows, blocked site data).
function readPending(): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
  } catch {
    return null;
  }
}
function writePending(p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Only the reload resume is lost.
  }
}

export function TxProvider({ chain, children }: { chain: Chain; children: ReactNode }) {
  const config = useConfig();
  const client = usePublicClient();
  const { address, chainId } = useAccount();
  const refresh = useRefreshProject();
  const [toast, setToast] = useState<Toast | null>(null);
  const close = useCallback(() => setToast(null), []);
  // Contract wallets (Safes) by address, so each is looked up once.
  const contractWallets = useRef(new Map<string, boolean>());

  const finish = useCallback(
    async (label: string, hash: Hash, project: Address) => {
      setToast({ label, status: 'submitted', hash });
      try {
        const receipt = await client!.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error("The transaction didn't go through. Nothing was changed.");
        setToast({ label, status: 'confirmed', hash });
        return receipt;
      } finally {
        writePending(null);
        refresh(project);
      }
    },
    [client, refresh],
  );

  // A transaction sent before a reload: show it until it confirms.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !client) return;
    resumed.current = true;
    const p = readPending();
    if (p && p.chainId === chain.id) {
      finish(p.label, p.hash, p.project).catch((e) => setToast({ label: p.label, status: 'failed', hash: p.hash, detail: explain(e) }));
    }
  }, [client, chain.id, finish]);

  const send = useCallback<Send>(
    async (label, call, { project, amount }) => {
      setToast({ label, status: 'wallet' });
      let hash: Hash | undefined;
      try {
        if (!address) throw new Error('Connect your wallet first.');
        if (chainId !== chain.id) await switchChain(config, { chainId: chain.id });
        const request = { ...call, account: address };
        await client!.simulateContract(request);
        const gas = GAS_PAD(await client!.estimateContractGas(request));
        if (!contractWallets.current.has(address)) {
          contractWallets.current.set(address, Boolean(await client!.getCode({ address })));
        }
        const safe = contractWallets.current.get(address);
        const sent = await writeContract(config, { ...request, chainId: chain.id, gas });
        if (safe) {
          // The hash is the Safe's own, not a network transaction yet. The
          // page re-reads the chain every 30 s, so it updates once it runs.
          setToast({ label, status: 'safe' });
          return null;
        }
        hash = sent;
        writePending({ hash, label, project, chainId: chain.id });
        return await finish(label, hash, project);
      } catch (e) {
        setToast({ label, status: 'failed', hash, detail: explain(e, amount) });
        throw e;
      }
    },
    [address, chainId, chain.id, config, client, finish],
  );

  return (
    <TxContext.Provider value={send}>
      {children}
      {createPortal(<TxToast toast={toast} chain={chain} onClose={close} />, document.body)}
    </TxContext.Provider>
  );
}

export function useSend(): Send {
  const send = useContext(TxContext);
  if (!send) throw new Error('useSend outside TxProvider');
  return send;
}

const STATUS_TEXT: Record<Toast['status'], string> = {
  wallet: 'Confirm in your wallet…',
  submitted: 'Sent. Waiting for the network to confirm it…',
  confirmed: 'Confirmed.',
  failed: "Didn't go through.",
  safe: 'Sent to your Safe. The other signers need to approve it in Safe{Wallet}. This page updates once it runs.',
};

function TxToast({ toast, chain, onClose }: { toast: Toast | null; chain: Chain; onClose: () => void }) {
  // Confirmations clear themselves; failures and Safe notices stay until closed.
  useEffect(() => {
    if (toast?.status !== 'confirmed') return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  const explorer = chain.blockExplorers?.default.url;
  return (
    <div className="fund-toast-region" role="status" aria-live="polite">
      {toast && (
        <div className={`fund-toast fund-toast-${toast.status}`}>
          <div>
            <strong>{toast.label}</strong>
            <p>
              {STATUS_TEXT[toast.status]}
              {toast.detail && ` ${toast.detail}`}
            </p>
            {toast.hash && explorer && (
              <a href={`${explorer}/tx/${toast.hash}`} target="_blank" rel="noopener">
                View on {chain.blockExplorers!.default.name}
              </a>
            )}
          </div>
          {toast.status !== 'wallet' && (
            <button type="button" className="fund-toast-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
