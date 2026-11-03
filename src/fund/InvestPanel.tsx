// The live panel on a linked listing: raise progress, status, rates and
// payment health, read from the chain. Anyone can see it without a wallet.
import { useEffect, useState, type ReactNode } from 'react';
import type { Chain } from 'viem';
import { NONE, formatAmount, formatDuration, formatRate, formatTime, shortAddress } from './format';
import { useLinkCheck, useProjectState, type FundLink } from './useListing';

/** The contract keeps its interest reserve at 2 cycles of interest (INTEREST_RESERVE_CYCLES). */
const COVER_TARGET = 2n;

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

/** The current Unix time, updated every few seconds so due dates turn over on their own. */
function useNow(everyMs: number) {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function Card({ chain, children }: { chain: Chain; children: ReactNode }) {
  return (
    <section className="fp" aria-labelledby="fp-title">
      <div className="fp-head">
        <h2 id="fp-title">Investment</h2>
        {chain.testnet && <span className="fp-tag">Test network</span>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className={tone ? `fp-${tone}` : undefined}>{value}</span>
        {sub && <span className="fp-sub">{sub}</span>}
      </dd>
    </div>
  );
}

export default function InvestPanel({ link, chain }: { link: FundLink; chain: Chain }) {
  const check = useLinkCheck(link);
  const trusted = check.data?.trusted === true;
  const live = useProjectState(link, trusted);
  const now = useNow(5_000);

  // Tell the site manager why, without showing contract details to visitors.
  useEffect(() => {
    if (check.data && !check.data.trusted) console.warn(`Investing is off for this listing: ${check.data.reason}.`);
  }, [check.data]);

  if (check.isError || live.isError) {
    return (
      <Card chain={chain}>
        <p className="fp-muted">Live figures couldn't load.</p>
        <button className="fp-retry" type="button" onClick={() => (check.isError ? check.refetch() : live.refetch())}>
          Try again
        </button>
      </Card>
    );
  }
  if (check.data && !check.data.trusted) {
    return (
      <Card chain={chain}>
        <p className="fp-muted">Investing isn't available for this listing.</p>
      </Card>
    );
  }
  if (!check.data?.trusted || !live.data) {
    return (
      <Card chain={chain}>
        <p className="fp-muted">Loading live figures…</p>
      </Card>
    );
  }

  const { token, cycleDuration } = check.data;
  const { state: s, config, nextDue } = live.data;
  const amount = (v: bigint) => `${formatAmount(v, token.decimals)} ${token.symbol}`;
  // Sandbox cycles are minutes long, so due dates need the time of day there.
  const withTime = cycleDuration < 86400n;

  const status: { label: string; tone: Tone; note?: string } = s.fullyRepaid
    ? { label: 'Fully repaid', tone: 'neutral' }
    : s.filled
      ? { label: 'Fully funded', tone: 'neutral' }
      : s.closed
        ? { label: 'Raise closed', tone: 'neutral' }
        : s.killed
          ? { label: 'Deposits stopped', tone: 'warn', note: 'Deposits are stopped for this project right now.' }
          : s.paused
            ? { label: 'Paused', tone: 'warn', note: 'This project is paused. Deposits will reopen when it resumes.' }
            : { label: 'Open for investment', tone: 'ok' };
  const open = status.tone === 'ok';

  const funded = s.raiseCap > 0n ? Number((s.totalRaised * 1000n) / s.raiseCap) / 10 : 0;

  // Payments are current while nextDue is in the future; blockedFrom is set
  // when a payment came due and the interest reserve couldn't cover it.
  const payments: { value: string; sub?: string; tone: Tone } | null =
    s.blockedFrom !== NONE
      ? { value: `Late since deposit #${s.blockedFrom}`, tone: 'bad' }
      : nextDue === NONE
        ? null
        : nextDue <= now
          ? { value: 'Due, not yet paid', sub: `Due since ${formatTime(nextDue, withTime)}`, tone: 'warn' }
          : { value: 'Up to date', sub: `Next due ${formatTime(nextDue, withTime)}`, tone: 'ok' };

  // Interest reserve ÷ interest owed per cycle, to one decimal.
  const coverTenths = s.monthlyInterestOwed > 0n ? (s.interestReserve * 10n) / s.monthlyInterestOwed : null;
  const cover =
    coverTenths === null
      ? null
      : {
          value: `${coverTenths / 10n}.${coverTenths % 10n} cycles`,
          tone: (coverTenths < 10n ? 'bad' : coverTenths < COVER_TARGET * 10n ? 'warn' : undefined) as Tone | undefined,
        };

  const sameRate = config.usInterestRate === config.globalInterestRate;
  const explorer = chain.blockExplorers?.default.url;

  return (
    <Card chain={chain}>
      <div>
        <p className={`fp-status fp-${status.tone}`}>{status.label}</p>
        {status.note && <p className="fp-note">{status.note}</p>}
      </div>

      <div className="fp-raise">
        <p className="fp-raised">
          <strong>{amount(s.totalRaised)}</strong> raised of {amount(s.raiseCap)}
        </p>
        <div className="fp-bar" role="progressbar" aria-label="Raised so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={funded}>
          <span style={{ width: `${Math.min(funded, 100)}%` }} />
        </div>
        <p className="fp-muted">
          {funded}% funded{open && ` · ${amount(s.raiseCap - s.totalRaised)} left`}
        </p>
      </div>

      <dl className="fp-list">
        {sameRate ? (
          <Row label="Interest" value={`${formatRate(config.usInterestRate)} per cycle`} />
        ) : (
          <>
            <Row label="Interest, US investors" value={`${formatRate(config.usInterestRate)} per cycle`} />
            <Row label="Interest, international" value={`${formatRate(config.globalInterestRate)} per cycle`} />
          </>
        )}
        <Row label="Cycle" value={`1 cycle = ${formatDuration(cycleDuration)}`} />
        <Row label="Term" value={formatDuration(config.term)} />
        <Row label="Minimum investment" value={amount(config.minDeposit)} />
        {payments && <Row label="Interest payments" value={payments.value} sub={payments.sub} tone={payments.tone} />}
        {cover && <Row label="Interest cover" value={cover.value} sub={`Target ${COVER_TARGET} cycles`} tone={cover.tone} />}
      </dl>

      {explorer && (
        <p className="fp-foot">
          Contract{' '}
          <a href={`${explorer}/address/${link.project}`} target="_blank" rel="noopener">
            {shortAddress(link.project)}
          </a>
        </p>
      )}
    </Card>
  );
}
