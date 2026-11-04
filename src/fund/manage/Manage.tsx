// /manage/: pick one of this site's projects, then the tabs the connected
// wallet can use. The project and tab live in the address (#0x…/earnings),
// so a reload or a bookmark comes back to the same place. The UI hides what a
// wallet can't use, but the contract enforces every permission.
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Address, Chain } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { formatAmount } from '../format';
import { ConnectPrompt } from '../InvestPanel';
import { linkQuery, rolesQuery, useDeposits, useLinkCheck, useProjectState, type Listing, type Roles, type Trust } from '../queries';
import { ROLE_LABEL } from '../roles';
import { useChainNow } from '../ui';
import { Access } from './Access';
import { Controls } from './Controls';
import { Earnings } from './Earnings';
import { Addr, useAction, type ProjectView } from './fields';
import { Investors } from './Investors';
import { MoneyIn } from './MoneyIn';
import { Overview } from './Overview';

interface Props {
  listings: Listing[];
  trust: Trust;
  chain: Chain;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'investors', label: 'Investors' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'money', label: 'Money in' },
  { id: 'controls', label: 'Controls' },
  { id: 'access', label: 'Access' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function useHash() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => window.removeEventListener('hashchange', onChange);
    },
    () => location.hash,
  );
}

/** Roles shown on the picker, or null when the wallet has nothing to do on this project. */
function roleSummary(r: Roles | undefined): string | null {
  if (!r) return null;
  const parts = [...(r.isOwner ? ['Owner'] : []), ...r.roles.map((x) => ROLE_LABEL[x])];
  if (r.isPendingOwner) parts.push('Ownership offered to you');
  if (r.isCompanyWallet && r.pendingCompanyWallet) parts.push('Company wallet handover');
  if (r.isFeeWallet && r.pendingMgmtFeeWallet) parts.push('Fee wallet handover');
  return parts.length ? parts.join(' · ') : null;
}

export default function Manage({ listings, trust, chain }: Props) {
  const client = usePublicClient();
  const { address, isConnected } = useAccount();
  const hash = useHash();
  const [projectPart, tabPart] = hash.replace(/^#/, '').split('/');
  const selected = listings.find((l) => l.project.toLowerCase() === projectPart?.toLowerCase());

  const links = useQueries({ queries: listings.map((l) => linkQuery(client, trust, l.project)) });
  const roles = useQueries({
    queries: listings.map((l, i) => rolesQuery(client, l.project, address, links[i].data?.trusted === true)),
  });

  // Tell the site manager why a project is missing, once each.
  const warned = useRef(new Set<string>());
  useEffect(() => {
    links.forEach((q, i) => {
      if (q.data && !q.data.trusted && !warned.current.has(listings[i].project)) {
        warned.current.add(listings[i].project);
        console.warn(`${listings[i].title} isn't shown: ${q.data.reason}.`);
      }
    });
  });

  if (!isConnected || !address) {
    return (
      <div className="fp fm-connect">
        <p>Connect the wallet that holds your role on a project.</p>
        <ConnectPrompt label="Connect wallet" />
      </div>
    );
  }

  if (selected) {
    return <ProjectManager listing={selected} trust={trust} chain={chain} account={address} tab={(tabPart as Tab) || 'overview'} />;
  }

  const loading = listings.some((_, i) => links[i].isPending || (links[i].data?.trusted && roles[i].isPending));
  const trusted = listings.map((l, i) => ({ l, summary: roleSummary(roles[i].data), ok: links[i].data?.trusted === true })).filter((x) => x.ok);
  const mine = trusted.filter((x) => x.summary);
  const others = trusted.filter((x) => !x.summary);

  return (
    <div className="fm-picker">
      <section>
        <h2>Your projects</h2>
        {mine.length ? (
          <ul className="fm-cards">
            {mine.map(({ l, summary }) => (
              <li key={l.project}>
                <a href={`#${l.project}`}>
                  <strong>{l.title}</strong>
                  <span>{summary}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fp-muted">{loading ? 'Checking your roles…' : "This wallet doesn't hold a role on any of this site's projects."}</p>
        )}
      </section>
      {others.length > 0 && (
        <section>
          <h2>Other projects</h2>
          <p className="fp-muted">Paying interest and the other upkeep need no role, so any wallet can open these.</p>
          <ul className="fm-cards">
            {others.map(({ l }) => (
              <li key={l.project}>
                <a href={`#${l.project}`}>
                  <strong>{l.title}</strong>
                  <span>Upkeep only</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProjectManager({ listing, trust, chain, account, tab }: { listing: Listing; trust: Trust; chain: Chain; account: Address; tab: Tab }) {
  const client = usePublicClient();
  const { project } = listing;
  const check = useLinkCheck(trust, project);
  const link = check.data?.trusted ? check.data : null;
  const live = useProjectState(trust.lens, project, Boolean(link));
  const deposits = useDeposits(project, Boolean(link));
  const roles = useQuery(rolesQuery(client, project, account, Boolean(link)));
  const now = useChainNow(live.data?.clockOffset);

  const back = (
    <a className="fm-back" href="#">
      ← All projects
    </a>
  );
  if (check.data && !check.data.trusted) {
    return (
      <div className="fm-project">
        {back}
        <p className="fp-muted">This project can't be managed here: it failed the site's link check.</p>
      </div>
    );
  }
  if (check.isError || live.isError || deposits.isError || roles.isError) {
    return (
      <div className="fm-project">
        {back}
        <p className="fp-muted">The project couldn't load. Reload the page to try again.</p>
      </div>
    );
  }
  if (!link || !live.data || !deposits.data || !roles.data) {
    return (
      <div className="fm-project">
        {back}
        <p className="fp-muted">Loading {listing.title}…</p>
      </div>
    );
  }

  const r = roles.data;
  const v: ProjectView = {
    listing,
    chain,
    account,
    lens: trust.lens,
    token: link.token,
    cycleDuration: link.cycleDuration,
    data: live.data,
    deposits: deposits.data,
    roles: r,
    now,
    withTime: link.cycleDuration < 86400n,
    amount: (x) => `${formatAmount(x, link.token.decimals)} ${link.token.symbol}`,
  };
  const can: Record<Tab, boolean> = {
    overview: true,
    investors: r.roles.includes('MANAGER_ROLE'),
    earnings: r.roles.includes('MANAGER_ROLE'),
    // Adding money needs no role; recording wires and renewals show inside for Operations and Company.
    money: true,
    controls: r.roles.includes('ADMIN_ROLE'),
    access: r.isOwner,
  };
  const tabs = TABS.filter((t) => can[t.id]);
  const current = can[tab] ? tab : 'overview';
  const summary = roleSummary(r);

  return (
    <div className="fm-project">
      {back}
      <div className="fm-title">
        <h2>{listing.title}</h2>
        <p className="fp-muted">
          {summary ? `Your roles: ${summary}` : 'No role on this project: upkeep only.'} · Contract <Addr address={project} chain={chain} />
        </p>
      </div>
      <Handovers v={v} />
      {/* Links that change the address, so a nav with aria-current rather than ARIA tabs (which promise arrow keys). */}
      {tabs.length > 1 && (
        <nav className="fm-tabs" aria-label={`Manage ${listing.title}`}>
          {tabs.map((t) => (
            <a key={t.id} href={`#${project}/${t.id}`} aria-current={t.id === current ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
      )}
      <div id="fm-panel">
        {current === 'overview' && <Overview v={v} trust={trust} />}
        {current === 'investors' && <Investors v={v} />}
        {current === 'earnings' && <Earnings v={v} />}
        {current === 'money' && <MoneyIn v={v} />}
        {current === 'controls' && <Controls v={v} />}
        {current === 'access' && <Access v={v} />}
      </div>
    </div>
  );
}

/** Handovers waiting on this wallet: ownership offered to it, or a replacement for a wallet it is. */
function Handovers({ v }: { v: ProjectView }) {
  const { busy, run } = useAction(v);
  const r = v.roles;
  const banners = [];
  if (r.isPendingOwner) {
    banners.push(
      <div key="owner" className="fm-banner">
        <p>
          <strong>You've been offered ownership of this project.</strong> Accepting gives this wallet Owner and Admin, and the current owner
          loses every role.
        </p>
        <button type="button" className="fp-btn" disabled={busy} onClick={() => run('Accept ownership', { functionName: 'acceptOwnership' })}>
          Accept ownership
        </button>
      </div>,
    );
  }
  if (r.isCompanyWallet && r.pendingCompanyWallet) {
    banners.push(
      <div key="company" className="fm-banner">
        <p>
          <strong>A new company wallet is proposed:</strong> <Addr address={r.pendingCompanyWallet} chain={v.chain} />. As the current
          company wallet, this wallet has to accept it. Development funds go there afterwards.
        </p>
        <button type="button" className="fp-btn" disabled={busy} onClick={() => run('Accept the new company wallet', { functionName: 'acceptCompanyWallet' })}>
          Accept the new company wallet
        </button>
      </div>,
    );
  }
  if (r.isFeeWallet && r.pendingMgmtFeeWallet) {
    banners.push(
      <div key="fee" className="fm-banner">
        <p>
          <strong>A new management fee wallet is proposed:</strong> <Addr address={r.pendingMgmtFeeWallet} chain={v.chain} />. As the current
          fee wallet, this wallet has to accept it.
        </p>
        <button type="button" className="fp-btn" disabled={busy} onClick={() => run('Accept the new fee wallet', { functionName: 'acceptMgmtFeeWallet' })}>
          Accept the new fee wallet
        </button>
      </div>,
    );
  }
  return banners.length ? <div className="fm-banners">{banners}</div> : null;
}
