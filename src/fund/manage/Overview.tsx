// Overview: the project's health, its money, and the Maintenance checklist of
// what needs doing now. Every wallet sees this tab: the upkeep calls need no
// role.
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePublicClient } from 'wagmi';
import { NONE } from '../format';
import { COVER_TARGET, interestCover, paymentHealth, projectStatus } from '../health';
import { upkeepQuery, type Trust } from '../queries';
import { Row, plural } from '../ui';
import { Section, useAction, type ProjectView } from './fields';
import { PayAll, interestDue } from './PayAll';

interface Item {
  title: string;
  detail: ReactNode;
  action?: ReactNode;
}

export function Overview({ v, trust }: { v: ProjectView; trust: Trust }) {
  const client = usePublicClient();
  const upkeep = useQuery(upkeepQuery(client, trust.lens, v.listing.project, true));
  const s = v.data.state;
  const status = projectStatus(s);
  const payments = paymentHealth(s, v.data.nextDue, v.now, v.withTime);
  const cover = interestCover(s);
  const investors = new Set(v.deposits.filter((d) => !d.repaid).map((d) => d.investor.toLowerCase())).size;

  const items: Item[] = [];
  const { due, shortfall } = interestDue(v);
  if (s.blockedFrom !== NONE || v.data.nextDue <= v.now) {
    items.push({
      title: 'Pay interest due',
      detail: "Interest only moves when someone pays it. This is normally the Manager's job, but any wallet can send it.",
      action: <PayAll v={v} />,
    });
  }
  if (shortfall > 0n) {
    items.push({
      title: 'Add money to cover payments',
      detail: `Investors are owed ${v.amount(due)}, ${v.amount(shortfall)} more than the interest reserve and earnings hold. Inject money into the project from the fund console for now.`,
    });
  }
  const next = v.deposits[Number(s.nextPayoffId)];
  if (next && !next.repaid && s.payoffPool >= next.principal) {
    items.push({
      title: `Repay deposit #${next.id}`,
      detail: `The repayment fund (${v.amount(s.payoffPool)}) covers the next deposit in line (${v.amount(next.principal)}).`,
      action: <PayoffNext v={v} />,
    });
  }
  if (upkeep.data?.overdue.length) {
    items.push({
      title: 'Matured deposits',
      detail: `${plural(upkeep.data.overdue.length, 'deposit')} past maturity and not repaid (#${upkeep.data.overdue.join(', #')}). The company renews them, or the repayment fund repays them in order.`,
    });
  }
  if (upkeep.data?.poolMinimum != null && s.undeployedPrincipal > 0n && s.undeployedPrincipal >= upkeep.data.poolMinimum) {
    items.push({
      title: 'Place principal in the pool',
      detail: `${v.amount(s.undeployedPrincipal)} is waiting to be placed. This needs a BNB fee for the pool: send deployPrincipal from the fund console for now.`,
    });
  }
  if (upkeep.data && upkeep.data.poolEarnings > 0n) {
    items.push({
      title: 'Collect pool earnings',
      detail: `${v.amount(upkeep.data.poolEarnings)} of pool earnings are waiting. This needs a BNB fee for the pool: send sweep from the fund console for now.`,
    });
  }

  return (
    <div className="fm-tab">
      <Section title="Health">
        <dl className="fp-list fm-list">
          <Row label="Status" value={status.label} tone={status.tone} />
          <Row label="Raised" value={`${v.amount(s.totalRaised)} of ${v.amount(s.raiseCap)}`} />
          {payments && <Row label="Interest payments" value={payments.value} sub={payments.sub} tone={payments.tone} />}
          {cover && <Row label="Interest cover" value={cover.value} sub={`Target ${COVER_TARGET} cycles`} tone={cover.tone} />}
          <Row label="Active deposits" value={String(s.depositCount - s.nextPayoffId)} sub={plural(investors, 'investor')} />
        </dl>
      </Section>

      <Section title="Money in the project">
        <dl className="fp-list fm-list">
          <Row label="Interest reserve" value={v.amount(s.interestReserve)} sub={`Target ${v.amount(s.interestTarget)}`} tone={s.interestReserve < s.interestTarget ? 'warn' : undefined} />
          <Row label="Management reserve" value={v.amount(s.mgmtReserve)} sub={`Target ${v.amount(s.mgmtTarget)}`} tone={s.mgmtReserve < s.mgmtTarget ? 'warn' : undefined} />
          <Row label="Earnings available to split" value={v.amount(s.netEarnings)} />
          <Row label="Repayment fund" value={v.amount(s.payoffPool)} />
          <Row label="Development funds" value={v.amount(s.devBalance)} />
          <Row label="Set aside for LEMX" value={v.amount(s.compoundPending)} />
          <Row label="Principal waiting to be placed" value={v.amount(s.undeployedPrincipal)} />
          <Row label="Placed in the pool" value={v.amount(s.lpPrincipal)} />
          {s.mgmtFeeDeferred > 0n && <Row label="Management fees deferred" value={v.amount(s.mgmtFeeDeferred)} tone="warn" />}
        </dl>
      </Section>

      <Section title="Maintenance">
        {items.length === 0 ? (
          <p className="fp-ok">{upkeep.isPending ? 'Checking…' : 'Nothing needs doing right now.'}</p>
        ) : (
          <ul className="fm-checklist">
            {items.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <p className="fp-muted">{item.detail}</p>
                {item.action}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** payoffNext is permissionless: repay the oldest deposit once the repayment fund covers it. */
function PayoffNext({ v }: { v: ProjectView }) {
  const { busy, run } = useAction(v);
  return (
    <button type="button" className="fp-btn" disabled={busy} onClick={() => run('Repay the next deposit', { functionName: 'payoffNext' })}>
      {busy ? 'Repaying…' : 'Repay next deposit'}
    </button>
  );
}
