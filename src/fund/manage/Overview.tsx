// Overview: what needs doing, the headline figures, where the money is, the
// terms, the next maturities and the latest activity.
import { CLASS_NAMES, NONE, formatDuration, formatRate, perYear, shortAddress } from '../format';
import { Feed } from './Feed';
import { ixProblem, useIxActivity } from './ix';
import { H } from './help';
import { MoneyMap, TaskList, sectionHref } from './parts';
import { Badge, Bar, Card, Empty, Stat, TipLink, When, relative } from './ui';
import { useD, useV, type View } from './view';

/** "5-minute", "30-day": the cycle as an adjective. */
export const cycleWords = (v: View) => formatDuration(v.cycle).replace(/ (\w+?)s?$/, '-$1');

/** Rate per cycle → a simple yearly figure. Meaningless on minute-long test cycles, so only shown for real ones. */
export const yearly = (v: View, rate: bigint) => perYear(rate, v.cycle);

export function Overview() {
  const v = useV();
  const d = useD();
  const s = v.s;
  const raisedPct = s.raiseCap > 0n ? Number((s.totalRaised * 1000n) / s.raiseCap) / 10 : 0;
  return (
    <div className="mg-stack">
      <Card title="Needs attention" help={H.attention} subtitle={d.tasks.length ? 'What to do next, most urgent first. Anyone can run the open upkeep actions.' : undefined}>
        <TaskList tasks={d.tasks} empty="All caught up. Investors are current and nothing is waiting." />
      </Card>

      <div className="mg-grid-4">
        <Card>
          <Stat label="Raised" help={H.raised} value={v.amount(s.totalRaised, 0)} sub={`${raisedPct}% of ${v.amount(s.raiseCap, 0)}`} />
          <Bar value={s.totalRaised} total={s.raiseCap} label="Raised of the cap" />
        </Card>
        <Card>
          <Stat label="Outstanding principal" help={H.outstanding} value={v.amount(s.usPrincipal + s.globalPrincipal, 0)} sub={`${v.amount(s.lpPrincipal, 0)} lent in the pool`} />
        </Card>
        <Card>
          <Stat
            label={`Per ${cycleWords(v)} cycle`}
            help={H.perCycle}
            value={v.amount(s.monthlyInterestOwed + v.ledger.monthlyMgmtFee)}
            sub={`${v.amount(s.monthlyInterestOwed)} interest + ${v.amount(v.ledger.monthlyMgmtFee)} fees`}
          />
        </Card>
        <Card>
          <Stat
            label="Payments"
            help={H.payments}
            tone={d.waiting ? 'bad' : d.current ? 'ok' : 'warn'}
            value={d.waiting ? 'Waiting for money' : s.depositCount === 0n ? 'No deposits yet' : v.nextDue === NONE ? 'None scheduled' : d.current ? 'Current' : 'Due now'}
            sub={v.nextDue !== NONE && d.current ? `Next due ${relative(v.nextDue, v.now)}` : d.waiting ? `Deposit #${s.blockedFrom} waiting` : undefined}
          />
        </Card>
      </div>

      <div className="mg-grid-split">
        <Card title="Where the money is" help={H.money} subtitle="Live balances by purpose.">
          <MoneyMap />
          <div className="mg-grid-2 mg-gap-top">
            <Reserve label="Interest reserve" have={s.interestReserve} target={s.interestTarget} />
            <Reserve label="Management reserve" have={s.mgmtReserve} target={s.mgmtTarget} />
          </div>
        </Card>
        <div className="mg-stack">
          <Terms />
          <Maturities />
        </div>
      </div>

      <RecentActivity />
    </div>
  );
}

export function Reserve({ label, have, target }: { label: string; have: bigint; target: bigint }) {
  const v = useV();
  const low = have < target;
  return (
    <div className="mg-reserve">
      <div className="mg-line">
        <span>{label}</span>
        <strong className="mg-num">
          {v.amount(have)} <span className="mg-muted">/ {v.amount(target)}</span>
        </strong>
      </div>
      <Bar value={have} total={target > 0n ? target : 1n} tone={low ? 'warn' : 'ok'} label={`${label} against its target`} />
    </div>
  );
}

function Terms() {
  const v = useV();
  const c = v.config;
  const perCycle = (rate: bigint) => ['per cycle', yearly(v, rate)].filter(Boolean).join(' · ');
  return (
    <Card title="Investor terms" help={v.twoClasses ? H.terms : H.termsOne}>
      {v.twoClasses ? (
        <div className="mg-grid-2">
          <Stat label="US investors" help="What US investors earn on each deposit, per cycle." value={formatRate(c.usInterestRate)} sub={perCycle(c.usInterestRate)} />
          <Stat label="International" help="What International investors earn on each deposit, per cycle." value={formatRate(c.globalInterestRate)} sub={perCycle(c.globalInterestRate)} />
        </div>
      ) : (
        <Stat label="Interest" help="What investors earn on each deposit, per cycle." value={formatRate(c.usInterestRate)} sub={perCycle(c.usInterestRate)} />
      )}
      <p className="mg-muted mg-gap-top">
        {v.twoClasses ? `US ${v.amount(v.s.usPrincipal, 0)} · International ${v.amount(v.s.globalPrincipal, 0)}` : v.amount(v.s.usPrincipal, 0)} outstanding · management fee {formatRate(c.mgmtRate)} per cycle
      </p>
    </Card>
  );
}

function Maturities() {
  const v = useV();
  const next = v.deposits
    .filter((x) => !x.repaid)
    .sort((a, b) => Number(a.maturity - b.maturity))
    .slice(0, 5);
  return (
    <Card
      title="Upcoming maturities"
      help={H.maturities}
      actions={
        <TipLink tip="Opens Repayment: the full repayment line." href={sectionHref(v.listing.project, 'repayment')}>
          Repayment <span aria-hidden="true">→</span>
        </TipLink>
      }
    >
      {!next.length ? (
        <Empty title="No outstanding deposits" />
      ) : (
        <ul className="mg-rows">
          {next.map((x) => {
            const matured = x.maturity <= v.now;
            return (
              <li key={String(x.id)}>
                <span className="mg-muted">#{String(x.id)}</span>
                <span className="mg-mono mg-grow">{shortAddress(x.investor)}</span>
                <Badge>{CLASS_NAMES[x.class]}</Badge>
                <span className="mg-num">{v.amount(x.principal, 0)}</span>
                <When t={x.maturity} prefix={matured ? 'matured ' : ''} className={matured ? 'mg-text-bad' : 'mg-muted'} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentActivity() {
  const v = useV();
  const q = useIxActivity(v.listing.project, undefined, 6);
  const items = q.data?.pages[0]?.items ?? [];
  return (
    <Card
      title="Recent activity"
      help={H.recent}
      actions={
        <TipLink tip="Opens Activity: every event on this project." href={sectionHref(v.listing.project, 'activity')}>
          All activity <span aria-hidden="true">→</span>
        </TipLink>
      }
    >
      {q.error ? <p className="mg-muted">{ixProblem(q.error, 'Activity and history')}</p> : items.length ? <Feed items={items} /> : <p className="mg-muted">{q.isPending ? 'Loading…' : 'No activity yet.'}</p>}
    </Card>
  );
}
