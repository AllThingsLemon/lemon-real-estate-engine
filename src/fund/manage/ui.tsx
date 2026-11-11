// The manage dashboard's building blocks, after the fund dashboard's
// (dashboard/src/components) but styled with the site's own colours and
// fonts (fund.css, "mg-" classes). Sections, figures and fields can carry an
// ⓘ with what they show; every action button has a tooltip saying what it
// does. Buttons that send transactions run them as jobs and say why they
// can't be used instead of letting the contract refuse. A button that can't
// be used stays focusable (aria-disabled), so its tooltip and reason can be
// reached from the keyboard too.
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { Address, TransactionReceipt } from 'viem';
import { useAccount } from 'wagmi';
import { projectAbi } from '../abi';
import { explain } from '../errors';
import { formatTime, plainAmount, parseAmount, shortAddress } from '../format';
import { newToast, useSend, useTxNote, type Call } from '../tx';
import { DO } from './help';
import { InfoTip, useTip } from './Tip';
import { NEED_LABEL, useV, type Need, type View } from './view';

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';

const text = (n: ReactNode) => (typeof n === 'string' ? n : 'this');

/** A status pill. With `tip`, it can take focus and explains itself. */
export function Badge({ tone = 'neutral', tip, children }: { tone?: Tone; tip?: ReactNode; children: ReactNode }) {
  const t = useTip(tip);
  return (
    <>
      <span className={`mg-badge mg-${tone}`} tabIndex={tip ? 0 : undefined} {...t.trigger}>
        {children}
      </span>
      {t.bubble}
    </>
  );
}

export function Card({ title, subtitle, help, actions, children, flush }: { title?: ReactNode; subtitle?: ReactNode; help?: ReactNode; actions?: ReactNode; children?: ReactNode; flush?: boolean }) {
  return (
    <section className={`mg-card${flush ? ' mg-flush' : ''}`}>
      {(title || actions) && (
        <header className="mg-card-head">
          <div>
            {title && (
              <h2>
                {title}
                {help && <InfoTip about={text(title)}>{help}</InfoTip>}
              </h2>
            )}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="mg-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, help }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; help?: ReactNode }) {
  return (
    <div className="mg-stat">
      <div className="mg-label">
        {label}
        {help && <InfoTip about={text(label)}>{help}</InfoTip>}
      </div>
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

/** A list of label and value rows, divided by lines. */
export function Kvs({ children }: { children: ReactNode }) {
  return <div className="mg-kvs">{children}</div>;
}

/** One label and value row in a Kvs list. */
export function Kv({ k, v, hint, help }: { k: ReactNode; v: ReactNode; hint?: ReactNode; help?: ReactNode }) {
  return (
    <div className="mg-kv">
      <span>
        {k}
        {help && <InfoTip about={text(k)}>{help}</InfoTip>}
        {hint && <small>{hint}</small>}
      </span>
      <strong>{v}</strong>
    </div>
  );
}

/** A label and value on one line, outside a Kvs list (no divider). */
export function Line({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="mg-line">
      <span>{k}</span>
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
export function Field({ label, hint, error, help, children }: { label: string; hint?: ReactNode; error?: ReactNode; help?: ReactNode; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const note = error || hint;
  return (
    <div className="mg-field">
      <div className="mg-field-label">
        <label htmlFor={id}>{label}</label>
        {help && <InfoTip about={label}>{help}</InfoTip>}
      </div>
      {children(id, note ? `${id}-note` : undefined)}
      {note && (
        <p id={`${id}-note`} className={error ? 'mg-text-bad' : undefined}>
          {note}
        </p>
      )}
    </div>
  );
}

/** A small button with a tooltip (Max, Use the rest, Change…). */
export function TipButton({ tip, className = 'mg-link', onClick, disabled, children }: { tip: ReactNode; className?: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  const t = useTip(tip);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={onClick} {...t.trigger}>
        {children}
      </button>
      {t.bubble}
    </>
  );
}

/** A link with a tooltip. */
export function TipLink({ tip, href, className = 'mg-link', current, place, external, children }: { tip: ReactNode; href: string; className?: string; current?: boolean; place?: 'top' | 'right'; external?: boolean; children: ReactNode }) {
  const t = useTip(tip, place);
  return (
    <>
      <a className={className} href={href} aria-current={current ? 'page' : undefined} {...(external ? { target: '_blank', rel: 'noopener' } : {})} {...t.trigger}>
        {children}
      </a>
      {t.bubble}
    </>
  );
}

/** Back to /manage/'s project list. */
export const BackLink = () => (
  <TipLink className="mg-back" tip="Back to this site’s projects." href="#">
    <span aria-hidden="true">←</span> All projects
  </TipLink>
);

/** A token amount input with the symbol and an optional Max. */
export function AmountInput({ id, describedBy, value, onChange, max, disabled }: { id: string; describedBy?: string; value: string; onChange: (s: string) => void; max?: bigint; disabled?: boolean }) {
  const v = useV();
  return (
    <div className="mg-amount">
      <input id={id} aria-describedby={describedBy} inputMode="decimal" autoComplete="off" placeholder="0" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <span>{v.token.symbol}</span>
      {max !== undefined && max > 0n && (
        <TipButton className="mg-max" tip={`Fills in the most available: ${v.amount(max)}.`} disabled={disabled} onClick={() => onChange(plainAmount(max, v.token.decimals))}>
          Max
        </TipButton>
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
  const link = useTip(a ? `${a} — opens in the block explorer.` : undefined);
  if (!a) return <span className="mg-muted">—</span>;
  const explorer = v.chain.blockExplorers?.default.url;
  const shown = full ? a : shortAddress(a);
  return (
    <span className="mg-addr">
      {explorer ? (
        <>
          <a href={`${explorer}/address/${a}`} target="_blank" rel="noopener" {...link.trigger}>
            {shown}
          </a>
          {link.bubble}
        </>
      ) : (
        <span>{shown}</span>
      )}
      <TipButton
        className="mg-copy"
        tip={copied ? 'Copied.' : DO.copy}
        onClick={() => {
          navigator.clipboard?.writeText(a).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
        <span className="mg-sr">{copied ? 'Copied' : `Copy ${a}`}</span>
      </TipButton>
    </span>
  );
}

/** Buttons in a group, one pressed (the fund dashboard's Tabs, for filters). */
export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; tip?: ReactNode }[]; label: string }) {
  return (
    <div className="mg-segmented" role="group" aria-label={label}>
      {items.map((i) => (
        <SegmentButton key={i.id} pressed={value === i.id} tip={i.tip} onClick={() => onChange(i.id)}>
          {i.label}
        </SegmentButton>
      ))}
    </div>
  );
}

function SegmentButton({ pressed, tip, onClick, children }: { pressed: boolean; tip?: ReactNode; onClick: () => void; children: ReactNode }) {
  const t = useTip(tip);
  return (
    <>
      <button type="button" aria-pressed={pressed} onClick={onClick} {...t.trigger}>
        {children}
      </button>
      {t.bubble}
    </>
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
    // One toast for the whole job, so it keeps a link to each transaction.
    const toast = newToast();
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
            toast,
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
      if (summary) note(title, summary, false, toast);
      return true;
    } catch (e) {
      if (!toasted) note(title, explain(e, amount), true, toast);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Why a wallet can't use an action: a role it lacks. (No wallet is handled separately.) */
function useBlock(need: Need | null | undefined) {
  const v = useV();
  if (need && !v.can(need)) return `🔒 ${NEED_LABEL[need]} only`;
  return null;
}

/**
 * A transaction button with a tooltip saying what it does. Without a wallet
 * it opens the connect dialog; without the role, or while `disabled`, it
 * says why underneath and does nothing when pressed.
 */
export function ActionButton({
  title,
  tip,
  run,
  need = null,
  disabled,
  reason,
  onDone,
  quiet,
  danger,
  small,
  confirm,
  note,
  children,
}: {
  title: string;
  /** What pressing it does. */
  tip: ReactNode;
  run: (ctx: JobCtx) => Promise<void>;
  need?: Need | null;
  disabled?: boolean;
  /** Why it's disabled, when it is. */
  reason?: string;
  onDone?: () => void;
  quiet?: boolean;
  danger?: boolean;
  small?: boolean;
  /** Ask first: a dialog saying what will happen, with this button to go ahead. */
  confirm?: { body: ReactNode; label: string };
  /** A line under the button while it can be pressed, such as the BNB it sends. */
  note?: string;
  children: ReactNode;
}) {
  const v = useV();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const job = useJob();
  const block = useBlock(need);
  const t = useTip(tip);
  const whyId = useId();
  const headId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const connected = isConnected && Boolean(v.account);
  const off = !connected ? false : Boolean(block) || Boolean(disabled) || job.busy;
  const why = !connected ? 'Connect a wallet to act.' : (block ?? (disabled ? reason : undefined));
  const cls = `mg-btn${quiet || !connected ? ' mg-quiet' : ''}${danger && connected ? ' mg-danger' : ''}${small ? ' mg-small' : ''}`;
  const go = async () => {
    if (await job.run(title, run)) onDone?.();
  };
  return (
    <span className="mg-act">
      <button
        type="button"
        className={cls}
        {...t.trigger}
        aria-describedby={[t.trigger['aria-describedby'], why ? whyId : null].filter(Boolean).join(' ') || undefined}
        aria-disabled={off || undefined}
        aria-busy={job.busy || undefined}
        aria-haspopup={confirm ? 'dialog' : undefined}
        onClick={() => {
          if (!connected) return openConnectModal?.();
          if (off) return;
          if (confirm) ref.current?.showModal();
          else void go();
        }}
      >
        {job.busy ? 'Waiting for your wallet…' : children}
      </button>
      {why ? <small id={whyId}>{why}</small> : note && <small>{note}</small>}
      {t.bubble}
      {confirm && (
        <dialog ref={ref} className="mg-dialog" aria-labelledby={headId}>
          <form method="dialog">
            <h2 id={headId}>{title}</h2>
            <div className="mg-dialog-body">{confirm.body}</div>
            <div className="mg-dialog-foot">
              <button type="submit" className="mg-btn mg-quiet" value="cancel">
                Cancel
              </button>
              <button type="submit" className={`mg-btn${danger ? ' mg-danger' : ''}`} value="confirm" onClick={() => void go()}>
                {confirm.label}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </span>
  );
}

/** A transaction behind a confirmation dialog, for consequential or permanent actions. */
export function ConfirmButton({
  label,
  tip,
  title,
  body,
  confirm,
  run,
  need,
  danger,
  disabled,
  reason,
  small,
  note,
}: {
  label: ReactNode;
  /** What pressing it (and confirming) does. */
  tip: ReactNode;
  title: string;
  body: ReactNode;
  confirm: string;
  run: (ctx: JobCtx) => Promise<void>;
  need: Need | null;
  danger?: boolean;
  disabled?: boolean;
  reason?: string;
  small?: boolean;
  /** A line under the button while it can be pressed, such as the BNB it sends. */
  note?: string;
}) {
  const v = useV();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const ref = useRef<HTMLDialogElement>(null);
  const job = useJob();
  const block = useBlock(need);
  const t = useTip(tip);
  const headId = useId();
  const whyId = useId();
  const connected = isConnected && Boolean(v.account);
  const off = !connected ? false : Boolean(block) || Boolean(disabled) || job.busy;
  const why = !connected ? 'Connect a wallet to act.' : (block ?? (disabled ? reason : undefined));
  return (
    <span className="mg-act">
      <button
        type="button"
        className={`mg-btn mg-quiet${small ? ' mg-small' : ''}`}
        {...t.trigger}
        aria-describedby={[t.trigger['aria-describedby'], why ? whyId : null].filter(Boolean).join(' ') || undefined}
        aria-disabled={off || undefined}
        aria-haspopup="dialog"
        onClick={() => {
          if (!connected) return openConnectModal?.();
          if (!off) ref.current?.showModal();
        }}
      >
        {job.busy ? 'Waiting for your wallet…' : label}
      </button>
      {why ? <small id={whyId}>{why}</small> : note && <small>{note}</small>}
      {t.bubble}
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

/** A label inside a sentence: "Set aside for LEMX" → "set aside for LEMX" (keeps acronyms). */
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "in 3d 4h" or "2h ago", against the chain's clock. */
export const relative = (t: number | bigint, now: number | bigint) => {
  const a = Number(t);
  const b = Number(now);
  return a >= b ? `in ${duration(a - b)}` : `${duration(b - a)} ago`;
};

/** A relative time ("in 3h", "matured 2d ago") with the exact date and time in its tooltip. */
export function When({ t, prefix = '', className }: { t: bigint | number; prefix?: string; className?: string }) {
  const v = useV();
  const date = new Date(Number(t) * 1000);
  const tip = useTip(date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
  return (
    <>
      <time className={`mg-when${className ? ` ${className}` : ''}`} dateTime={date.toISOString()} tabIndex={0} {...tip.trigger}>
        {prefix}
        {relative(t, v.now)}
      </time>
      {tip.bubble}
    </>
  );
}

/** A date as the page shows it, with the exact date and time, and how long from now, on hover or focus. */
export function Dated({ t }: { t: bigint }) {
  const v = useV();
  const date = new Date(Number(t) * 1000);
  const tip = useTip(`${date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} (${relative(t, v.now)})`);
  return (
    <>
      <time className="mg-when" dateTime={date.toISOString()} tabIndex={0} {...tip.trigger}>
        {formatTime(t, v.withTime)}
      </time>
      {tip.bubble}
    </>
  );
}
