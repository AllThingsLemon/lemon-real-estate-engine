// Sending transactions from the wallet pages: switch the wallet to the site's
// network if needed, simulate first (so a call the contract would refuse
// never opens the wallet), pad the gas estimate, send, and wait. A toast shows
// each step in plain words, and a transaction still pending survives a reload.
// A Safe (any contract wallet) doesn't send straight away: the other signers
// approve it in Safe{Wallet} first, so the toast says so instead of waiting.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { erc20Abi, type Abi, type Address, type Chain, type Hash, type TransactionReceipt } from 'viem';
import { useAccount, useConfig, usePublicClient } from 'wagmi';
import { switchChain, writeContract } from 'wagmi/actions';
import { explain, isAllowanceRefusal } from './errors';
import { useRefreshProject } from './queries';

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  /** BNB to send, for the pool's fee on the payable upkeep calls (the excess is refunded). */
  value?: bigint;
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
  /**
   * The call takes this much of a token: allow it first when the project
   * can't already. The call is checked before that, so a refusal for any
   * other reason shows without asking for an approval it would waste.
   */
  approve?: { token: Address; amount: bigint; label: string };
}

/** Resolves with the receipt, or null when a Safe has queued it for its other signers. */
type Send = (label: string, call: Call, opts: SendOptions) => Promise<TransactionReceipt | null>;
/** Show what a run of transactions did, or why it stopped. */
type Note = (label: string, detail: string, failed?: boolean) => void;

const TxContext = createContext<{ send: Send; note: Note } | null>(null);

/** Public RPC gas estimates can come in about 1% short (seen in the fund console). */
const GAS_PAD = (gas: bigint) => (gas * 13n) / 10n;
const PENDING_KEY = 'fund-pending-tx';

/** A sent transaction that reverted on chain, with its block so it can be replayed to say why. */
class Reverted extends Error {
  constructor(readonly blockNumber: bigint) {
    super("The transaction didn't go through. Nothing was changed.");
  }
}

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
        if (receipt.status !== 'success') throw new Reverted(receipt.blockNumber);
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

  const sendOne = useCallback(
    async (label: string, call: Call, project: Address, amount?: (v: unknown) => string) => {
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
        let detail = explain(e, amount);
        // Replayed at its block, a reverted transaction names the refusal (a cycle came due while the wallet waited, say).
        if (e instanceof Reverted && address) {
          try {
            await client!.simulateContract({ ...call, account: address, blockNumber: e.blockNumber });
          } catch (why) {
            detail = `Nothing was changed. ${explain(why, amount)}`;
          }
        }
        setToast({ label, status: 'failed', hash, detail });
        throw e;
      }
    },
    [address, chainId, chain.id, config, client, finish],
  );

  const send = useCallback<Send>(
    async (label, call, { project, amount, approve }) => {
      if (approve && address) {
        const [allowance, balance] = await Promise.all([
          client!.readContract({ address: approve.token, abi: erc20Abi, functionName: 'allowance', args: [address, call.address] }),
          client!.readContract({ address: approve.token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        ]);
        // Short of the token, the call fails like a missing approval would: say so instead of asking for one.
        if (balance < approve.amount) {
          const fmt = amount ?? String;
          const detail = `This wallet has ${fmt(balance)}; this needs ${fmt(approve.amount)}.`;
          setToast({ label, status: 'failed', detail });
          throw new Error(detail);
        }
        if (allowance < approve.amount) {
          try {
            await client!.simulateContract({ ...call, account: address });
          } catch (e) {
            if (!isAllowanceRefusal(e)) {
              setToast({ label, status: 'failed', detail: explain(e, amount) });
              throw e;
            }
          }
          const approved = await sendOne(approve.label, { address: approve.token, abi: erc20Abi, functionName: 'approve', args: [call.address, approve.amount] }, project, amount);
          // A Safe queues the approval for its signers; the call waits until it has run.
          if (!approved) return null;
        }
      }
      return sendOne(label, call, project, amount);
    },
    [address, client, sendOne],
  );

  const note = useCallback<Note>((label, detail, failed) => setToast({ label, status: failed ? 'failed' : 'confirmed', detail }), []);

  return (
    <TxContext.Provider value={{ send, note }}>
      {children}
      {createPortal(<TxToast toast={toast} chain={chain} onClose={close} />, document.body)}
    </TxContext.Provider>
  );
}

export function useSend(): Send {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error('useSend outside TxProvider');
  return ctx.send;
}

export function useTxNote(): Note {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error('useTxNote outside TxProvider');
  return ctx.note;
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
