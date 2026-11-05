// Repayment: the line of deposits waiting to be repaid (first in, first out),
// adding repayment money, and pool principal coming back once its lock ends.
import { useState } from 'react';
import { CLASS_NAMES, formatTime, shortAddress } from '../format';
import { feeFor } from './actions';
import { DO, H } from './help';
import { InfoTip } from './Tip';
import { ActionButton, AmountInput, Badge, Bar, Callout, Card, Empty, Field, Line, Stat, TipLink, When, checkAmount, relative } from './ui';
import { useV } from './view';

export function Repayment() {
  return (
    <div className="mg-stack">
      <Queue />
      <div className="mg-grid-2">
        <AddRepayment />
        <PoolPrincipal />
      </div>
    </div>
  );
}

function Queue() {
  const v = useV();
  const s = v.s;
  const open = v.deposits.filter((x) => !x.repaid);
  const head = v.head && !v.head.repaid ? v.head : null;
  const overdue = new Set(v.u.overdue.map(String));
  let running = 0n;
  return (
    <Card title="Repayment line" help={H.repaymentLine} subtitle="Principal is repaid strictly first in, first out, from the repayment fund: before maturity whenever the fund covers the next deposit.">
      {s.fullyRepaid ? (
        <Callout tone="ok" title="Fully repaid">
          Every deposit has been repaid.
        </Callout>
      ) : !head ? (
        <Empty title="No outstanding deposits" />
      ) : (
        <>
          <div className="mg-grid-3">
            <Stat label="Repayment fund" help="Money set aside to repay investors’ principal, in deposit order." value={v.amount(s.payoffPool)} />
            <Stat label={`Next: deposit #${head.id}`} help="The next deposit in line to be repaid, and who it belongs to." value={v.amount(head.principal)} sub={`${CLASS_NAMES[head.class]} · ${shortAddress(head.investor)}`} />
            <Stat label="Matures" help="When this deposit reaches the end of its term. After that it’s late until repaid or renewed." tone={head.maturity <= v.now ? 'bad' : undefined} value={formatTime(head.maturity, v.withTime)} sub={relative(head.maturity, v.now)} />
          </div>
          <div>
            <Line k="Cover for the next repayment" v={<span className="mg-num">{s.payoffPool >= head.principal ? 'Covered' : `${v.amount(head.principal - s.payoffPool)} short`}</span>} />
            <Bar value={s.payoffPool} total={head.principal} tone={s.payoffPool >= head.principal ? 'ok' : head.maturity <= v.now ? 'bad' : 'warn'} label="Repayment fund against the next deposit" />
          </div>
          <div className="mg-row-wrap">
            <ActionButton
              title={`Repay deposit #${head.id}`}
              tip={DO.repay}
              // payoffNext pays the deposit's due cycles first, which fails while it's the one waiting.
              disabled={s.payoffPool < head.principal || s.blockedFrom === head.id}
              reason={s.payoffPool < head.principal ? "The repayment fund doesn't cover it yet." : 'Its interest is waiting for money. Pay investors first.'}
              run={async (ctx) => {
                await ctx.send(`Repay deposit #${head.id}`, { functionName: 'payoffNext' });
                ctx.done(`Deposit #${head.id} repaid.`);
              }}
            >
              Repay #{String(head.id)}
            </ActionButton>
            {s.blockedFrom !== head.id && <span className="mg-muted mg-small-text">Its due interest is paid first.</span>}
          </div>
        </>
      )}
      {open.length > 0 && (
        <div className="mg-table-wrap">
          <table className="mg-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Investor</th>
                <th scope="col" className="mg-right">
                  Principal
                </th>
                <th scope="col" className="mg-right">
                  Fund needed <InfoTip about="fund needed">{H.fundNeeded}</InfoTip>
                </th>
                <th scope="col">Maturity</th>
                <th scope="col">
                  <span className="mg-sr">Covered</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {open.map((x, i) => {
                running += x.principal;
                const covered = s.payoffPool >= running;
                return (
                  <tr key={String(x.id)}>
                    <td>
                      {i + 1}. <span className="mg-muted">#{String(x.id)}</span>
                    </td>
                    <td>
                      <TipLink className="mg-link mg-mono" tip="Opens this investor’s deposits and payment history." href={`#${v.listing.project}/investors/${x.investor}`}>
                        {shortAddress(x.investor)}
                      </TipLink>
                    </td>
                    <td className="mg-right mg-num">{v.amount(x.principal, 0)}</td>
                    <td className="mg-right mg-num mg-muted">{v.amount(running, 0)}</td>
                    <td>
                      {overdue.has(String(x.id)) ? <When t={x.maturity} prefix="Matured " className="mg-text-bad" /> : formatTime(x.maturity, v.withTime)}
                      {x.renewed && <small className="mg-muted"> (renewed)</small>}
                    </td>
                    <td className="mg-right">{covered && <Badge tone="ok">covered</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AddRepayment() {
  const v = useV();
  const [amount, setAmount] = useState('');
  const [a, err] = checkAmount(v, amount);
  const operations = v.can('OPERATIONS_ROLE');
  return (
    <Card title="Add repayment money" help={H.addRepayment} subtitle={`Property income or sale proceeds go straight to the repayment fund${operations ? ', recorded as from Operations' : ''}.`}>
      <Field label="Amount" error={err}>
        {(id, d) => <AmountInput id={id} describedBy={d} value={amount} onChange={setAmount} />}
      </Field>
      <ActionButton
        title="Add to the repayment fund"
        tip={DO.addRepayment}
        disabled={!a || v.s.fullyRepaid}
        reason={v.s.fullyRepaid ? 'Every deposit has been repaid.' : 'Enter an amount.'}
        run={async (ctx) => {
          await ctx.send(`Add ${v.amount(a!)} to the repayment fund`, { functionName: 'depositPayoff', args: [a!] }, { pulls: a! });
          ctx.done(`Added ${v.amount(a!)} to the repayment fund.`);
        }}
        onDone={() => setAmount('')}
      >
        Add to the repayment fund
      </ActionButton>
      {!v.s.fullyRepaid && <p className="mg-muted mg-small-text">Earnings can also go here through a split (Surplus & development).</p>}
    </Card>
  );
}

function PoolPrincipal() {
  const v = useV();
  const u = v.u;
  const fee = feeFor(v, 'withdraw');
  return (
    <Card title="Pool principal coming back" help={H.poolPrincipal} subtitle="When the pool lock ends, principal is withdrawn back into earnings. The pool may queue it while the money is lent out.">
      <div className="mg-row-wrap">
        <Stat label="Locked" help={H.locked} value={v.amount(u.lockedPrincipal, 0)} />
        <Stat label="Unlocked" help={H.unlocked} value={v.amount(u.unlockedPrincipal, 0)} tone={u.unlockedPrincipal > 0n ? 'ok' : undefined} />
      </div>
      <ActionButton
        title="Ask the pool for unlocked principal"
        tip={DO.requestPrincipal}
        disabled={u.unlockedPrincipal === 0n}
        reason="Nothing has unlocked yet."
        run={async (ctx) => {
          await ctx.send('Ask the pool for unlocked principal', { functionName: 'requestMaturedPrincipal' });
          ctx.done('Withdrawal requested. Claim it once the pool funds it.');
        }}
      >
        Request withdrawal
      </ActionButton>
      {u.requests.length ? (
        <ul className="mg-rows">
          {u.requests.map((r) => (
            <li key={String(r.id)}>
              <span className="mg-grow">
                Request #{String(r.id)} · <span className="mg-num">{v.amount(r.amount)}</span>
                <small className="mg-block mg-muted">{r.ready ? 'Funded by the pool: ready to claim.' : 'Waiting for the pool to fund it.'}</small>
              </span>
              <ActionButton
                small
                title={`Claim pool withdrawal #${r.id}`}
                tip={DO.claim}
                disabled={!r.ready || fee === null}
                reason={!r.ready ? 'Not funded yet.' : "The pool's BNB fee can't be priced right now."}
                run={async (ctx) => {
                  await ctx.send(`Claim pool withdrawal #${r.id}`, { functionName: 'claimLpWithdrawal', args: [r.id], value: fee || undefined });
                  ctx.done('Claimed into earnings.');
                }}
              >
                Claim
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mg-muted">No open withdrawal requests.</p>
      )}
    </Card>
  );
}
