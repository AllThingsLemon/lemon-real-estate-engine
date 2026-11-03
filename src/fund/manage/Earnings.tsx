// Earnings (Manager): pay interest, split earnings, send development funds to
// the company wallet, and where LEMX compounding stands.
import { useState } from 'react';
import { formatAmount } from '../format';
import { paymentsDue } from '../health';
import { Row } from '../ui';
import { Addr, AmountField, Section, amountOf, useAction, type ProjectView } from './fields';
import { PayAll, ReminderButton } from './PayAll';

const NO_SWAP = `0x${'0'.repeat(64)}`;

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

function Compounding({ v }: { v: ProjectView }) {
  const s = v.data.state;
  const inFlight = s.activeSwapId !== NO_SWAP;
  return (
    <Section title="LEMX compounding">
      <dl className="fp-list fm-list">
        <Row label="Set aside for LEMX" value={v.amount(s.compoundPending)} />
        {inFlight && <Row label="Purchase in progress" value={v.amount(s.compoundInFlight)} tone="warn" />}
        <Row label="LEMX held, unlocked" value={`${formatAmount(s.lemxHeld, 18, 4)} LEMX`} />
      </dl>
      <p className="fp-muted">
        Starting, finishing or cancelling a LEMX purchase needs a BNB fee quote the site can't make yet. Use the fund console for now.
      </p>
    </Section>
  );
}
