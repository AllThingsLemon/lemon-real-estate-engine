// The live panel on a linked listing. Anyone sees raise progress, status,
// rates and payment health. A connected wallet also gets its one next step
// (connect → not approved yet → invest) and its positions in this project.
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Address, Chain } from 'viem';
import { useAccount } from 'wagmi';
import { DEFAULT_NOT_APPROVED, canInvest, type Disclosures } from './disclosures';
import { NONE, formatAmount, formatDuration, formatRate, formatTime, shortAddress } from './format';
import { InvestForm } from './InvestForm';
import { PositionCard } from './PositionCard';
import { positionsFor } from './positions';
import { useDeposits, useLinkCheck, useProjectState, useWallet, type Listing, type Trust } from './queries';
import { Rich } from './Rich';
import { Row, useChainNow, useMedia, type Tone } from './ui';

/** The contract keeps its interest reserve at 2 cycles of interest (INTEREST_RESERVE_CYCLES). */
const COVER_TARGET = 2n;

interface Props {
  listing: Listing;
  trust: Trust;
  chain: Chain;
  disclosures: Disclosures | null;
  portfolioUrl: string;
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

export default function InvestPanel({ listing, trust, chain, disclosures, portfolioUrl }: Props) {
  const { project } = listing;
  const check = useLinkCheck(trust, project);
  const link = check.data?.trusted ? check.data : null;
  const live = useProjectState(trust.lens, project, Boolean(link));
  const { address, isConnected } = useAccount();
  const deposits = useDeposits(project, Boolean(link) && isConnected);
  const wallet = useWallet(project, link?.token.address, address);
  const now = useChainNow(live.data?.clockOffset);
  const actionRef = useRef<HTMLDivElement>(null);

  // Tell the site manager why, without showing contract details to visitors.
  useEffect(() => {
    if (check.data && !check.data.trusted) console.warn(`Investing is off for this listing: ${check.data.reason}.`);
  }, [check.data]);
  useEffect(() => {
    if (link && !canInvest(disclosures)) {
      console.warn('Investing is off until content/settings/investing.json has the acknowledgments and the deposit confirmation (Site settings → Investor disclosures in the editor).');
    }
  }, [link, disclosures]);

  if (check.isError || live.isError) {
    return (
      <Card chain={chain}>
        <p className="fp-muted">Live figures couldn't load.</p>
        <button className="fp-btn fp-btn-quiet" type="button" onClick={() => (check.isError ? check.refetch() : live.refetch())}>
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
  if (!link || !live.data) {
    return (
      <Card chain={chain}>
        <p className="fp-muted">Loading live figures…</p>
      </Card>
    );
  }

  const { token, cycleDuration } = link;
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
  const positions = address && deposits.data ? positionsFor(address, deposits.data, live.data, cycleDuration, now) : [];
  const values = { company: disclosures?.company, project: listing.title, network: chain.name, wallet: address && shortAddress(address) };

  let action: ReactNode = null;
  if (!isConnected || !address) {
    action = <ConnectPrompt label={open ? 'Connect wallet to invest' : 'Connect wallet to see your investment'} quiet={!open} />;
  } else if (!wallet.data || !deposits.data) {
    action = <p className="fp-muted">Checking your wallet…</p>;
  } else if (wallet.data.investorClass === 0) {
    if (open) action = <NotApproved text={disclosures?.notApproved || DEFAULT_NOT_APPROVED} values={values} account={address} />;
  } else if (open && !canInvest(disclosures)) {
    action = <p className="fp-muted">Investing opens here once this site's investor disclosures are set up.</p>;
  } else if (open) {
    action = (
      <InvestForm
        project={project}
        title={listing.title}
        account={address}
        chain={chain}
        token={token}
        cycleDuration={cycleDuration}
        data={live.data}
        wallet={wallet.data}
        first={positions.length === 0}
        disclosures={disclosures!}
      />
    );
  }

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

      {action && (
        <div className="fp-action" ref={actionRef}>
          {action}
        </div>
      )}

      {positions.length > 0 && (
        <div className="fp-positions">
          <h3>Your investment</h3>
          {positions.map((p) => (
            <PositionCard
              key={String(p.deposit.id)}
              p={p}
              ctx={{ project, token, cycleDuration, data: live.data!, deposits: deposits.data!, now }}
            />
          ))}
          <a className="fp-more" href={portfolioUrl}>
            All your investments on this site
          </a>
        </div>
      )}

      {explorer && (
        <p className="fp-foot">
          Contract{' '}
          <a href={`${explorer}/address/${project}`} target="_blank" rel="noopener">
            {shortAddress(project)}
          </a>
        </p>
      )}

      {open && <StickyInvestBar target={actionRef} funded={funded} />}
    </Card>
  );
}

export function ConnectPrompt({ label, quiet }: { label: string; quiet?: boolean }) {
  const { openConnectModal } = useConnectModal();
  return (
    <button type="button" className={`fp-btn${quiet ? ' fp-btn-quiet' : ''}`} onClick={openConnectModal} disabled={!openConnectModal}>
      {label}
    </button>
  );
}

/** "Not approved yet": the client's text, with the wallet address to copy where it says {wallet} on a line of its own. */
function NotApproved({ text, values, account }: { text: string; values: Record<string, string | undefined>; account: Address }) {
  const [before, after = ''] = text.split(/^[ \t]*\{wallet\}[ \t]*$/m);
  return (
    <div className="fp-rich">
      <Rich text={before} values={values} />
      <AddressBox address={account} />
      {after.trim() && <Rich text={after} values={values} />}
    </div>
  );
}

function AddressBox({ address }: { address: Address }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access: select it for the visitor to copy.
      const range = document.createRange();
      range.selectNodeContents(ref.current!);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
    }
  }
  return (
    <div className="fp-address">
      <code ref={ref}>{address}</code>
      <button type="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** On phones, an Invest bar at the bottom of the screen while the panel's next step is out of view. */
function StickyInvestBar({ target, funded }: { target: RefObject<HTMLDivElement | null>; funded: number }) {
  const narrow = useMedia('(max-width: 900px)');
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const el = target.current;
    if (!narrow || !el) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [narrow, target]);
  if (!narrow || hidden) return null;
  return createPortal(
    <div className="fund-sticky">
      <span>{funded}% funded</span>
      <button type="button" className="fp-btn" onClick={() => target.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
        Invest
      </button>
    </div>,
    document.body,
  );
}
