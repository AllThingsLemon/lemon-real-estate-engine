// One investor: totals, each deposit live from the chain (with renewal for
// the Company role), and their payment history from the indexer.
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { CLASS_NAMES, PCT, formatDuration, formatRate, formatTime } from '../format';
import { classQuery } from '../queries';
import { Feed } from './Feed';
import { useInvestorRows } from './Investors';
import { ixProblem, useIxActivity, useIxDeposits } from './ix';
import { DO, H } from './help';
import { InfoTip } from './Tip';
import { ActionButton, Addr, Badge, Card, Dated, Empty, Stat, TipButton, TipLink, When, relative } from './ui';
import { useV } from './view';

const HISTORY = ['DepositRecorded', 'InterestPaid', 'BalloonPaid', 'DepositRenewed', 'InterestWaiting'] as const;

export function InvestorDetail({ investor }: { investor: Address }) {
  const v = useV();
  const client = usePublicClient();
  const cls = useQuery(classQuery(client, v.listing.project, investor));
  const { rows } = useInvestorRows(v);
  const row = rows.find((r) => r.investor.toLowerCase() === investor.toLowerCase());
  const extra = useIxDeposits(v.listing.project, investor);
  const history = useIxActivity(v.listing.project, HISTORY, 50, investor);
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const deposits = v.deposits.filter((d) => d.investor.toLowerCase() === investor.toLowerCase());

  return (
    <div className="mg-stack">
      <div className="mg-row-wrap">
        <TipLink className="mg-back" tip="Back to the list of investors." href={`#${v.listing.project}/investors`}>
          <span aria-hidden="true">←</span> Investors
        </TipLink>
        <Addr a={investor} full />
        {cls.data !== undefined && (cls.data ? <Badge tone={cls.data === 1 ? 'info' : 'brand'}>{CLASS_NAMES[cls.data]}</Badge> : <Badge>Not on the allowlist</Badge>)}
      </div>

      <div className="mg-grid-4">
        <Card>
          <Stat label="Outstanding" help={H.outstanding} value={v.amount(row?.outstanding ?? 0n, 0)} sub={`${row?.active ?? 0} open deposit${row?.active === 1 ? '' : 's'}`} />
        </Card>
        <Card>
          <Stat label="Interest received" help="All interest paid to this investor so far." value={v.amount(row?.interestPaid ?? 0n)} />
        </Card>
        <Card>
          <Stat label="Principal repaid" help="Principal paid back to this investor so far." value={v.amount(row?.repaid ?? 0n, 0)} />
        </Card>
        <Card>
          <Stat
            label="Next maturity"
            help="When this investor’s next open deposit reaches the end of its term."
            value={row?.nextMaturity != null ? formatTime(row.nextMaturity, v.withTime) : '—'}
            sub={row?.nextMaturity != null ? relative(row.nextMaturity, v.now) : undefined}
          />
        </Card>
      </div>

      <Card title="Deposits" help={H.investorDeposits} flush>
        {!deposits.length ? (
          <Empty title="No deposits yet" />
        ) : (
          <div className="mg-table-wrap">
            <table className="mg-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Rate</th>
                  <th scope="col" className="mg-right">
                    Principal
                  </th>
                  <th scope="col">Cycles paid</th>
                  <th scope="col">Next payment</th>
                  <th scope="col">Maturity</th>
                  <th scope="col" className="mg-right">
                    Renewal <InfoTip about="renewal">{H.renewal}</InfoTip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => {
                  const ix = extra.data?.find((x) => BigInt(x.deposit_id) === d.id);
                  const credited = d.usdtIn !== d.principal || ix?.kind === 1;
                  const owed = Number(v.owed.get(d.id) ?? 0n);
                  const nextAt = d.start + (BigInt(d.cyclesPaid) + BigInt(owed) + 1n) * v.cycle;
                  const fee = (d.principal * v.config.renewalFeeRate) / PCT;
                  const base = d.maturity > v.now ? d.maturity : v.now;
                  const newMaturity = base + v.config.renewalTerm;
                  return (
                    <tr key={String(d.id)} className={d.repaid ? 'mg-done-row' : undefined}>
                      <td>
                        {String(d.id)} {credited && <Badge>recorded</Badge>}
                      </td>
                      <td>{formatRate(d.rate)}</td>
                      <td className="mg-right mg-num">
                        {v.amount(d.principal, 0)}
                        {credited && <small className="mg-block mg-muted">{v.amount(d.usdtIn, 0)} received</small>}
                      </td>
                      <td>
                        {d.cyclesPaid} {owed > 0 && <Badge tone="warn">{owed} due</Badge>}
                      </td>
                      <td>{d.repaid ? '—' : owed > 0 ? <span className="mg-text-warn">due now</span> : <When t={nextAt} />}</td>
                      <td>
                        {d.repaid ? (
                          <Badge tone="info">Repaid{ix?.repaid_time ? ` ${formatTime(BigInt(ix.repaid_time), v.withTime)}` : ''}</Badge>
                        ) : d.maturity <= v.now ? (
                          <span className="mg-text-bad">Matured</span>
                        ) : (
                          <Dated t={d.maturity} />
                        )}
                        {d.renewed && <small className="mg-muted"> (renewed)</small>}
                      </td>
                      <td className="mg-right">
                        {!d.repaid && !d.renewed && (
                          <ActionButton
                            small
                            quiet
                            title={`Renew deposit #${d.id}`}
                            tip={`${DO.renew} New maturity: ${formatTime(newMaturity, v.withTime)}.`}
                            need="COMPANY_ROLE"
                            disabled={owed !== 0}
                            reason="Its interest has to be current first. Pay investors on the Earnings page."
                            run={async (ctx) => {
                              await ctx.send(`Renew deposit #${d.id}`, { functionName: 'renew', args: [d.id] }, { pulls: fee });
                              ctx.done(`Renewed. It matures ${formatTime(newMaturity, v.withTime)}, and ${v.amount(fee)} went to the investor.`);
                            }}
                          >
                            Renew · {v.amount(fee)}
                          </ActionButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mg-muted mg-pad">
          Renewing extends a deposit once, by {formatDuration(v.config.renewalTerm)} from the later of its maturity and now. The Company wallet pays the investor a fee of {formatRate(v.config.renewalFeeRate)} of the principal.
        </p>
      </Card>

      <Card title="Payment history" help={H.history}>
        {items.length ? <Feed items={items} /> : <p className="mg-muted">{history.isPending ? 'Loading…' : history.error ? ixProblem(history.error, 'Payment histories') : 'No payments yet.'}</p>}
        {history.hasNextPage && (
          <TipButton className="mg-btn mg-quiet mg-small mg-start mg-gap-top" tip={DO.loadOlder} disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
            {history.isFetchingNextPage ? 'Loading…' : 'Load older'}
          </TipButton>
        )}
      </Card>
    </div>
  );
}
