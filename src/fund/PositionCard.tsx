// An investor's position cards, on the listing and on /portfolio/.
import { useState } from 'react';
import { parseEventLogs, type Address } from 'viem';
import { projectAbi } from './abi';
import { CLASS_NAMES, formatAmount, formatRate, formatTime } from './format';
import { collectPlan, type Position, type PositionStatus } from './positions';
import type { Deposit, ProjectData } from './queries';
import { useSend } from './tx';
import { Row, plural, type Tone } from './ui';

const STATUS: Record<PositionStatus, { label: string; tone: Tone }> = {
  current: { label: 'Interest up to date', tone: 'ok' },
  due: { label: 'Interest due', tone: 'warn' },
  waiting: { label: 'Waiting on the reserve', tone: 'bad' },
  matured: { label: 'Matured', tone: 'neutral' },
  repaid: { label: 'Repaid', tone: 'neutral' },
};

export interface PositionContext {
  project: Address;
  token: { decimals: number; symbol: string };
  cycleDuration: bigint;
  data: ProjectData;
  deposits: readonly Deposit[];
  now: bigint;
}

export function PositionCard({ p, ctx }: { p: Position; ctx: PositionContext }) {
  const send = useSend();
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState<bigint | null>(null);
  const { project, token, cycleDuration, data, deposits, now } = ctx;
  const d = p.deposit;
  const amount = (v: bigint) => `${formatAmount(v, token.decimals)} ${token.symbol}`;
  const withTime = cycleDuration < 86400n;
  const status = STATUS[p.status];
  const plan = p.owed > 0n ? collectPlan(p, deposits, data, cycleDuration, now) : null;
  const affordable = plan !== null && plan.needed <= plan.available;

  async function collect() {
    if (!plan) return;
    setBusy(true);
    setPaid(null);
    try {
      const receipt = await send(
        `Collect interest on deposit #${d.id}`,
        { address: project, abi: projectAbi, functionName: 'payDue', args: [plan.from, plan.count] },
        { project, amount: (v) => amount(BigInt(v as bigint)) },
      );
      const mine = parseEventLogs({ abi: projectAbi, eventName: 'InterestPaid', logs: receipt.logs }).filter((l) => l.args.depositId === d.id);
      setPaid(mine.reduce((t, l) => t + l.args.amount, 0n));
    } catch {
      // The toast says why.
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="fp-pos" aria-labelledby={`fp-pos-${d.id}`}>
      <div className="fp-pos-head">
        <h3 id={`fp-pos-${d.id}`}>Deposit #{String(d.id)}</h3>
        <span className={`fp-status fp-${status.tone}`}>{status.label}</span>
      </div>
      <p className="fp-pos-amount">
        <strong>{amount(d.principal)}</strong> at {formatRate(d.rate)} per cycle · {CLASS_NAMES[d.class]}
      </p>
      <dl className="fp-list">
        <Row label="Interest received" value={amount(p.received)} sub={`${plural(d.cyclesPaid, 'cycle')} paid`} />
        {p.owed > 0n && <Row label="Interest due now" value={amount(p.owed)} sub={plural(p.cyclesOwed, 'cycle')} tone="warn" />}
        {!d.repaid && <Row label="Next cycle due" value={formatTime(p.nextCycle, withTime)} />}
        <Row label={p.matured ? 'Matured' : 'Matures'} value={formatTime(BigInt(d.maturity), withTime)} sub={d.renewed ? 'Renewed' : undefined} />
        {!d.repaid && (
          <Row
            label="Repayment line"
            value={p.ahead === 0n ? 'Next to be repaid' : `${plural(p.ahead, 'deposit')} ahead`}
            sub={`Repayment fund: ${amount(data.state.payoffPool)} of ${amount(p.principalAhead + d.principal)}`}
          />
        )}
      </dl>
      {paid !== null && <p className="fp-ok fp-done">Paid {amount(paid)} to this wallet.</p>}
      {plan && (
        <div className="fp-collect">
          <button type="button" className="fp-btn" disabled={!affordable || busy} onClick={collect}>
            {busy ? 'Collecting…' : 'Collect interest due'}
          </button>
          {!affordable ? (
            <p className="fp-muted">
              Payments go oldest first, and the interest reserve can't cover every payment up to yours yet ({amount(plan.needed)} needed,{' '}
              {amount(plan.available)} available).
            </p>
          ) : (
            plan.older > 0 && (
              <p className="fp-muted">
                Payments go oldest first, so this also pays {plural(plan.older, 'older deposit')} and the network fee is higher.
              </p>
            )
          )}
        </div>
      )}
    </article>
  );
}
