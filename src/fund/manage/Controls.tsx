// Controls (Admin): stop or resume deposits, pause, close the raise, and
// propose new company or fee wallets (the current wallet has to accept).
import { useId, useState } from 'react';
import type { Address } from 'viem';
import { Addr, AddressField, Section, asAddress, useAction, type ProjectView } from './fields';

export function Controls({ v }: { v: ProjectView }) {
  const s = v.data.state;
  const { busy, run } = useAction(v);
  return (
    <div className="fm-tab">
      <Section title="Deposits" note="Only investor deposits stop. Payments, repayments and everything else keep running.">
        {s.killed ? (
          <>
            <p className="fp-warn">Deposits are stopped.</p>
            <button type="button" className="fp-btn" disabled={busy} onClick={() => run('Resume deposits', { functionName: 'cancelKill' })}>
              Resume deposits
            </button>
          </>
        ) : (
          <button type="button" className="fp-btn fp-btn-quiet" disabled={busy || s.closed} onClick={() => run('Stop deposits', { functionName: 'kill' })}>
            Stop deposits
          </button>
        )}
      </Section>

      <Section title="Pause" note="Pausing stops deposits and development withdrawals. Investor payments keep running.">
        {s.paused ? (
          <>
            <p className="fp-warn">The project is paused.</p>
            <button type="button" className="fp-btn" disabled={busy} onClick={() => run('Unpause', { functionName: 'unpause' })}>
              Unpause
            </button>
          </>
        ) : (
          <button type="button" className="fp-btn fp-btn-quiet" disabled={busy} onClick={() => run('Pause', { functionName: 'pause' })}>
            Pause
          </button>
        )}
      </Section>

      <CloseRaise v={v} />
      <WalletHandover
        v={v}
        title="Company wallet"
        note="Development funds are sent here. The current company wallet has to accept a replacement."
        current={v.roles.companyWallet}
        pending={v.roles.pendingCompanyWallet}
        fn="proposeCompanyWallet"
      />
      <WalletHandover
        v={v}
        title="Management fee wallet"
        note="Management fees are paid here. The current fee wallet has to accept a replacement."
        current={v.roles.mgmtFeeWallet}
        pending={v.roles.pendingMgmtFeeWallet}
        fn="proposeMgmtFeeWallet"
      />
    </div>
  );
}

function CloseRaise({ v }: { v: ProjectView }) {
  const id = useId();
  const { busy, run } = useAction(v);
  const [typed, setTyped] = useState('');
  if (v.data.state.closed) {
    return (
      <Section title="Close the raise">
        <p className="fp-muted">The raise is closed.</p>
      </Section>
    );
  }
  const match = typed.trim() === v.listing.title.trim();
  return (
    <Section title="Close the raise" note={`Stops deposits for good. This can't be undone. ${v.amount(v.data.state.totalRaised)} has been raised.`}>
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (match && !busy) run('Close the raise', { functionName: 'closeProject' });
        }}
      >
        <div className="fp-field">
          <label htmlFor={id}>
            Type <strong>{v.listing.title}</strong> to confirm
          </label>
          <div className="fp-input">
            <input id={id} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="fp-btn fm-danger" disabled={!match || busy}>
          {busy ? 'Waiting for your wallet…' : 'Close the raise'}
        </button>
      </form>
    </Section>
  );
}

function WalletHandover({
  v,
  title,
  note,
  current,
  pending,
  fn,
}: {
  v: ProjectView;
  title: string;
  note: string;
  current: Address;
  pending: Address | null;
  fn: 'proposeCompanyWallet' | 'proposeMgmtFeeWallet';
}) {
  const { busy, run } = useAction(v);
  const [text, setText] = useState('');
  const next = asAddress(text);
  return (
    <Section title={title} note={note}>
      <p>
        Now: <Addr address={current} chain={v.chain} />
        {pending && (
          <>
            {' '}
            · proposed: <Addr address={pending} chain={v.chain} />, waiting for the current wallet to accept
          </>
        )}
      </p>
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (next && !busy) run(`Propose a new ${title.toLowerCase()}`, { functionName: fn, args: [next] }, (r) => r && setText(''));
        }}
      >
        <AddressField label={pending ? 'Propose a different wallet' : 'Propose a new wallet'} value={text} onChange={setText} />
        <button type="submit" className="fp-btn fp-btn-quiet" disabled={!next || busy}>
          {busy ? 'Waiting for your wallet…' : 'Propose'}
        </button>
      </form>
    </Section>
  );
}
