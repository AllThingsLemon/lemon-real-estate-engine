// Form pieces for the manage page, and what every tab gets about the project.
import { useId, useState, type ReactNode } from 'react';
import { isAddress, type Address, type Chain, type TransactionReceipt } from 'viem';
import { parseAmount, plainAmount, shortAddress } from '../format';
import type { Deposit, Listing, ProjectData, Roles } from '../queries';
import { useSend, type Call } from '../tx';
import { projectAbi } from '../abi';

/** What each tab needs about the project being managed. */
export interface ProjectView {
  listing: Listing;
  chain: Chain;
  account: Address;
  token: { address: Address; decimals: number; symbol: string };
  cycleDuration: bigint;
  data: ProjectData;
  deposits: readonly Deposit[];
  roles: Roles;
  /** The chain's time. */
  now: bigint;
  /** Due dates need the time of day when cycles are shorter than a day (the sandbox). */
  withTime: boolean;
  amount: (v: bigint) => string;
}

/** A typed address, or null while it isn't one. */
export const asAddress = (text: string): Address | null => (isAddress(text.trim(), { strict: false }) ? (text.trim() as Address) : null);

export function AddressField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  const id = useId();
  const bad = value.trim() !== '' && !asAddress(value);
  return (
    <div className="fp-field">
      <label htmlFor={id}>{label}</label>
      <div className="fp-input">
        <input
          id={id}
          className="fm-mono"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={bad}
          aria-describedby={hint || bad ? `${id}-hint` : undefined}
        />
      </div>
      {(hint || bad) && (
        <p id={`${id}-hint`} className={`fp-sub${bad ? ' fp-bad' : ''}`}>
          {bad ? "That isn't a wallet address: 0x followed by 40 letters and numbers." : hint}
        </p>
      )}
    </div>
  );
}

export function AmountField({
  label,
  value,
  onChange,
  token,
  max,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  token: ProjectView['token'];
  max?: bigint;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="fp-field">
      <label htmlFor={id}>{label}</label>
      <div className="fp-input">
        <input id={id} inputMode="decimal" autoComplete="off" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} />
        <span>{token.symbol}</span>
        {max !== undefined && (
          <button type="button" onClick={() => onChange(plainAmount(max, token.decimals))}>
            Max
          </button>
        )}
      </div>
      {hint && <p className="fp-sub">{hint}</p>}
    </div>
  );
}

/** Typed amount → units, treating anything unreadable as 0 (the form shows why). */
export const amountOf = (text: string, decimals: number) => parseAmount(text, decimals) ?? 0n;

export function Addr({ address, chain }: { address: Address; chain: Chain }) {
  const explorer = chain.blockExplorers?.default.url;
  return explorer ? (
    <a className="fm-mono" href={`${explorer}/address/${address}`} target="_blank" rel="noopener" title={address}>
      {shortAddress(address)}
    </a>
  ) : (
    <span className="fm-mono" title={address}>
      {shortAddress(address)}
    </span>
  );
}

/** A titled block inside a tab. `wide` spans the whole tab, for tables. */
export function Section({ title, children, note, wide }: { title: string; children: ReactNode; note?: ReactNode; wide?: boolean }) {
  return (
    <section className={`fm-section${wide ? ' fm-wide' : ''}`}>
      <h3>{title}</h3>
      {note && <p className="fp-muted">{note}</p>}
      {children}
    </section>
  );
}

/** Send one of the project's transactions, with a busy flag for the button. The toast reports failures. */
export function useAction(v: ProjectView) {
  const send = useSend();
  const [busy, setBusy] = useState(false);
  async function run(label: string, call: Omit<Call, 'address' | 'abi'> & Partial<Pick<Call, 'address' | 'abi'>>, after?: (r: TransactionReceipt | null) => void) {
    setBusy(true);
    try {
      const receipt = await send(
        label,
        { address: v.listing.project, abi: projectAbi, ...call },
        { project: v.listing.project, amount: (x) => v.amount(BigInt(x as bigint)) },
      );
      after?.(receipt);
    } catch {
      // The toast says why.
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}
