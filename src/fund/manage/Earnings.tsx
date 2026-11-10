// Earnings & payments: the pool account, paying investors, the reserves and
// adding money, and the history of payments and collections.
import { useState } from 'react';
import { usePublicClient } from 'wagmi';
import { NONE, plainAmount } from '../format';
import { feeFor, payInvestors, useLastPayRun } from './actions';
import { BUCKETS, Feed } from './Feed';
import { ixProblem, useIxActivity, useIxSnapshots } from './ix';
import { cycleWords } from './Overview';
import { InfoTip } from './Tip';
import { SnapshotChart } from './parts';
import { DO, H } from './help';
import { ActionButton, AmountInput, Bar, Callout, Card, Field, Kv, Kvs, Stat, TipButton, checkAmount, lowerFirst, relative } from './ui';
import { useD, useV, type State } from './view';

export function Earnings() {
  return (
    <div className="mg-stack">
      <div className="mg-grid-2">
        <PoolAccount />
        <Payments />
      </div>
      <Reserves />
      <History />
    </div>
  );
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max0 = (a: bigint) => (a > 0n ? a : 0n);

/** Where money coming in goes: the interest reserve's gap, then the management reserve's, then earnings. */
function waterfall(amount: bigint, s: State) {
  const toInterest = min(amount, max0(s.interestTarget - s.interestReserve));
  const toMgmt = min(amount - toInterest, max0(s.mgmtTarget - s.mgmtReserve));
  return { toInterest, toMgmt, toNet: amount - toInterest - toMgmt };
}

function PoolAccount() {
  const v = useV();
  const u = v.u;
  const w = waterfall(u.poolEarnings, v.s);
  const fee = feeFor(v, 'withdraw');
  return (
    <Card title="Liquidity pool account" help={H.poolAccount} subtitle="The project's principal earns as an account in the Loans liquidity pool.">
      <div className="mg-grid-2">
        <Stat label="Earnings to collect" help={H.toCollect} value={v.amount(u.poolEarnings)} tone={u.poolEarnings > 0n ? 'ok' : undefined} />
        <Stat label="Collected to date" help={H.collected} value={v.amount(u.earningsCollected, 0)} />
        <Stat label="Principal locked" help={H.locked} value={v.amount(u.lockedPrincipal, 0)} />
        <Stat label="Principal unlocked" help={H.unlocked} value={v.amount(u.unlockedPrincipal, 0)} sub={u.unlockedPrincipal > 0n ? 'Request it on the Repayment page.' : undefined} />
      </div>
      {u.poolEarnings > 0n && (
        <div className="mg-subpanel">
          <h3>Collecting now would put</h3>
          <Kvs>
            <Kv k="Interest reserve" v={v.amount(w.toInterest)} />
            <Kv k="Management reserve" v={v.amount(w.toMgmt)} />
            <Kv k="Earnings" v={v.amount(w.toNet)} />
          </Kvs>
          <p className="mg-muted mg-small-text">An estimate from the current targets. The pool may take a fee.</p>
        </div>
      )}
      <ActionButton
        title="Collect pool earnings"
        tip={DO.sweep}
        disabled={u.poolEarnings === 0n || fee === null}
        reason={u.poolEarnings === 0n ? 'No earnings to collect.' : "The pool's BNB fee can't be priced right now."}
        run={async (ctx) => {
          await ctx.send('Collect pool earnings', { functionName: 'sweep', value: fee || undefined });
          ctx.done('Earnings collected and shared out.');
        }}
      >
        Collect earnings
      </ActionButton>
    </Card>
  );
}

function Payments() {
  const v = useV();
  const d = useD();
  const client = usePublicClient();
  const s = v.s;
  const none = s.depositCount === 0n || v.nextDue === NONE;
  const last = useLastPayRun(v.listing.project);
  return (
    <Card title="Investor payments" help={H.investorPayments} subtitle={`Interest and management fees are paid on each deposit every ${cycleWords(v)} cycle, oldest deposit first. Nothing owed is ever forgiven.`}>
      {d.covered ? (
        <Callout tone="bad" title={`Deposit #${s.blockedFrom} is waiting: the money is in`}>
          The interest reserve and earnings cover it now. Pay investors to catch up.
        </Callout>
      ) : d.waiting && d.stuck ? (
        <Callout tone="bad" title={`Deposit #${s.blockedFrom} is waiting for ${v.amount(d.stuck.short)} more`}>
          The interest reserve and earnings ({v.amount(s.interestReserve + s.netEarnings)}) can't cover its next cycle. {v.amount(v.backlog)} of interest is due in all. Adding {v.amount(d.catchUp)} below pays everything due, fees included ({v.amount(d.stuck.short)} pays just the next cycle's interest). Or collect pool earnings, then pay again.
        </Callout>
      ) : none ? (
        <Callout tone="info">{s.depositCount === 0n ? 'No deposits yet.' : 'Nothing is scheduled.'}</Callout>
      ) : d.current ? (
        <Callout tone="ok" title="Investors are current">
          The next payment is due {relative(v.nextDue, v.now)}.
        </Callout>
      ) : (
        <Callout tone="warn" title={v.owed.size ? `${v.owed.size} deposit${v.owed.size === 1 ? '' : 's'} due` : 'A payment run is needed'}>
          {v.owed.size ? `${v.amount(v.backlog)} of interest is due.` : "Nothing is owed, but a run has to confirm it before earnings can be split."}
          {d.stuck && ` The interest reserve and earnings are ${v.amount(d.stuck.short)} short of deposit #${d.stuck.id}'s next cycle: add money below first.`}
          {d.catchUp > 0n && ` Adding ${v.amount(d.catchUp)} pays everything due, fees included.`}
        </Callout>
      )}
      {last && (
        <Callout tone="info" title={`Last payment run, ${v.now - last.at < 60n ? 'just now' : relative(last.at, v.now)}`}>
          {last.text}
        </Callout>
      )}
      <Kvs>
        <Kv k="Deposits due" v={v.owed.size} />
        <Kv k="Interest due" v={v.amount(v.backlog)} />
        <Kv k="Deferred management fees" v={v.amount(s.mgmtFeeDeferred)} hint="Paid from the management reserve first, once payments are current and it has money." />
        {d.catchUp > 0n && (
          <Kv
            k="To pay everything due"
            v={v.amount(d.catchUp)}
            hint={`Interest due and the management fees on it and those deferred, with the reserves back at their targets (the contract refills them before it pays deferred fees), less what's held. Each cycle adds ${v.amount(s.monthlyInterestOwed + v.ledger.monthlyMgmtFee)} more.`}
          />
        )}
        <Kv k="Interest per cycle" v={v.amount(s.monthlyInterestOwed)} />
        <Kv k="Management fee per cycle" v={v.amount(v.ledger.monthlyMgmtFee)} />
      </Kvs>
      <div className="mg-row-wrap">
        <ActionButton
          title="Pay investors"
          tip={DO.payInvestors}
          disabled={(d.current && !d.waiting) || !!d.stuck}
          reason={d.stuck ? `Add ${v.amount(d.stuck.short)} or more first: a run now would pay nothing.` : 'Investors are current.'}
          run={(ctx) => payInvestors(ctx, v, client!)}
        >
          Pay investors
        </ActionButton>
        <span className="mg-muted mg-small-text">Any wallet can run this. It only pays what's due.</span>
      </div>
    </Card>
  );
}

function Reserves() {
  const v = useV();
  const { catchUp } = useD();
  const s = v.s;
  const [amount, setAmount] = useState('');
  const [a, err] = checkAmount(v, amount);
  const [bucket, setBucket] = useState(0);
  const [fundAmt, setFundAmt] = useState('');
  const [f, fErr] = checkAmount(v, fundAmt);
  // fund() refuses the repayment fund and waiting principal once fully repaid (after pulling the token, so say it first).
  const closedBucket = (i: number) => s.fullyRepaid && (BUCKETS[i] === 'Repayment fund' || BUCKETS[i] === 'Principal waiting to be placed');
  const w = a ? waterfall(a, s) : null;
  return (
    <Card title="Reserves" help={H.reservesCard} subtitle="Investor interest is protected by a reserve of two cycles, and management fees by one cycle (plus anything deferred).">
      <div className="mg-grid-2">
        <div className="mg-stack">
          <ReserveBar label="Interest reserve" have={s.interestReserve} target={s.interestTarget} />
          <ReserveBar label="Management reserve" have={s.mgmtReserve} target={s.mgmtTarget} />
          <Kvs>
            <Kv k="Earnings (the backstop)" v={v.amount(s.netEarnings)} hint="Drawn on before a payment has to wait." />
          </Kvs>
        </div>
        <div className="mg-subpanel">
          <h3>
            Add money to cover payments <InfoTip about="adding money">{H.addMoney}</InfoTip>
          </h3>
          <p className="mg-muted">Fills the interest reserve, then the management reserve (and any deferred fees). The rest becomes earnings.</p>
          <Field label="Amount" error={err}>
            {(id, d) => <AmountInput id={id} describedBy={d} value={amount} onChange={setAmount} />}
          </Field>
          {catchUp > 0n && (
            <TipButton
              className="mg-btn mg-quiet mg-small"
              tip="Fills in the amount that pays every interest cycle due, the management fees on them and those deferred, and refills the reserves."
              onClick={() => setAmount(plainAmount(catchUp, v.token.decimals))}
            >
              Fill in {v.amount(catchUp)}: everything due
            </TipButton>
          )}
          {w && (
            <p className="mg-muted mg-small-text">
              → interest reserve {v.amount(w.toInterest)} · fees {v.amount(w.toMgmt)} · earnings {v.amount(w.toNet)}
            </p>
          )}
          <ActionButton
            title="Add money"
            tip={DO.addMoney}
            disabled={!a}
            reason="Enter an amount."
            run={async (ctx) => {
              await ctx.send(`Add money: ${v.amount(a!)}`, { functionName: 'inject', args: [a!] }, { pulls: a! });
              ctx.done(`Added ${v.amount(a!)}.`);
            }}
            onDone={() => setAmount('')}
          >
            Add money
          </ActionButton>
          <details className="mg-details">
            <summary>Fund one bucket instead</summary>
            <p className="mg-muted mg-small-text">{H.fundBucket}</p>
            <div className="mg-grid-2">
              <Field label="Bucket">
                {(id) => (
                  <select id={id} className="mg-input" value={bucket} onChange={(e) => setBucket(Number(e.target.value))}>
                    {BUCKETS.map((b, i) => (
                      <option key={b} value={i} disabled={closedBucket(i)}>
                        {b}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Amount" error={fErr}>
                {(id, d) => <AmountInput id={id} describedBy={d} value={fundAmt} onChange={setFundAmt} />}
              </Field>
            </div>
            <ActionButton
              small
              quiet
              title={`Fund ${lowerFirst(BUCKETS[bucket])}`}
              tip={DO.fundBucket}
              disabled={!f || closedBucket(bucket)}
              reason={closedBucket(bucket) ? 'Every deposit has been repaid, so this bucket takes no more money.' : 'Enter an amount.'}
              run={async (ctx) => {
                await ctx.send(`Fund ${lowerFirst(BUCKETS[bucket])}`, { functionName: 'fund', args: [bucket, f!] }, { pulls: f! });
                ctx.done(`Added ${v.amount(f!)} to ${lowerFirst(BUCKETS[bucket])}.`);
              }}
              onDone={() => setFundAmt('')}
            >
              Fund bucket
            </ActionButton>
          </details>
        </div>
      </div>
    </Card>
  );
}

function ReserveBar({ label, have, target }: { label: string; have: bigint; target: bigint }) {
  const v = useV();
  const low = have < target;
  return (
    <div className="mg-reserve">
      <div className="mg-line">
        <span>{label}</span>
        <strong className="mg-num">
          {v.amount(have)} <span className="mg-muted">of {v.amount(target)}</span>
        </strong>
      </div>
      <Bar value={have} total={target > 0n ? target : 1n} tone={low ? 'warn' : 'ok'} label={`${label} against its target`} />
      {low && <p className="mg-text-warn mg-small-text">{v.amount(target - have)} short</p>}
    </div>
  );
}

const PAYMENT_EVENTS = ['InterestPaid', 'InterestWaiting', 'MgmtFeePaid', 'MgmtFeeDeferred', 'DeferredMgmtFeePaid', 'EarningsClaimed', 'InjectionApplied'] as const;

function History() {
  const v = useV();
  const snaps = useIxSnapshots(v.listing.project);
  const pay = useIxActivity(v.listing.project, PAYMENT_EVENTS, 15);
  const items = pay.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="mg-grid-2">
      <Card title="Balances over time" help={H.balances}>
        {snaps.data ? (
          <SnapshotChart
            points={snaps.data}
            series={[
              { key: 'interestReserve', label: 'Interest reserve', color: 'var(--mg-info)' },
              { key: 'netEarnings', label: 'Earnings', color: 'var(--mg-brand)' },
              { key: 'payoffPool', label: 'Repayment fund', color: 'var(--warn)' },
            ]}
          />
        ) : (
          <p className="mg-muted">{snaps.error ? ixProblem(snaps.error, 'Balance history', true) : 'Loading…'}</p>
        )}
      </Card>
      <Card title="Payments and collections" help={H.paymentsFeed}>
        {items.length ? <Feed items={items} /> : <p className="mg-muted">{pay.isPending ? 'Loading…' : pay.error ? ixProblem(pay.error, 'Payment history', true) : 'Nothing yet.'}</p>}
        {pay.hasNextPage && (
          <TipButton className="mg-btn mg-quiet mg-small mg-start mg-gap-top" tip={DO.loadOlder} onClick={() => pay.fetchNextPage()}>
            Load older
          </TipButton>
        )}
      </Card>
    </div>
  );
}
