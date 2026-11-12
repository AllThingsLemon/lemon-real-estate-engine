// The dashboard's larger pieces: where the money is, the Needs attention
// list and the balances-over-time chart (the fund dashboard's MoneyMap,
// TaskList and Chart components).
import { useState } from 'react';
import { formatUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { formatTime } from '../format';
import { POOL_PAUSED } from '../errors';
import { POOL_ONLY, QUICK_FEE, feeFor, feeNote, quick } from './actions';
import type { IxEvent } from './ix';
import { DO, PAGE_HELP } from './help';
import { useTip } from './Tip';
import { ActionButton, Empty, TipLink } from './ui';
import { NEED_LABEL, dust, useV, type Section, type State, type Task } from './view';

const SEGMENTS: { key: keyof State; label: string; color: string; note: string }[] = [
  { key: 'interestReserve', label: 'Interest reserve', color: 'var(--mg-info)', note: 'Pays investor interest. Its target is two cycles.' },
  { key: 'mgmtReserve', label: 'Management reserve', color: 'color-mix(in srgb, var(--mg-info) 55%, var(--surface))', note: 'Pays the management fee.' },
  { key: 'netEarnings', label: 'Earnings', color: 'var(--mg-brand)', note: 'Left over for the manager to split.' },
  { key: 'payoffPool', label: 'Repayment fund', color: 'var(--ok)', note: 'Repays principal, first in, first out.' },
  { key: 'devBalance', label: 'Development funds', color: 'var(--warn)', note: 'Can be withdrawn to the company wallet.' },
  { key: 'compoundPending', label: 'Set aside for LEMX', color: 'color-mix(in srgb, var(--warn) 50%, var(--surface))', note: 'Waiting to buy LEMX.' },
  { key: 'undeployedPrincipal', label: 'Principal waiting to be placed', color: 'var(--muted)', note: 'Raised but not yet lent into the pool.' },
];

/** Every token the project holds, by bucket (the buckets add up to its balance). */
export function MoneyMap() {
  const v = useV();
  const parts = SEGMENTS.map((x) => ({ ...x, v: v.s[x.key] as bigint })).map((x) => ({ ...x, empty: x.v < dust(v) }));
  const total = parts.reduce((t, x) => t + x.v, 0n);
  return (
    <div className="mg-map">
      <div className="mg-map-head">
        <span className="mg-label">Held by the project</span>
        <strong className="mg-num">{v.amount(total)}</strong>
      </div>
      <div className="mg-map-bar" role="img" aria-label="The project's money by purpose">
        {total > 0n &&
          parts
            .filter((x) => !x.empty)
            .map((x) => <Segment key={x.key} tip={`${x.label}: ${v.amount(x.v)}`} width={Math.max(0.8, Number((x.v * 10_000n) / total) / 100)} color={x.color} />)}
      </div>
      <ul>
        {parts.map((x) => (
          <li key={x.key}>
            <span className="mg-swatch" style={{ background: x.color }} aria-hidden="true" />
            <span>{x.label}</span>
            <span className={`mg-num${x.empty ? ' mg-muted' : ''}`}>{v.amount(x.empty ? 0n : x.v)}</span>
          </li>
        ))}
      </ul>
      {v.s.mgmtFeeDeferred > 0n && <p className="mg-text-bad">Deferred management fees owed: {v.amount(v.s.mgmtFeeDeferred)}</p>}
    </div>
  );
}

/** One bucket's share of the bar; pointing at it names the bucket and its amount. */
function Segment({ tip, width, color }: { tip: string; width: number; color: string }) {
  const t = useTip(tip);
  return (
    <>
      <span style={{ width: `${width}%`, background: color }} {...t.trigger} />
      {t.bubble}
    </>
  );
}

const ICON = { critical: '!', action: '→', info: 'i' };
const SEVERITY = { critical: 'Urgent', action: 'To do', info: 'For information' };
const NAV_NAME: Record<Section, string> = { overview: 'Overview', raise: 'Raise', investors: 'Investors', earnings: 'Earnings & payments', surplus: 'Surplus & development', repayment: 'Repayment', activity: 'Activity', settings: 'Settings & team' };
export const sectionHref = (project: string, section: Section) => `#${project}${section === 'overview' ? '' : `/${section}`}`;

export function TaskList({ tasks, empty, links = true }: { tasks: Task[]; empty?: string; links?: boolean }) {
  const v = useV();
  const client = usePublicClient();
  if (!tasks.length) return <Empty title={empty ?? 'Nothing needs attention'} icon="✓" />;
  return (
    <ul className="mg-tasks">
      {tasks.map((t) => {
        const feeKind = t.quick && QUICK_FEE[t.quick.action];
        const noFee = feeKind && v.u.fees === null;
        const paused = Boolean(t.quick && v.u.poolPaused && POOL_ONLY.has(t.quick.action));
        return (
          <li key={t.id}>
            <span className={`mg-task-icon mg-${t.severity}`} aria-hidden="true">
              {ICON[t.severity]}
            </span>
            <div>
              <div className="mg-task-title">
                <strong>
                  <span className="mg-sr">{SEVERITY[t.severity]}: </span>
                  {t.title}
                </strong>
                {t.amount !== undefined && <span className="mg-num">{v.amount(t.amount)}</span>}
              </div>
              <p>{t.detail}</p>
            </div>
            <div className="mg-task-do">
              {t.quick && (
                <ActionButton
                  small
                  title={t.title}
                  tip={DO[t.quick.action]}
                  note={feeKind ? feeNote(v, feeFor(v, feeKind)) : undefined}
                  need={t.need}
                  disabled={Boolean(noFee) || paused}
                  reason={paused ? POOL_PAUSED : "The pool's BNB fee can't be priced right now. Try again later."}
                  run={(ctx) => quick(ctx, v, client!, t.quick!.action, t.quick!.arg)}
                >
                  {t.quick.label}
                </ActionButton>
              )}
              {links && t.section !== 'overview' && (
                <TipLink tip={`Opens ${NAV_NAME[t.section]}: ${PAGE_HELP[t.section]}`} href={sectionHref(v.listing.project, t.section)}>
                  {t.quick ? 'Details' : t.need && !v.can(t.need) ? `View (${NEED_LABEL[t.need]})` : 'Open'}
                  <span className="mg-sr"> for {t.title}</span> <span aria-hidden="true">→</span>
                </TipLink>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface Series {
  key: string;
  label: string;
  color: string;
}

/** A step chart of the project's ProjectSnapshot history (one point per change). */
export function SnapshotChart({ points, series, height = 160 }: { points: IxEvent[]; series: Series[]; height?: number }) {
  const v = useV();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="mg-muted">Not enough history yet.</p>;
  const toNum = (x: unknown) => Number(formatUnits(BigInt(String(x ?? 0)), v.token.decimals));
  const short = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 8, t: 8, b: 20 };
  const t0 = points[0].block_time;
  // Each line holds its last value until now.
  const t1 = Math.max(Number(v.now), points[points.length - 1].block_time, t0 + 1);
  const top = Math.max(1, ...points.flatMap((p) => series.map((s) => toNum(p.args[s.key])))) * 1.08;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (n: number) => pad.t + (1 - n / top) * (H - pad.t - pad.b);
  const path = (k: string) =>
    points.map((p, i) => `${i ? 'H' : 'M'}${x(p.block_time).toFixed(1)}${i ? ` V${y(toNum(p.args[k])).toFixed(1)}` : ` ${y(toNum(p.args[k])).toFixed(1)}`}`).join(' ') + ` H${x(t1).toFixed(1)}`;
  const h = hover !== null ? points[hover] : null;
  return (
    <div className="mg-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Balances over time: ${series.map((s) => s.label).join(', ')}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const t = t0 + ((((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r)) * (t1 - t0);
          let best = 0;
          points.forEach((p, i) => {
            if (p.block_time <= t) best = i;
          });
          setHover(best);
        }}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} stroke="var(--border)" />
            <text x={pad.l - 6} y={y(top * f) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              {short(top * f)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" />
        ))}
        {h && <line x1={x(h.block_time)} x2={x(h.block_time)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeDasharray="3 3" />}
      </svg>
      <div className="mg-chart-key">
        {series.map((s) => (
          <span key={s.key}>
            <span className="mg-swatch-line" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
            {h && <b className="mg-num">{short(toNum(h.args[s.key]))}</b>}
          </span>
        ))}
        {h && <span className="mg-muted">{formatTime(BigInt(h.block_time), true)}</span>}
      </div>
    </div>
  );
}
