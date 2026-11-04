// Overview: what needs doing, the headline figures, where the money is, the
// terms, the next maturities and the latest activity.
import { CLASS_NAMES, NONE, formatDuration, formatRate, formatTime, shortAddress } from '../format';
import { Feed } from './Feed';
import { ixProblem, useIxActivity } from './ix';
import { MoneyMap, TaskList, sectionHref } from './parts';
import { Badge, Bar, Card, Empty, Stat, relative } from './ui';
import { useD, useV, type View } from './view';

/** "5-minute", "30-day": the cycle as an adjective. */
export const cycleWords = (v: View) => formatDuration(v.cycle).replace(/ (\w+?)s?$/, '-$1');

/** Rate per cycle → a simple yearly figure. Meaningless on minute-long test cycles, so only shown for real ones. */
export function yearly(v: View, rate: bigint): string | null {
  if (v.cycle < 86_400n) return null;
  const y = (Number(rate) / 1e6) * ((365 * 86400) / Number(v.cycle));
  return `≈ ${y >= 1000 ? Math.round(y).toLocaleString('en-US') : +y.toFixed(2)}% a year`;
}

export function Overview() {
  const v = useV();
  const d = useD();
  const s = v.s;
  const raisedPct = s.raiseCap > 0n ? Number((s.totalRaised * 1000n) / s.raiseCap) / 10 : 0;
  return (
    <div className="mg-stack">
      <Card title="Needs attention" subtitle={d.tasks.length ? 'What to do next, most urgent first. Anyone can run the open upkeep actions.' : undefined}>
        <TaskList tasks={d.tasks} empty="All caught up. Investors are current and nothing is waiting." />
      </Card>

      <div className="mg-grid-4">
        <Card>
          <Stat label="Raised" value={v.amount(s.totalRaised, 0)} sub={`${raisedPct}% of ${v.amount(s.raiseCap, 0)}`} />
          <Bar value={s.totalRaised} total={s.raiseCap} label="Raised of the cap" />
        </Card>
        <Card>
          <Stat label="Outstanding principal" value={v.amount(s.usPrincipal + s.globalPrincipal, 0)} sub={`${v.amount(s.lpPrincipal, 0)} lent in the pool`} />
        </Card>
        <Card>
          <Stat
            label={`Per ${cycleWords(v)} cycle`}
            value={v.amount(s.monthlyInterestOwed + v.ledger.monthlyMgmtFee, 0)}
            sub={`${v.amount(s.monthlyInterestOwed, 0)} interest + ${v.amount(v.ledger.monthlyMgmtFee, 0)} fees`}
          />
        </Card>
        <Card>
          <Stat
            label="Payments"
            tone={d.waiting ? 'bad' : d.current ? 'ok' : 'warn'}
            value={d.waiting ? 'Waiting for money' : s.depositCount === 0n ? 'No deposits yet' : v.nextDue === NONE ? 'None scheduled' : d.current ? 'Current' : 'Due now'}
            sub={v.nextDue !== NONE && d.current ? `Next due ${relative(v.nextDue, v.now)}` : d.waiting ? `Deposit #${s.blockedFrom} waiting` : undefined}
          />
        </Card>
      </div>

      <div className="mg-grid-split">
        <Card title="Where the money is" subtitle="Live balances by purpose.">
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
      <div className="mg-kv">
        <span>{label}</span>
        <strong className="mg-num">
          {v.amount(have, 0)} <span className="mg-muted">/ {v.amount(target, 0)}</span>
        </strong>
      </div>
      <Bar value={have} total={target > 0n ? target : 1n} tone={low ? 'warn' : 'ok'} label={`${label} against its target`} />
    </div>
  );
}

function Terms() {
  const v = useV();
  const c = v.config;
  return (
    <Card title="Investor terms">
      <div className="mg-grid-2">
        <Stat label="US investors" value={formatRate(c.usInterestRate)} sub={yearly(v, c.usInterestRate) ?? 'per cycle'} />
        <Stat label="International" value={formatRate(c.globalInterestRate)} sub={yearly(v, c.globalInterestRate) ?? 'per cycle'} />
      </div>
      <p className="mg-muted mg-gap-top">
        US {v.amount(v.s.usPrincipal, 0)} · International {v.amount(v.s.globalPrincipal, 0)} outstanding · management fee {formatRate(c.mgmtRate)} per cycle
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
      actions={
        <a className="mg-link" href={sectionHref(v.listing.project, 'repayment')}>
          Repayment →
        </a>
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
                <span className={matured ? 'mg-text-bad' : 'mg-muted'} title={formatTime(x.maturity, v.withTime)}>
                  {matured ? `matured ${relative(x.maturity, v.now)}` : relative(x.maturity, v.now)}
                </span>
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
      actions={
        <a className="mg-link" href={sectionHref(v.listing.project, 'activity')}>
          All activity →
        </a>
      }
    >
      {q.error ? <p className="mg-muted">{ixProblem(q.error, 'Activity and history')}</p> : items.length ? <Feed items={items} /> : <p className="mg-muted">{q.isPending ? 'Loading…' : 'No activity yet.'}</p>}
    </Card>
  );
}
