// Investors: totals and one row per investor, with search and filters. The
// rows come from the deposit records on the chain; the indexer adds approved
// wallets that haven't invested yet, and their current investor type.
import { useMemo, useState } from 'react';
import type { Address } from 'viem';
import { CLASS_NAMES } from '../format';
import { ixProblem, useIxInvestors } from './ix';
import { H } from './help';
import { InfoTip } from './Tip';
import { Badge, Callout, Card, Empty, Segmented, Stat, TipLink, When, type Tone } from './ui';
import { useV, type View } from './view';

type Filter = 'all' | 'us' | 'intl' | 'attention';

export interface InvestorRow {
  investor: Address;
  class: number;
  allowlisted: boolean | null;
  deposits: number;
  active: number;
  outstanding: bigint;
  interestPaid: bigint;
  repaid: bigint;
  nextMaturity: bigint | null;
  owed: number;
  status: { text: string; tone: Tone };
}

/** One row per investor, from the deposits, plus approved wallets the indexer knows about. */
export function useInvestorRows(v: View) {
  const ix = useIxInvestors(v.listing.project);
  const rows = useMemo(() => {
    const by = new Map<string, InvestorRow>();
    const row = (investor: Address, cls: number) => {
      const k = investor.toLowerCase();
      let r = by.get(k);
      if (!r) {
        r = { investor, class: cls, allowlisted: null, deposits: 0, active: 0, outstanding: 0n, interestPaid: 0n, repaid: 0n, nextMaturity: null, owed: 0, status: { text: '', tone: 'neutral' } };
        by.set(k, r);
      }
      return r;
    };
    for (const d of v.deposits) {
      const r = row(d.investor, d.class);
      r.class = d.class;
      r.deposits++;
      r.interestPaid += BigInt(d.cyclesPaid) * v.perCycle(d);
      if (d.repaid) r.repaid += d.principal;
      else {
        r.active++;
        r.outstanding += d.principal;
        if (r.nextMaturity === null || d.maturity < r.nextMaturity) r.nextMaturity = d.maturity;
        if (v.owed.has(d.id)) r.owed++;
      }
    }
    for (const i of ix.data ?? []) {
      if (!i.allowlisted && !i.deposits) continue;
      const r = row(i.investor, i.class);
      r.class = i.class;
      r.allowlisted = i.allowlisted;
    }
    for (const r of by.values()) {
      const matured = r.nextMaturity !== null && r.nextMaturity <= v.now;
      r.status = r.owed
        ? { text: 'Interest due', tone: 'warn' }
        : matured
          ? { text: 'Matured', tone: 'bad' }
          : r.active
            ? { text: 'Current', tone: 'ok' }
            : r.deposits
              ? { text: 'Repaid', tone: 'info' }
              : { text: 'Approved', tone: 'neutral' };
    }
    return [...by.values()];
  }, [v, ix.data]);
  return { rows, ix };
}

export function Investors() {
  const v = useV();
  const { rows, ix } = useInvestorRows(v);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || (filter === 'us' && r.class === 1) || (filter === 'intl' && r.class === 2) || (filter === 'attention' && (r.owed > 0 || r.status.text === 'Matured'))) &&
      (!q.trim() || r.investor.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const l = v.ledger;
  return (
    <div className="mg-stack">
      <div className="mg-grid-4">
        <Card>
          <Stat label="Investors" help={H.investorsCount} value={rows.filter((r) => r.active > 0).length} sub={ix.data ? `${ix.data.filter((i) => i.allowlisted).length} approved` : 'with money in'} />
        </Card>
        <Card>
          <Stat label="Outstanding principal" help={H.outstanding} value={v.amount(v.s.usPrincipal + v.s.globalPrincipal, 0)} sub={`US ${v.amount(v.s.usPrincipal, 0)} · International ${v.amount(v.s.globalPrincipal, 0)}`} />
        </Card>
        <Card>
          <Stat label="Interest paid to date" help={H.interestPaidTotal} value={v.amount(l.interestPaid.us + l.interestPaid.global, 0)} sub={`US ${v.amount(l.interestPaid.us, 0)} · International ${v.amount(l.interestPaid.global, 0)}`} />
        </Card>
        <Card>
          <Stat label="Principal repaid" help={H.principalRepaid} value={v.amount(l.principalRepaid.us + l.principalRepaid.global, 0)} />
        </Card>
      </div>

      <Card
        title="Positions"
        help={H.positions}
        flush
        actions={
          <>
            <label className="mg-search">
              <span className="mg-sr">Search by wallet</span>
              <input className="mg-input mg-mono" placeholder="Search 0x…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Segmented
              label="Show"
              value={filter}
              onChange={setFilter}
              items={[
                { id: 'all', label: 'All', tip: 'Every investor.' },
                { id: 'us', label: 'US', tip: 'US investors only.' },
                { id: 'intl', label: 'International', tip: 'International investors only.' },
                { id: 'attention', label: 'Needs attention', tip: H.filterAttention },
              ]}
            />
          </>
        }
      >
        {ix.error && (
          <div className="mg-pad">
            <Callout tone="info">{ixProblem(ix.error, "Approved wallets that haven't invested yet")}</Callout>
          </div>
        )}
        {!shown.length ? (
          <Empty title={rows.length ? 'No investors match' : 'No investors yet'}>{rows.length ? undefined : 'Approve investors on the Raise page.'}</Empty>
        ) : (
          <div className="mg-table-wrap">
            <table className="mg-table">
              <thead>
                <tr>
                  <th scope="col">Investor</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="mg-right">
                    Deposits <InfoTip about="the deposits column">{H.depositsCol}</InfoTip>
                  </th>
                  <th scope="col" className="mg-right">
                    Outstanding
                  </th>
                  <th scope="col" className="mg-right">
                    Interest paid
                  </th>
                  <th scope="col">Next maturity</th>
                  <th scope="col">
                    Status <InfoTip about="the status column">{H.statusCol}</InfoTip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.investor}>
                    <td>
                      <TipLink className="mg-link mg-mono" tip="Opens this investor’s deposits, renewals and payment history." href={`#${v.listing.project}/investors/${r.investor}`}>
                        {r.investor.slice(0, 8)}…{r.investor.slice(-6)}
                      </TipLink>
                    </td>
                    <td>{r.allowlisted === false ? <Badge>Removed</Badge> : <Badge tone={r.class === 1 ? 'info' : 'brand'}>{CLASS_NAMES[r.class]}</Badge>}</td>
                    <td className="mg-right mg-num">
                      {r.active}
                      <span className="mg-muted">/{r.deposits}</span>
                    </td>
                    <td className="mg-right mg-num">{v.amount(r.outstanding, 0)}</td>
                    <td className="mg-right mg-num">{v.amount(r.interestPaid, 0)}</td>
                    <td>{r.nextMaturity !== null ? <When t={r.nextMaturity} /> : <span className="mg-muted">—</span>}</td>
                    <td>
                      <Badge tone={r.status.tone}>{r.status.text}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
