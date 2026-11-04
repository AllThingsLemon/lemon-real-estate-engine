// The manage dashboard's building blocks, after the fund dashboard's
// (dashboard/src/components) but styled with the site's own colours and
// fonts (fund.css, "mg-" classes). Buttons that send transactions run them
// as jobs and say why they can't be used instead of letting the contract
// refuse.
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { Address, TransactionReceipt } from 'viem';
import { useAccount } from 'wagmi';
import { projectAbi } from '../abi';
import { explain } from '../errors';
import { plainAmount, parseAmount, shortAddress } from '../format';
import { useSend, useTxNote, type Call } from '../tx';
import { NEED_LABEL, useV, type Need, type View } from './view';

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`mg-badge mg-${tone}`}>{children}</span>;
}

export function Card({ title, subtitle, actions, children, flush }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; flush?: boolean }) {
  return (
    <section className={`mg-card${flush ? ' mg-flush' : ''}`}>
      {(title || actions) && (
        <header className="mg-card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="mg-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="mg-stat">
      <div className="mg-label">{label}</div>
      <div className={`mg-stat-value${tone ? ` mg-text-${tone}` : ''}`}>{value}</div>
      {sub && <div className="mg-stat-sub">{sub}</div>}
    </div>
  );
}

export function Bar({ value, total, tone = 'brand', label }: { value: bigint; total: bigint; tone?: Tone; label?: string }) {
  const pct = total > 0n ? Number((value * 10_000n) / total) / 100 : 0;
  return (
    <div className="mg-bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span className={`mg-fill-${tone}`} style={{ width: `${Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct))}%` }} />
    </div>
  );
}

export function Kv({ k, v, hint }: { k: ReactNode; v: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mg-kv">
      <span>
        {k}
        {hint && <small>{hint}</small>}
      </span>
      <strong>{v}</strong>
    </div>
  );
}

export function Callout({ tone = 'info', title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`mg-callout mg-${tone}`}>
      <div>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, children, icon = '○' }: { title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mg-empty">
      <div aria-hidden="true">{icon}</div>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Skeleton({ tall }: { tall?: boolean }) {
  return <div className={`mg-skeleton${tall ? ' mg-tall' : ''}`} />;
}

/** A labelled field. `children` gets the input's id so the label points at it. */
export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const note = error || hint;
  return (
    <div className="mg-field">
      <label htmlFor={id}>{label}</label>
      {children(id, note ? `${id}-note` : undefined)}
      {note && (
        <p id={`${id}-note`} className={error ? 'mg-text-bad' : undefined}>
          {note}
        </p>
      )}
    </div>
  );
}

/** A token amount input with the symbol and an optional Max. */
export function AmountInput({ id, describedBy, value, onChange, max, disabled }: { id: string; describedBy?: string; value: string; onChange: (s: string) => void; max?: bigint; disabled?: boolean }) {
  const v = useV();
  return (
    <div className="mg-amount">
      <input id={id} aria-describedby={describedBy} inputMode="decimal" autoComplete="off" placeholder="0" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <span>{v.token.symbol}</span>
      {max !== undefined && max > 0n && (
        <button type="button" disabled={disabled} onClick={() => onChange(plainAmount(max, v.token.decimals))}>
          Max
        </button>
      )}
    </div>
  );
}

/** Check a typed amount: [units, error]. Empty is [null, undefined]. */
export function checkAmount(v: View, text: string, opts: { max?: bigint; min?: bigint; maxLabel?: string } = {}): [bigint | null, string | undefined] {
  if (!text.trim()) return [null, undefined];
  const a = parseAmount(text, v.token.decimals);
  if (a === null) return [null, 'Enter a number.'];
  if (a <= 0n) return [null, 'Enter more than zero.'];
  if (opts.min !== undefined && a < opts.min) return [null, `At least ${v.amount(opts.min)}.`];
  if (opts.max !== undefined && a > opts.max) return [null, `That's more than ${opts.maxLabel ?? 'is available'} (${v.amount(opts.max)}).`];
  return [a, undefined];
}

/** An address linking to the explorer, with a copy button. */
export function Addr({ a, full }: { a: Address | string | null | undefined; full?: boolean }) {
  const v = useV();
  const [copied, setCopied] = useState(false);
  if (!a) return <span className="mg-muted">—</span>;
  const explorer = v.chain.blockExplorers?.default.url;
  const text = full ? a : shortAddress(a);
  return (
    <span className="mg-addr" title={a}>
      {explorer ? (
        <a href={`${explorer}/address/${a}`} target="_blank" rel="noopener">
          {text}
        </a>
      ) : (
        <span>{text}</span>
      )}
      <button
        type="button"
        aria-label={copied ? 'Copied' : `Copy ${a}`}
        onClick={() => {
          navigator.clipboard?.writeText(a).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  );
}

/** Buttons in a group, one pressed (the fund dashboard's Tabs, for filters). */
export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="mg-segmented" role="group" aria-label={label}>
      {items.map((i) => (
        <button key={i.id} type="button" aria-pressed={value === i.id} onClick={() => onChange(i.id)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Jobs: one or more transactions and what they did ----------

export interface JobCtx {
  /** Send one of the project's transactions. `pulls`: it takes this much of the token (approved first if needed). */
  send: (label: string, call: Omit<Call, 'address' | 'abi'> & Partial<Pick<Call, 'address' | 'abi'>>, opts?: { pulls?: bigint }) => Promise<TransactionReceipt>;
  /** The closing line, shown when the job finishes. */
  done: (summary: string) => void;
}

/** A Safe queued the transaction for its other signers: the job stops there. */
class Queued extends Error {}

export function useJob() {
  const v = useV();
  const send = useSend();
  const note = useTxNote();
  const [busy, setBusy] = useState(false);
  const project = v.listing.project;
  const amount = (x: unknown) => v.amount(BigInt(x as bigint));

  async function run(title: string, fn: (ctx: JobCtx) => Promise<void>) {
    setBusy(true);
    let summary: string | undefined;
    // A failed transaction has shown its own toast; anything else gets one here.
    let toasted = false;
    const ctx: JobCtx = {
      send: async (label, call, opts = {}) => {
        try {
          const receipt = await send(label, { address: project, abi: projectAbi, ...call }, {
            project,
            amount,
            approve: opts.pulls ? { token: v.token.address, amount: opts.pulls, label: `Allow ${v.amount(opts.pulls)}` } : undefined,
          });
          if (!receipt) throw new Queued();
          return receipt;
        } catch (e) {
          toasted = true;
          throw e;
        }
      },
      done: (s) => {
        summary = s;
      },
    };
    try {
      await fn(ctx);
      if (summary) note(title, summary);
      return true;
    } catch (e) {
      if (!toasted) note(title, explain(e, amount), true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Why a wallet can't use an action: not connected, or a role it lacks. */
function useBlock(need: Need | null | undefined) {
  const v = useV();
  if (!v.account) return 'Connect a wallet to act.';
  if (need && !v.can(need)) return `Needs the ${NEED_LABEL[need]} role.`;
  return null;
}

/**
 * A transaction button. Without a wallet it opens the connect dialog; without
 * the role, or while `disabled`, it says why underneath.
 */
export function ActionButton({
  title,
  run,
  need = null,
  disabled,
  reason,
  onDone,
  quiet,
  danger,
  small,
  children,
}: {
  title: string;
  run: (ctx: JobCtx) => Promise<void>;
  need?: Need | null;
  disabled?: boolean;
  /** Why it's disabled, when it is. */
  reason?: string;
  onDone?: () => void;
  quiet?: boolean;
  danger?: boolean;
  small?: boolean;
  children: ReactNode;
}) {
  const v = useV();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const job = useJob();
  const block = useBlock(need);
  const cls = `mg-btn${quiet ? ' mg-quiet' : ''}${danger ? ' mg-danger' : ''}${small ? ' mg-small' : ''}`;
  if (!isConnected || !v.account)
    return (
      <span className="mg-act">
        <button type="button" className={`${cls} mg-quiet`} onClick={openConnectModal}>
          {children}
        </button>
        <small>Connect a wallet to act.</small>
      </span>
    );
  const why = block ?? (disabled ? reason : undefined);
  return (
    <span className="mg-act">
      <button
        type="button"
        className={cls}
        disabled={Boolean(block) || disabled || job.busy}
        aria-busy={job.busy || undefined}
        onClick={async () => {
          if (await job.run(title, run)) onDone?.();
        }}
      >
        {job.busy ? 'Waiting for your wallet…' : children}
      </button>
      {why && <small>{block && need ? `🔒 ${NEED_LABEL[need]} only` : why}</small>}
    </span>
  );
}

/** A transaction behind a confirmation dialog, for consequential or permanent actions. */
export function ConfirmButton({
  label,
  title,
  body,
  confirm,
  run,
  need,
  danger,
  disabled,
}: {
  label: ReactNode;
  title: string;
  body: ReactNode;
  confirm: string;
  run: (ctx: JobCtx) => Promise<void>;
  need: Need | null;
  danger?: boolean;
  disabled?: boolean;
}) {
  const v = useV();
  const ref = useRef<HTMLDialogElement>(null);
  const job = useJob();
  const block = useBlock(need);
  const headId = useId();
  return (
    <span className="mg-act">
      <button type="button" className="mg-btn mg-quiet" disabled={Boolean(block) || disabled || job.busy} onClick={() => ref.current?.showModal()}>
        {job.busy ? 'Waiting for your wallet…' : label}
      </button>
      {block && <small>{v.account && need ? `🔒 ${NEED_LABEL[need]} only` : block}</small>}
      <dialog ref={ref} className="mg-dialog" aria-labelledby={headId}>
        <form method="dialog">
          <h2 id={headId}>{title}</h2>
          <div className="mg-dialog-body">{body}</div>
          <div className="mg-dialog-foot">
            <button type="submit" className="mg-btn mg-quiet" value="cancel">
              Cancel
            </button>
            <button
              type="submit"
              className={`mg-btn${danger ? ' mg-danger' : ''}`}
              value="confirm"
              onClick={() => {
                void job.run(title, run);
              }}
            >
              {confirm}
            </button>
          </div>
        </form>
      </dialog>
    </span>
  );
}

/** Seconds → "3d 4h", "12m", "45s" (the dashboard's short durations). */
export function duration(sec: number): string {
  const s = Math.abs(Math.round(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 1) return h ? `${d}d ${h}h` : `${d}d`;
  if (h >= 1) return m ? `${h}h ${m}m` : `${h}h`;
  if (m >= 1) return `${m}m`;
  return `${s}s`;
}

/** "in 3d 4h" or "2h ago", against the chain's clock. */
export const relative = (t: number | bigint, now: number | bigint) => {
  const a = Number(t);
  const b = Number(now);
  return a >= b ? `in ${duration(a - b)}` : `${duration(b - a)} ago`;
};
