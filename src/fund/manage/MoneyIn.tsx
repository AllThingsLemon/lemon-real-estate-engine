// Money in: add money to cover payments (inject), repayment money
// (depositPayoff), funding one bucket (fund), recording a wire investment
// (Operations) and renewing deposits (Company). Inject, fund and repayment
// money need no role. Each approves the exact amount first.
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { CLASS_NAMES, formatDuration, formatTime, ratePercent } from '../format';
import { cyclesOwed } from '../positions';
import { classQuery, useWallet } from '../queries';
import { Addr, AddressField, AmountField, Section, amountOf, asAddress, useAction, type ProjectView } from './fields';

/** Project.Bucket, in the page's words. */
const BUCKETS = [
  'Interest reserve',
  'Management reserve',
  'Earnings available to split',
  'Repayment fund',
  'Development funds',
  'Set aside for LEMX',
  'Principal waiting to be placed',
] as const;
const PAYOFF_BUCKET = 3;
const PRINCIPAL_BUCKET = 6;

export function MoneyIn({ v }: { v: ProjectView }) {
  const wallet = useWallet(v.listing.project, v.token.address, v.account);
  const balance = wallet.data?.balance;
  return (
    <div className="fm-tab">
      <Simple
        v={v}
        balance={balance}
        title="Add money to cover payments"
        note="Fills the interest reserve, then the management reserve (and any deferred fees), and the rest becomes earnings available to split."
        label="Add money"
        fn="inject"
      />
      {!v.data.state.fullyRepaid && (
        <Simple
          v={v}
          balance={balance}
          title="Repayment money"
          note={`Property income or sale proceeds for repaying investors' principal. It goes to the repayment fund${v.roles.roles.includes('OPERATIONS_ROLE') ? ', recorded as from Operations' : ''}.`}
          label="Add to the repayment fund"
          fn="depositPayoff"
        />
      )}
      {v.roles.roles.includes('OPERATIONS_ROLE') && <WireInvestment v={v} balance={balance} />}
      {v.roles.roles.includes('COMPANY_ROLE') && <Renewals v={v} />}
      <FundBucket v={v} balance={balance} />
    </div>
  );
}

function Simple({ v, balance, title, note, label, fn }: { v: ProjectView; balance?: bigint; title: string; note: string; label: string; fn: 'inject' | 'depositPayoff' }) {
  const { busy, runWithApproval } = useAction(v);
  const [text, setText] = useState('');
  const amount = amountOf(text, v.token.decimals);
  const problem = balance !== undefined && amount > balance ? `This wallet has ${v.amount(balance)}.` : null;
  return (
    <Section title={title} note={note}>
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount > 0n && !problem && !busy) runWithApproval(`${label}: ${v.amount(amount)}`, amount, { functionName: fn, args: [amount] }, (r) => r && setText(''));
        }}
      >
        <AmountField label="Amount" value={text} onChange={setText} token={v.token} hint={balance !== undefined ? `This wallet has ${v.amount(balance)}` : undefined} />
        {problem && <p className="fp-bad">{problem}</p>}
        <button type="submit" className="fp-btn" disabled={amount === 0n || Boolean(problem) || busy}>
          {busy ? 'Waiting for your wallet…' : label}
        </button>
      </form>
    </Section>
  );
}

/**
 * creditedDeposit (Operations): an investor paid by wire. They're owed
 * `credit` (their principal); the wallet sending this delivers the USDT that
 * arrived, which can be less after conversion costs, up to the premium cap.
 */
function WireInvestment({ v, balance }: { v: ProjectView; balance?: bigint }) {
  const client = usePublicClient();
  const { busy, runWithApproval } = useAction(v);
  const [who, setWho] = useState('');
  const [creditText, setCreditText] = useState('');
  const [usdtText, setUsdtText] = useState('');
  const investor = asAddress(who);
  const type = useQuery(classQuery(client, v.listing.project, investor));
  const d = v.token.decimals;
  const credit = amountOf(creditText, d);
  const usdt = amountOf(usdtText, d);
  const { state: s, config } = v.data;
  const remaining = s.raiseCap - s.totalRaised;
  // Project.creditedDeposit: credit ≤ usdt × (1 + maxCreditPremiumBps).
  const cap = (usdt * (10_000n + config.maxCreditPremiumBps)) / 10_000n;
  const premium = `${Number(config.maxCreditPremiumBps) / 100}%`;

  const problem =
    investor && type.data === 0
      ? "That wallet isn't approved for this project. Approve it under Investors first."
      : credit > remaining
        ? `Only ${v.amount(remaining)} is left in this raise.`
        : credit > 0n && credit < config.minDeposit && credit !== remaining
          ? `The minimum investment is ${v.amount(config.minDeposit)}.`
          : usdt > 0n && credit < usdt
            ? "The investor can't be owed less than the USDT that arrived."
            : usdt > 0n && credit > cap
              ? `That's more than ${premium} above the USDT that arrived (at most ${v.amount(cap)}).`
              : balance !== undefined && usdt > balance
                ? `This wallet has ${v.amount(balance)}.`
                : null;
  const ready = Boolean(investor && type.data && credit > 0n && usdt > 0n && !problem && !busy);

  return (
    <Section
      title="Record a wire investment"
      note={`For an investor who paid off-chain. This wallet sends the USDT that arrived; the investor is owed their full investment, up to ${premium} more to cover conversion costs. ${v.amount(remaining)} is left in the raise.`}
    >
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) {
            runWithApproval(`Record ${v.amount(credit)} for ${who.slice(0, 6)}…`, usdt, { functionName: 'creditedDeposit', args: [investor, credit, usdt] }, (r) => {
              if (r) [setCreditText, setUsdtText].forEach((f) => f(''));
            });
          }
        }}
      >
        <AddressField
          label="Investor's wallet"
          value={who}
          onChange={setWho}
          hint={investor && type.data !== undefined ? (type.data === 0 ? 'Not approved' : `${CLASS_NAMES[type.data]} investor`) : undefined}
        />
        <AmountField label="The investor is owed" value={creditText} onChange={setCreditText} token={v.token} hint="Their principal: what they invested, and what interest is paid on." />
        <AmountField label="USDT that arrived" value={usdtText} onChange={setUsdtText} token={v.token} hint="This wallet sends it to the project." />
        {problem && <p className="fp-bad">{problem}</p>}
        <button type="submit" className="fp-btn" disabled={!ready}>
          {busy ? 'Waiting for your wallet…' : 'Record the investment'}
        </button>
      </form>
    </Section>
  );
}

/**
 * renew (Company): extend a matured or soon-to-mature deposit once, paying the
 * investor the renewal fee from this wallet. Its interest has to be current.
 */
function Renewals({ v }: { v: ProjectView }) {
  const { config } = v.data;
  // Matured, or maturing within three cycles.
  const horizon = v.now + 3n * v.cycleDuration;
  const due = v.deposits.filter((d) => !d.repaid && !d.renewed && BigInt(d.maturity) <= horizon);
  return (
    <Section
      wide
      title="Renew deposits"
      note={`Extends a deposit by ${formatDuration(config.renewalTerm)} from the later of its maturity and now, once only. This wallet pays the investor a fee of ${ratePercent(config.renewalFeeRate)}% of their principal.`}
    >
      {due.length === 0 ? (
        <p className="fp-muted">No deposits are matured or maturing in the next three cycles.</p>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <thead>
              <tr>
                <th scope="col">Deposit</th>
                <th scope="col">Investor</th>
                <th scope="col" className="fm-num">
                  Principal
                </th>
                <th scope="col">Matures</th>
                <th scope="col" className="fm-num">
                  Fee
                </th>
                <th scope="col">
                  <span className="fm-sr">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {due.map((d) => (
                <RenewRow key={String(d.id)} v={v} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function RenewRow({ v, d }: { v: ProjectView; d: ProjectView['deposits'][number] }) {
  const { busy, run, runWithApproval } = useAction(v);
  const fee = (d.principal * v.data.config.renewalFeeRate) / 100_000_000n;
  const owed = cyclesOwed(d, v.cycleDuration, v.now);
  const maturity = BigInt(d.maturity);
  const call = { functionName: 'renew', args: [d.id] };
  return (
    <tr>
      <td>#{String(d.id)}</td>
      <td>
        <Addr address={d.investor} chain={v.chain} />
      </td>
      <td className="fm-num">{v.amount(d.principal)}</td>
      <td>
        {formatTime(maturity, v.withTime)}
        {maturity <= v.now && ' (matured)'}
      </td>
      <td className="fm-num">{v.amount(fee)}</td>
      <td>
        {owed > 0n ? (
          <span className="fp-sub">Pay its interest due first</span>
        ) : (
          <button
            type="button"
            className="fp-btn fm-small"
            disabled={busy}
            onClick={() => (fee > 0n ? runWithApproval(`Renew deposit #${d.id}`, fee, call) : run(`Renew deposit #${d.id}`, call))}
          >
            Renew
          </button>
        )}
      </td>
    </tr>
  );
}

/** fund(bucket, amount): top up one bucket directly. Reserves above target flow on down the waterfall. */
function FundBucket({ v, balance }: { v: ProjectView; balance?: bigint }) {
  const id = useId();
  const { busy, runWithApproval } = useAction(v);
  const [bucket, setBucket] = useState(0);
  const [text, setText] = useState('');
  const amount = amountOf(text, v.token.decimals);
  const repaid = v.data.state.fullyRepaid && (bucket === PAYOFF_BUCKET || bucket === PRINCIPAL_BUCKET);
  const problem = repaid
    ? 'Every deposit is repaid, so this bucket takes no more money.'
    : balance !== undefined && amount > balance
      ? `This wallet has ${v.amount(balance)}.`
      : null;
  return (
    <Section title="Fund one bucket" note="For moving money into one part of the project directly. Reserves above their target flow on into earnings.">
      <details className="fm-details">
        <summary>Show</summary>
        <form
          className="fm-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (amount > 0n && !problem && !busy) runWithApproval(`Fund ${BUCKETS[bucket]}: ${v.amount(amount)}`, amount, { functionName: 'fund', args: [bucket, amount] }, (r) => r && setText(''));
          }}
        >
          <div className="fp-field">
            <label htmlFor={id}>Bucket</label>
            <select id={id} className="fm-select" value={bucket} onChange={(e) => setBucket(Number(e.target.value))}>
              {BUCKETS.map((b, i) => (
                <option key={b} value={i}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <AmountField label="Amount" value={text} onChange={setText} token={v.token} />
          {problem && <p className="fp-bad">{problem}</p>}
          <button type="submit" className="fp-btn fp-btn-quiet" disabled={amount === 0n || Boolean(problem) || busy}>
            {busy ? 'Waiting for your wallet…' : 'Fund it'}
          </button>
        </form>
      </details>
    </Section>
  );
}

