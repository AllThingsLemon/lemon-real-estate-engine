// Earnings (Manager): pay interest, split earnings, send development funds to
// the company wallet, and where LEMX compounding stands.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { parseUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { formatAmount } from '../format';
import { paymentsDue } from '../health';
import { upkeepQuery, type UpkeepData } from '../queries';
import { Row } from '../ui';
import { Addr, AmountField, Section, amountOf, feeText, useAction, type ProjectView } from './fields';
import { PayAll, ReminderButton } from './PayAll';

export function Earnings({ v }: { v: ProjectView }) {
  return (
    <div className="fm-tab">
      <Section
        title="Interest payments"
        note="Nothing pays on its own. Each deposit falls due on its own date, so check here at least once a cycle, or set a reminder."
      >
        <PayAll v={v} />
        <ReminderButton v={v} />
      </Section>
      <Split v={v} />
      <Development v={v} />
      <Compounding v={v} />
    </div>
  );
}

function Split({ v }: { v: ProjectView }) {
  const { busy, run } = useAction(v);
  const [repay, setRepay] = useState('');
  const [dev, setDev] = useState('');
  const [compound, setCompound] = useState('');
  const s = v.data.state;
  const d = v.token.decimals;
  const parts = [amountOf(repay, d), amountOf(dev, d), amountOf(compound, d)] as const;
  const total = parts[0] + parts[1] + parts[2];

  if (paymentsDue(s, v.data.nextDue, v.now)) {
    return (
      <Section title="Split earnings">
        <p className="fp-muted">
          {v.amount(s.netEarnings)} available. Pay all interest due first: the contract refuses a split while payments are behind.
        </p>
      </Section>
    );
  }
  const problem =
    total > s.netEarnings
      ? `That's ${v.amount(total - s.netEarnings)} more than is available.`
      : parts[0] > 0n && s.fullyRepaid
        ? 'Every deposit is repaid, so nothing more can go to the repayment fund.'
        : null;
  const ready = total > 0n && !problem && !busy;

  return (
    <Section title="Split earnings" note={`${v.amount(s.netEarnings)} available to split.`}>
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) {
            run(`Split ${v.amount(total)}`, { functionName: 'split', args: [...parts] }, (r) => {
              if (r) [setRepay, setDev, setCompound].forEach((f) => f(''));
            });
          }
        }}
      >
        <AmountField label="To the repayment fund" value={repay} onChange={setRepay} token={v.token} hint="Repays investors' principal, oldest deposit first." />
        <AmountField label="To development funds" value={dev} onChange={setDev} token={v.token} hint="Can then be sent to the company wallet." />
        <AmountField label="Set aside for LEMX" value={compound} onChange={setCompound} token={v.token} />
        {problem && <p className="fp-bad">{problem}</p>}
        <button type="submit" className="fp-btn" disabled={!ready}>
          {busy ? 'Waiting for your wallet…' : total > 0n ? `Split ${v.amount(total)}` : 'Split'}
        </button>
      </form>
    </Section>
  );
}

function Development({ v }: { v: ProjectView }) {
  const { busy, run } = useAction(v);
  const [text, setText] = useState('');
  const s = v.data.state;
  const amount = amountOf(text, v.token.decimals);
  // withdrawDev's own checks, so the reason shows before the wallet opens.
  const blocked = s.paused
    ? 'The project is paused. Development funds wait until it resumes.'
    : paymentsDue(s, v.data.nextDue, v.now)
      ? 'Pay all interest due first.'
      : s.mgmtFeeDeferred > 0n
        ? `Deferred management fees (${v.amount(s.mgmtFeeDeferred)}) have to be paid first. They catch up as interest is paid.`
        : null;
  const problem = amount > s.devBalance ? `There's ${v.amount(s.devBalance)} available.` : null;
  const ready = amount > 0n && !blocked && !problem && !busy;

  return (
    <Section title="Development funds">
      <dl className="fp-list fm-list">
        <Row label="Available" value={v.amount(s.devBalance)} />
        <Row label="Company wallet" value={<Addr address={v.roles.companyWallet} chain={v.chain} />} />
      </dl>
      {blocked ? (
        <p className="fp-muted">{blocked}</p>
      ) : (
        <form
          className="fm-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) run(`Send ${v.amount(amount)} to the company`, { functionName: 'withdrawDev', args: [amount] }, (r) => r && setText(''));
          }}
        >
          <AmountField label="Amount" value={text} onChange={setText} token={v.token} max={s.devBalance} />
          {problem && <p className="fp-bad">{problem}</p>}
          <button type="submit" className="fp-btn" disabled={!ready}>
            {busy ? 'Waiting for your wallet…' : 'Send to company wallet'}
          </button>
        </form>
      )}
    </Section>
  );
}

/** 24 hourly slices (Project.COMPOUND_SLICES / COMPOUND_FREQUENCY). */
const SLICES = 24n;

function Compounding({ v }: { v: ProjectView }) {
  const client = usePublicClient();
  const upkeep = useQuery(upkeepQuery(client, v.lens, v.listing.project, true));
  const { busy, run } = useAction(v);
  const s = v.data.state;
  const u = upkeep.data;
  const lemx = (x: bigint) => `${formatAmount(x, 18, 4)} LEMX`;
  // Project._compoundFloor: LEMX per token at the feed price, less the slippage allowance (1e18 scale).
  const floor = u?.lemxPrice ? (10n ** 26n * (10_000n - v.data.config.compoundSlippageBps)) / (u.lemxPrice * 10_000n) : null;

  return (
    <Section title="LEMX compounding">
      <dl className="fp-list fm-list">
        <Row label="Set aside for LEMX" value={v.amount(s.compoundPending)} />
        {u?.swap && <Row label="Being bought" value={v.amount(s.compoundInFlight)} sub={`${u.swap.completed} of ${SLICES} slices filled`} tone="warn" />}
        <Row label="LEMX held, unlocked" value={lemx(s.lemxHeld)} />
      </dl>
      {!u ? (
        <p className="fp-muted">Checking…</p>
      ) : u.swap ? (
        <InFlight v={v} swap={u.swap} fee={u.fees && u.fees.deposit} />
      ) : s.compoundPending > 0n ? (
        <>
          <p className="fp-muted">
            Buys LEMX with {v.amount(s.compoundPending)} in {String(SLICES)} hourly slices
            {floor !== null && `, skipping any slice priced below ${formatAmount(floor, 18, 4)} LEMX per ${v.token.symbol}`}. Finishing locks the
            LEMX in the pool.
          </p>
          <button type="button" className="fp-btn" disabled={busy} onClick={() => run('Start buying LEMX', { functionName: 'startCompound' })}>
            {busy ? 'Waiting for your wallet…' : 'Start buying LEMX'}
          </button>
        </>
      ) : (
        <p className="fp-muted">Nothing is set aside. Split earnings to set some aside for LEMX.</p>
      )}
    </Section>
  );
}

function InFlight({ v, swap, fee }: { v: ProjectView; swap: NonNullable<UpkeepData['swap']>; fee: bigint | null | undefined }) {
  const { busy, run } = useAction(v);
  const [text, setText] = useState('');
  const [sure, setSure] = useState(false);
  const floor = (() => {
    try {
      return text.trim() ? parseUnits(text.trim(), 18) : null;
    } catch {
      return null;
    }
  })();
  const lower = floor !== null && floor < swap.minPrice;

  if (swap.done) {
    return (
      <>
        <p className="fp-ok">Every slice has filled.</p>
        <button type="button" className="fp-btn" disabled={busy || fee == null} onClick={() => run('Finish buying LEMX', { functionName: 'finalizeCompound', value: fee || undefined })}>
          {busy ? 'Waiting for your wallet…' : 'Finish the purchase'}
        </button>
        <p className="fp-sub">{feeText(fee, v.chain)}</p>
      </>
    );
  }
  return (
    <>
      <p className="fp-muted">
        {v.amount(swap.srcLeft)} still to buy. Slices priced below {formatAmount(swap.minPrice, 18, 4)} LEMX per {v.token.symbol} are skipped, so a
        purchase can stall when LEMX rises.
      </p>
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (lower && sure && floor !== null) run('Lower the LEMX floor', { functionName: 'escalateFloor', args: [floor] }, (r) => r && setText(''));
        }}
      >
        <div className="fp-field">
          <label htmlFor="fm-floor">New floor (LEMX per {v.token.symbol})</label>
          <div className="fp-input">
            <input id="fm-floor" inputMode="decimal" autoComplete="off" placeholder={formatAmount(swap.minPrice, 18, 4)} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {text.trim() && !lower && <p className="fp-sub fp-bad">The new floor has to be lower than the current one.</p>}
        </div>
        <label className="fp-check">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>I understand a lower floor buys LEMX at a worse price, and there's no limit on how low it can go.</span>
        </label>
        <button type="submit" className="fp-btn fp-btn-quiet" disabled={!lower || !sure || busy}>
          Lower the floor
        </button>
      </form>
      <p className="fp-muted">Cancelling returns the unspent {v.token.symbol} to "Set aside for LEMX" and locks the LEMX already bought in the pool.</p>
      <button type="button" className="fp-btn fp-btn-quiet" disabled={busy || fee == null} onClick={() => run('Cancel the LEMX purchase', { functionName: 'cancelCompound', value: fee || undefined })}>
        Cancel the purchase
      </button>
      <p className="fp-sub">{feeText(fee, v.chain)}</p>
    </>
  );
}
