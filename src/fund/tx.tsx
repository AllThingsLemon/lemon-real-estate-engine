// Sending transactions from the wallet pages: switch the wallet to the site's
// network if needed, simulate first (so a call the contract would refuse
// never opens the wallet), pad the gas estimate, send, and wait. A toast shows
// each step in plain words (one toast per job, several can stack), keeps a
// link to every transaction the job sent, and a transaction still pending
// survives a reload.
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
  id: number;
  label: string;
  status: 'switch' | 'wallet' | 'submitted' | 'confirmed' | 'failed' | 'safe';
  /** Every transaction the job has sent, in order. */
  hashes: Hash[];
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
  /** The toast to show it in (from newToast), so a job of several transactions keeps one toast. */
  toast?: number;
}

/** Resolves with the receipt, or null when a Safe has queued it for its other signers. */
type Send = (label: string, call: Call, opts: SendOptions) => Promise<TransactionReceipt | null>;
/** Show what a run of transactions did, or why it stopped (in its toast, keeping its links). */
type Note = (label: string, detail: string, failed?: boolean, toast?: number) => void;

const TxContext = createContext<{ send: Send; note: Note } | null>(null);

/** Public RPC gas estimates can come in about 1% short (seen in the fund console). */
const GAS_PAD = (gas: bigint) => (gas * 13n) / 10n;
/**
 * Calls that pay every due cycle first cost more for each cycle that comes due
 * while the wallet waits (about 22,000 gas a cycle): room for a dozen more.
 * Unused gas isn't charged.
 */
const PAYS_DUE_CYCLES = new Set(['payDue', 'payoffNext']);
const GROWTH_ROOM = 300_000n;
const PENDING_KEY = 'fund-pending-tx';
/** At most this many toasts stack; the oldest go first. */
const MAX_TOASTS = 6;
/** The indexer takes a few seconds to catch up with a confirmed transaction. */
const INDEXER_LAG_MS = 6_000;

let toastSeq = 0;
/** A toast for a job of one or more transactions: pass it to each send and to the closing note. */
export const newToast = () => ++toastSeq;

/** A sent transaction that reverted on chain, with its block so it can be replayed to say why. */
class Reverted extends Error {
  constructor(
    readonly blockNumber: bigint,
    readonly gasUsed: bigint,
  ) {
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  // The action each job's toast belongs to (its approval step shows another label).
  const jobs = useRef(new Map<number, string>());
  const close = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  /** Show a step in a job's toast: a new toast goes on top, and a hash is added to its links. */
  const show = useCallback((id: number, label: string, status: Toast['status'], extra: { hash?: Hash; detail?: string } = {}) => {
    setToasts((ts) => {
      const old = ts.find((t) => t.id === id);
      const hashes = old?.hashes ?? [];
      const next: Toast = { id, label, status, detail: extra.detail, hashes: extra.hash && !hashes.includes(extra.hash) ? [...hashes, extra.hash] : hashes };
      // Once an action goes through, its earlier failed tries have nothing left to say.
      const job = (t: Toast) => jobs.current.get(t.id) ?? t.label;
      const kept = status === 'confirmed' ? ts.filter((t) => t.id === id || t.status !== 'failed' || job(t) !== (jobs.current.get(id) ?? label)) : ts;
      return old ? kept.map((t) => (t.id === id ? next : t)) : [next, ...kept].slice(0, MAX_TOASTS);
    });
  }, []);
  // Contract wallets (Safes) by address, so each is looked up once.
  const contractWallets = useRef(new Map<string, boolean>());

  const finish = useCallback(
    async (id: number, label: string, hash: Hash, project: Address) => {
      show(id, label, 'submitted', { hash });
      try {
        const receipt = await client!.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Reverted(receipt.blockNumber, receipt.gasUsed);
        show(id, label, 'confirmed');
        return receipt;
      } finally {
        writePending(null);
        refresh(project);
        // Again once the indexer has caught up, so lists and history show it.
        setTimeout(() => refresh(project, true), INDEXER_LAG_MS);
      }
    },
    [client, refresh, show],
  );

  // A transaction sent before a reload: show it until it confirms.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !client) return;
    resumed.current = true;
    const p = readPending();
    if (p && p.chainId === chain.id) {
      const id = newToast();
      finish(id, p.label, p.hash, p.project).catch((e) => show(id, p.label, 'failed', { hash: p.hash, detail: explain(e) }));
    }
  }, [client, chain.id, finish, show]);

  const sendOne = useCallback(
    async (id: number, label: string, call: Call, project: Address, amount?: (v: unknown) => string) => {
      let hash: Hash | undefined;
      let gas = 0n;
      try {
        if (!address) throw new Error('Connect your wallet first.');
        if (chainId !== chain.id) {
          show(id, label, 'switch');
          await switchChain(config, { chainId: chain.id });
        }
        show(id, label, 'wallet');
        const request = { ...call, account: address };
        await client!.simulateContract(request);
        const estimate = await client!.estimateContractGas(request);
        gas = GAS_PAD(estimate) + (PAYS_DUE_CYCLES.has(call.functionName) ? GROWTH_ROOM : 0n);
        if (!contractWallets.current.has(address)) {
          contractWallets.current.set(address, Boolean(await client!.getCode({ address })));
        }
        const safe = contractWallets.current.get(address);
        const sent = await writeContract(config, { ...request, chainId: chain.id, gas });
        if (safe) {
          // The hash is the Safe's own, not a network transaction yet. The
          // page re-reads the chain regularly, so it updates once it runs.
          show(id, label, 'safe');
          return null;
        }
        hash = sent;
        writePending({ hash, label, project, chainId: chain.id });
        return await finish(id, label, hash, project);
      } catch (e) {
        let detail = explain(e, amount);
        // Replayed at its block, a reverted transaction names the refusal (a cycle came due while the wallet waited, say).
        if (e instanceof Reverted && address) {
          try {
            await client!.simulateContract({ ...call, account: address, blockNumber: e.blockNumber });
            // It would succeed now, so it ran out of gas: it had more to do by the time it ran.
            if (gas && e.gasUsed * 100n >= gas * 97n)
              detail = 'Nothing was changed. More had come due by the time your wallet sent it, so it needed more gas than it was given. Try again.';
          } catch (why) {
            detail = `Nothing was changed. ${explain(why, amount)}`;
          }
        }
        show(id, label, 'failed', { hash, detail });
        throw e;
      }
    },
    [address, chainId, chain.id, config, client, finish, show],
  );

  const send = useCallback<Send>(
    async (label, call, { project, amount, approve, toast }) => {
      const id = toast ?? newToast();
      jobs.current.set(id, label);
      if (approve && address) {
        const [allowance, balance] = await Promise.all([
          client!.readContract({ address: approve.token, abi: erc20Abi, functionName: 'allowance', args: [address, call.address] }),
          client!.readContract({ address: approve.token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        ]);
        // Short of the token, the call fails like a missing approval would: say so instead of asking for one.
        if (balance < approve.amount) {
          const fmt = amount ?? String;
          const detail = `This wallet has ${fmt(balance)}; this needs ${fmt(approve.amount)}.`;
          show(id, label, 'failed', { detail });
          throw new Error(detail);
        }
        if (allowance < approve.amount) {
          try {
            await client!.simulateContract({ ...call, account: address });
          } catch (e) {
            if (!isAllowanceRefusal(e)) {
              show(id, label, 'failed', { detail: explain(e, amount) });
              throw e;
            }
          }
          const approved = await sendOne(id, approve.label, { address: approve.token, abi: erc20Abi, functionName: 'approve', args: [call.address, approve.amount] }, project, amount);
          // A Safe queues the approval for its signers; the call waits until it has run.
          if (!approved) return null;
        }
      }
      return sendOne(id, label, call, project, amount);
    },
    [address, client, sendOne, show],
  );

  const note = useCallback<Note>((label, detail, failed, toast) => show(toast ?? newToast(), label, failed ? 'failed' : 'confirmed', { detail }), [show]);

  return (
    <TxContext.Provider value={{ send, note }}>
      {children}
      {createPortal(
        <div className="fund-toast-region" role="status" aria-live="polite">
          {toasts.map((t) => (
            <TxToast key={t.id} toast={t} chain={chain} onClose={close} />
          ))}
        </div>,
        document.body,
      )}
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

const STATUS_TEXT: Record<Exclude<Toast['status'], 'switch'>, string> = {
  wallet: 'Confirm in your wallet…',
  submitted: 'Sent. Waiting for the network to confirm it…',
  confirmed: 'Confirmed.',
  failed: "Didn't go through.",
  safe: 'Sent to your Safe. The other signers need to approve it in Safe{Wallet}. This page updates once it runs.',
};

function TxToast({ toast, chain, onClose }: { toast: Toast; chain: Chain; onClose: (id: number) => void }) {
  // Confirmations clear themselves; failures and Safe notices stay until closed.
  useEffect(() => {
    if (toast.status !== 'confirmed') return;
    const t = setTimeout(() => onClose(toast.id), 8000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  const explorer = chain.blockExplorers?.default;
  const status = toast.status === 'switch' ? `Switch your wallet to ${chain.name}…` : STATUS_TEXT[toast.status];
  return (
    <div className={`fund-toast fund-toast-${toast.status}`}>
      <div>
        <strong>{toast.label}</strong>
        <p>
          {status}
          {toast.detail && ` ${toast.detail}`}
        </p>
        {explorer && toast.hashes.length > 0 && (
          <span className="fund-toast-links">
            {toast.hashes.length === 1 ? (
              <a href={`${explorer.url}/tx/${toast.hashes[0]}`} target="_blank" rel="noopener">
                View on {explorer.name}
              </a>
            ) : (
              <>
                On {explorer.name}:
                {toast.hashes.map((h, i) => (
                  <a key={h} href={`${explorer.url}/tx/${h}`} target="_blank" rel="noopener">
                    transaction {i + 1}
                  </a>
                ))}
              </>
            )}
          </span>
        )}
      </div>
      {toast.status !== 'wallet' && toast.status !== 'switch' && (
        <button type="button" className="fund-toast-close" aria-label="Close" onClick={() => onClose(toast.id)}>
          ×
        </button>
      )}
    </div>
  );
}
