// /manage/: this site's projects, then one project's pages, laid out like the
// fund dashboard (real-estate-fund dashboard/): an Overview of what needs
// doing, then a page for each step of the flow. The project, page and
// investor live in the address (#0x…/investors/0x…), so a reload or a
// bookmark comes back to the same place; #new is the New project page.
// Everything is visible without a wallet; each action says what it needs,
// and the contract checks every one.
import { queryOptions, useQueries } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BaseError, getAddress, isAddress, type Address, type Chain, type PublicClient } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { projectLensAbi } from '../abi';
import type { Editor } from '../WalletIsland';
import { duties } from '../duties';
import { NONE, formatAmount, shortAddress } from '../format';
import { useSiteProjects } from '../projects';
import { linkQuery, projectQuery, rolesQuery, useWallet, type Listing, type Owner, type ProjectData, type Trust } from '../queries';
import { useChainNow } from '../ui';
import { Activity } from './Activity';
import { CreateProject, LinkToListing } from './Create';
import { Earnings } from './Earnings';
import { InvestorDetail } from './InvestorDetail';
import { Investors } from './Investors';
import { ixProblem, useIndexerUrl, useIxStatus } from './ix';
import { Overview } from './Overview';
import { Raise } from './Raise';
import { Repayment } from './Repayment';
import { Settings } from './Settings';
import { Surplus } from './Surplus';
import { FLAG_HELP, H, HEALTH_HELP, PAGE_HELP } from './help';
import { InfoTip } from './Tip';
import { Addr, Badge, Bar, Callout, Empty, Segmented, Skeleton, TipButton, TipLink, duration, relative, type Tone } from './ui';
import { DerivedContext, HEALTH_LABEL, ViewContext, derive, healthOf, useV, useView, type Health, type Section } from './view';

interface Props {
  listings: Listing[];
  trust: Trust;
  owners: Owner[];
  editor: Editor | null;
  chain: Chain;
}

export const HEALTH_TONE: Record<Health, Tone> = { ok: 'ok', due: 'warn', attention: 'warn', late: 'bad', repaid: 'info' };

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◎' },
  { id: 'raise', label: 'Raise', icon: '↑' },
  { id: 'investors', label: 'Investors', icon: '◍' },
  { id: 'earnings', label: 'Earnings & payments', icon: '⇄' },
  { id: 'surplus', label: 'Surplus & development', icon: '◒' },
  { id: 'repayment', label: 'Repayment', icon: '↺' },
  { id: 'activity', label: 'Activity', icon: '≡' },
  { id: 'settings', label: 'Settings & team', icon: '⚙' },
];

function useHash() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => window.removeEventListener('hashchange', onChange);
    },
    () => location.hash,
  );
}

export default function Manage({ listings, trust, owners, editor, chain }: Props) {
  const hash = useHash();
  const [projectPart, section, investor] = hash.replace(/^#/, '').split('/');
  const { projects, ixPending, ixError } = useSiteProjects(listings, trust, chain.id);
  const selected = projects.find((l) => l.project.toLowerCase() === projectPart?.toLowerCase());
  // Only this site's projects open: any address would let a link show a stranger's project as one of the site's.
  const unknown = !selected && projectPart && isAddress(projectPart) ? projectPart : null;
  // Moving between pages starts at the top, like following a link.
  const top = useRef<HTMLDivElement>(null);
  const key = `${projectPart}/${section ?? ''}`;
  const last = useRef(key);
  useEffect(() => {
    if (last.current !== key && top.current && top.current.getBoundingClientRect().top < 0) top.current.scrollIntoView();
    last.current = key;
  }, [key]);

  return (
    <div ref={top} className="mg">
      {projectPart === 'new' ? (
        <CreateProject trust={trust} owners={owners} editor={editor} chain={chain} />
      ) : selected ? (
        <ProjectLayout
          key={selected.project}
          listing={selected}
          trust={trust}
          editor={editor}
          chain={chain}
          section={(NAV.some((n) => n.id === section) ? section : 'overview') as Section}
          investor={investor ? (isAddress(investor) ? getAddress(investor) : 'invalid') : null}
        />
      ) : unknown && ixPending ? (
        <Skeleton tall />
      ) : unknown ? (
        <div className="mg-card">
          <TipLink className="mg-back" tip="Back to this site’s projects." href="#">
            <span aria-hidden="true">←</span> All projects
          </TipLink>
          <Empty title="Not one of this site's projects" icon="!">
            {unknown} isn't linked from a listing, and the fund indexer doesn't list it as created and owned by this site's trusted owners
            {ixError ? " (the indexer isn't available right now)" : ''}. A project made moments ago shows once the indexer catches up.
          </Empty>
        </div>
      ) : (
        <Home listings={projects} trust={trust} ixError={ixError} />
      )}
    </div>
  );
}

/** Matured deposits not yet repaid, for the project cards (the first 200 in line). */
const overdueQuery = (client: PublicClient | undefined, lens: Address, project: Address, enabled: boolean) =>
  queryOptions({
    queryKey: ['fund-overdue', project],
    enabled: enabled && Boolean(client),
    refetchInterval: 60_000,
    queryFn: async () => {
      const s = await client!.readContract({ address: lens, abi: projectLensAbi, functionName: 'getProjectState', args: [project] });
      const active = s.depositCount - s.nextPayoffId;
      return client!.readContract({ address: lens, abi: projectLensAbi, functionName: 'overdueBalloons', args: [project, s.nextPayoffId, active < 200n ? active : 200n] });
    },
  });

function Home({ listings, trust, ixError }: { listings: Listing[]; trust: Trust; ixError: Error | null }) {
  const client = usePublicClient();
  const { address } = useAccount();
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const links = useQueries({ queries: listings.map((l) => linkQuery(client, trust, l.project)) });
  const trusted = (i: number) => links[i].data?.trusted === true;
  const roles = useQueries({ queries: listings.map((l, i) => rolesQuery(client, l.project, address, trusted(i))) });
  const states = useQueries({ queries: listings.map((l, i) => projectQuery(client, trust.lens, l.project, trusted(i))) });
  const overdue = useQueries({ queries: listings.map((l, i) => overdueQuery(client, trust.lens, l.project, trusted(i))) });

  // Tell the site manager why a listing's project is missing, once each.
  const warned = useRef(new Set<string>());
  useEffect(() => {
    links.forEach((q, i) => {
      if (q.data && !q.data.trusted && !listings[i].unlisted && !warned.current.has(listings[i].project)) {
        warned.current.add(listings[i].project);
        console.warn(`${listings[i].title} isn't shown on /manage/: ${q.data.reason}.`);
      }
    });
  });

  const all = listings.map((l, i) => ({ l, i })).filter(({ i }) => trusted(i));
  const mine = all.filter(({ i }) => duties(roles[i].data));
  const showMine = Boolean(address) && tab === 'mine';
  const shown = showMine ? mine : all;
  const loading = listings.some((_, i) => links[i].isPending) || (showMine && all.some(({ i }) => roles[i].isPending));
  const owner = Boolean(address && trust.trustedOwners.some((o) => o.toLowerCase() === address.toLowerCase()));

  return (
    <div className="mg-home">
      <div className="mg-home-head">
        <h2>
          Projects
          <InfoTip about="projects">{H.projects}</InfoTip>
        </h2>
        {address && (
          <Segmented
            label="Which projects"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'mine', label: `Your projects · ${mine.length}`, tip: 'Projects where your wallet holds a role or has a handover waiting.' },
              { id: 'all', label: `All · ${all.length}`, tip: 'Every project on this site.' },
            ]}
          />
        )}
        {owner && (
          <>
            <span className="mg-spacer" />
            <TipLink className="mg-btn" tip={H.newProject} href="#new">
              New project
            </TipLink>
          </>
        )}
      </div>
      <p className="mg-muted">{showMine ? 'Projects where your wallet holds a role or has a handover waiting.' : address ? "Every project on this site. Collecting, paying and repaying need no role, so any wallet can run them." : 'Connect the wallet that holds your role to see what you can do. Everything is visible without one.'}</p>
      {loading && !shown.length ? (
        <div className="mg-cards">
          <Skeleton tall />
          <Skeleton tall />
        </div>
      ) : !shown.length ? (
        <div className="mg-card">
          <Empty title={showMine ? "This wallet doesn't hold a role here" : 'No projects yet'}>
            {showMine ? (
              <>
                Ask a project's owner to give your wallet a role, or browse{' '}
                <button type="button" className="mg-link" onClick={() => setTab('all')}>
                  all projects
                </button>
                .
              </>
            ) : owner ? (
              <>
                None yet. Create the first one with <a href="#new">New project</a>.
              </>
            ) : (
              "This site's trusted owners haven't created any projects yet."
            )}
          </Empty>
        </div>
      ) : (
        <div className="mg-cards">
          {shown.map(({ l, i }) => {
            const link = links[i].data;
            return (
              <ProjectCard
                key={l.project}
                listing={l}
                data={states[i].data}
                token={link?.trusted ? link.token : undefined}
                overdue={overdue[i].data?.length ?? 0}
                roles={duties(roles[i].data)}
              />
            );
          })}
        </div>
      )}
      {ixError && <p className="mg-muted mg-small-text">{ixProblem(ixError, 'Projects no listing links to yet')}</p>}
    </div>
  );
}

function ProjectCard({
  listing,
  data,
  token,
  overdue,
  roles,
}: {
  listing: Listing;
  data: ProjectData | undefined;
  token: { decimals: number; symbol: string } | undefined;
  overdue: number;
  roles: string[] | null;
}) {
  const now = useChainNow(data?.clockOffset);
  const current = !!data && data.nextDue > now;
  const health = data ? healthOf(data.state, { current, overdue: overdue > 0 }) : null;
  const amount = (v: bigint) => (token ? `${formatAmount(v, token.decimals, 0)} ${token.symbol}` : '…');
  return (
    <a className="mg-card mg-project-card" href={`#${listing.project}`}>
      <div className="mg-project-card-head">
        <div>
          <strong>{listing.title}</strong>
          <span className="mg-mono mg-muted">{shortAddress(listing.project)}</span>
        </div>
        {health ? <Badge tone={HEALTH_TONE[health]}>{HEALTH_LABEL[health]}</Badge> : <Badge>…</Badge>}
      </div>
      {data ? (
        <div className="mg-project-card-body">
          <div className="mg-line">
            <span>Raised</span>
            <strong className="mg-num">
              {amount(data.state.totalRaised)} <span className="mg-muted">/ {amount(data.state.raiseCap)}</span>
            </strong>
          </div>
          <Bar value={data.state.totalRaised} total={data.state.raiseCap} label="Raised of the cap" />
          <div className="mg-line">
            <span>Outstanding</span>
            <strong className="mg-num">{amount(data.state.usPrincipal + data.state.globalPrincipal)}</strong>
          </div>
          <div className="mg-line">
            <span>Next payment</span>
            <strong>{data.nextDue === NONE ? '—' : current ? relative(data.nextDue, now) : <span className="mg-text-warn">due now</span>}</strong>
          </div>
        </div>
      ) : (
        <div className="mg-skeleton" />
      )}
      <div className="mg-project-card-foot">
        {listing.unlisted && <Badge tip={H.unlisted}>Not on a listing</Badge>}
        {(roles ?? []).map((r) => (
          <Badge key={r} tone="brand">
            {r}
          </Badge>
        ))}
        {overdue > 0 && <span className="mg-text-bad">{overdue} past maturity</span>}
      </div>
    </a>
  );
}

function ProjectLayout({
  listing,
  trust,
  editor,
  chain,
  section,
  investor,
}: {
  listing: Listing;
  trust: Trust;
  editor: Editor | null;
  chain: Chain;
  section: Section;
  investor: Address | 'invalid' | null;
}) {
  const state = useView(listing, trust, chain);
  const derived = useMemo(() => (state.status === 'ready' ? derive(state.v) : null), [state]);
  const { address } = useAccount();
  const [linking, setLinking] = useState(false);
  const back = (
    <TipLink className="mg-back" tip="Back to this site’s projects." href="#">
      <span aria-hidden="true">←</span> All projects
    </TipLink>
  );

  if (state.status === 'untrusted')
    return (
      <div className="mg-card">
        {back}
        <Empty title="This project can't be shown" icon="!">
          {listing.unlisted ? `This address doesn't pass the site's checks: ${state.reason}.` : `${listing.title} is linked to ${listing.project}, but ${state.reason}.`} For safety, the page doesn't open it.
        </Empty>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="mg-card">
        {back}
        <Empty title="Couldn't read this project" icon="!">
          The network didn't answer. It retries on its own; reload the page if this stays.
          {readError(state.error) && <small className="mg-block mg-muted">{readError(state.error)}</small>}
        </Empty>
      </div>
    );
  if (state.status === 'loading' || !derived)
    return (
      <div className="mg-loading">
        {back}
        <Skeleton />
        <div className="mg-grid-3">
          <Skeleton tall />
          <Skeleton tall />
          <Skeleton tall />
        </div>
      </div>
    );

  const v = state.v;
  const d = derived;
  const counts: Partial<Record<Section, number>> = {};
  for (const t of d.tasks) if (t.severity !== 'info') counts[t.section] = (counts[t.section] ?? 0) + 1;
  const mine = duties(v.roles);

  return (
    <ViewContext.Provider value={v}>
      <DerivedContext.Provider value={d}>
        <div className="mg-project">
          {back}
          <div className="mg-project-head">
            <h2>{listing.title}</h2>
            <Badge tone={HEALTH_TONE[d.health]} tip={HEALTH_HELP}>
              {HEALTH_LABEL[d.health]}
            </Badge>
            {v.s.paused && (
              <Badge tone="warn" tip={FLAG_HELP.paused}>
                Paused
              </Badge>
            )}
            {v.s.killed && (
              <Badge tone="bad" tip={FLAG_HELP.killed}>
                Deposits stopped
              </Badge>
            )}
            {v.s.closed && <Badge tip={FLAG_HELP.closed}>Raise closed</Badge>}
            {v.s.filled && (
              <Badge tone="brand" tip={FLAG_HELP.filled}>
                Fully raised
              </Badge>
            )}
            {d.compounding && (
              <Badge tone="info" tip={FLAG_HELP.compounding}>
                Buying LEMX
              </Badge>
            )}
            <span className="mg-spacer" />
            <SyncStatus />
            <Addr a={listing.project} />
            {editor && listing.slug && (
              <TipLink className="mg-btn mg-quiet mg-small" tip={H.editListing} href={`${editor.url}#/collections/listings/entries/${encodeURIComponent(listing.slug)}`} external>
                Edit project page
              </TipLink>
            )}
          </div>
          <div className="mg-roles">
            {address ? (
              mine ? (
                <>
                  Your roles
                  <InfoTip about="your roles">{H.roles}</InfoTip>
                  {mine.map((r) => (
                    <Badge key={r} tone="brand">
                      {r}
                    </Badge>
                  ))}
                </>
              ) : (
                <span>Your wallet has no role on this project. You can run the open upkeep actions and see everything.</span>
              )
            ) : (
              <span>Connect a wallet to act. Everything is visible without one.</span>
            )}
            {address && <WalletBalance account={address} />}
          </div>
          {listing.unlisted && (
            <>
              <Callout
                tone="info"
                title="Not on a listing yet"
                action={
                  editor && (
                    <TipButton className="mg-btn mg-quiet mg-small" tip={linking ? 'Hides the steps.' : 'Shows how to link this project to a listing in the editor.'} onClick={() => setLinking(!linking)}>
                      {linking ? 'Hide' : 'Link to a listing'}
                    </TipButton>
                  )
                }
              >
                Investors can't find this project on the site until a listing links to it. You can set it up here first.
              </Callout>
              {linking && editor && <LinkToListing project={listing.project} name={listing.title} editor={editor} />}
            </>
          )}

          <div className="mg-body">
            <nav className="mg-nav" aria-label={`${listing.title} pages`}>
              <ul>
                {NAV.map((n) => (
                  <li key={n.id}>
                    <TipLink className="mg-nav-link" place="right" tip={PAGE_HELP[n.id]} href={`#${listing.project}${n.id === 'overview' ? '' : `/${n.id}`}`} current={n.id === section}>
                      <span aria-hidden="true">{n.icon}</span>
                      <span>{n.label}</span>
                      {counts[n.id] ? (
                        <span className="mg-count">
                          <span aria-hidden="true">{counts[n.id]}</span>
                          <span className="mg-sr">, {counts[n.id]} to do</span>
                        </span>
                      ) : null}
                    </TipLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mg-main">
              {section === 'overview' && <Overview />}
              {section === 'raise' && <Raise />}
              {section === 'investors' &&
                (investor === 'invalid' ? (
                  <div className="mg-card">
                    <Empty title="That isn't a wallet address" icon="!">
                      Check the link, or open an investor from the <a href={`#${listing.project}/investors`}>list of investors</a>.
                    </Empty>
                  </div>
                ) : investor ? (
                  <InvestorDetail investor={investor} />
                ) : (
                  <Investors />
                ))}
              {section === 'earnings' && <Earnings />}
              {section === 'surplus' && <Surplus />}
              {section === 'repayment' && <Repayment />}
              {section === 'activity' && <Activity />}
              {section === 'settings' && <Settings />}
            </div>
          </div>
        </div>
      </DerivedContext.Provider>
    </ViewContext.Provider>
  );
}

/** The RPC's own words for a failed read, when it gave any. */
function readError(e: unknown): string {
  return e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : '';
}

/** The connected wallet's balance of the project's token, for the actions that take it. */
function WalletBalance({ account }: { account: Address }) {
  const v = useV();
  const wallet = useWallet(v.listing.project, v.token.address, account);
  if (wallet.data === undefined) return null;
  return (
    <>
      <span className="mg-spacer" />
      <span>
        Your wallet holds <strong className="mg-num">{v.amount(wallet.data.balance)}</strong>
      </span>
    </>
  );
}

/** How fresh the indexer's lists and history are. Balances are always read live. */
function SyncStatus() {
  const url = useIndexerUrl();
  const { data, error } = useIxStatus();
  if (!url) return null;
  const age = data?.state?.updated_at ? (Date.now() - data.state.updated_at) / 1000 : null;
  const behind = data?.state?.head != null ? data.state.head - data.state.cursor : null;
  const ok = !error && !data?.lastError && age !== null && age < 120;
  const label = error
    ? 'History unavailable'
    : data?.lastError
      ? 'History sync error'
      : age === null
        ? 'History syncing…'
        : behind && behind > 50
          ? `Catching up (${behind.toLocaleString()} blocks)`
          : `History synced ${duration(age)} ago`;
  return (
    <span className="mg-sync">
      <span className={`mg-sync-dot mg-${ok ? 'ok' : error || data?.lastError ? 'bad' : 'warn'}`} aria-hidden="true" />
      {label}
      <InfoTip about="history">
        {H.sync}
        {(error || data?.lastError) && <span className="mg-block">{error ? `Couldn't reach the indexer: ${readError(error)}` : `The indexer's last error: ${data!.lastError}`}</span>}
      </InfoTip>
    </span>
  );
}
