// /portfolio/: the connected wallet's positions in this site's listings only,
// never another client's projects.
import { useQueries } from '@tanstack/react-query';
import type { Chain } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { formatAmount } from './format';
import { ConnectPrompt } from './InvestPanel';
import { PositionCard } from './PositionCard';
import { positionsFor } from './positions';
import { depositsQuery, linkQuery, projectQuery, type Listing, type Trust } from './queries';
import { useChainNow } from './ui';

interface Props {
  listings: Listing[];
  trust: Trust;
  chain: Chain;
}

export default function Portfolio({ listings, trust, chain }: Props) {
  const client = usePublicClient();
  const { address, isConnected } = useAccount();
  const now = useChainNow(0);

  const links = useQueries({ queries: listings.map((l) => linkQuery(client, trust, l.project)) });
  const trusted = (i: number) => links[i].data?.trusted === true;
  const projects = useQueries({
    queries: listings.map((l, i) => projectQuery(client, trust.lens, l.project, trusted(i))),
  });
  const deposits = useQueries({
    queries: listings.map((l, i) => depositsQuery(client, l.project, trusted(i) && isConnected)),
  });

  if (!isConnected || !address) {
    return (
      <div className="fp fp-portfolio-empty">
        <p>Connect your wallet to see your investments on this site.</p>
        <ConnectPrompt label="Connect wallet" />
      </div>
    );
  }

  const loading = listings.some((_, i) => links[i].isPending || (trusted(i) && (projects[i].isPending || deposits[i].isPending)));
  const failed = listings.some((_, i) => links[i].isError || projects[i].isError || deposits[i].isError);

  const groups = listings.flatMap((listing, i) => {
    const link = links[i].data;
    const data = projects[i].data;
    const all = deposits[i].data;
    if (!link?.trusted || !data || !all) return [];
    const offsetNow = now + BigInt(Math.floor(data.clockOffset));
    const positions = positionsFor(address, all, data, link.cycleDuration, offsetNow);
    if (!positions.length) return [];
    const ctx = { project: listing.project, token: link.token, cycleDuration: link.cycleDuration, data, deposits: all, now: offsetNow };
    return [{ listing, positions, ctx }];
  });

  // Totals, when every project pays in the same token.
  const tokens = new Set(groups.map((g) => `${g.ctx.token.symbol}:${g.ctx.token.decimals}`));
  const totals =
    groups.length > 1 && tokens.size === 1
      ? groups
          .flatMap((g) => g.positions)
          .reduce(
            (t, p) => ({
              invested: t.invested + (p.deposit.repaid ? 0n : p.deposit.principal),
              received: t.received + p.received,
              owed: t.owed + p.owed,
            }),
            { invested: 0n, received: 0n, owed: 0n },
          )
      : null;
  const token = groups[0]?.ctx.token;
  const amount = (v: bigint) => `${formatAmount(v, token!.decimals)} ${token!.symbol}`;

  return (
    <div className="fp-portfolio">
      {totals && (
        <dl className="fp-totals">
          <div>
            <dt>Invested now</dt>
            <dd>{amount(totals.invested)}</dd>
          </div>
          <div>
            <dt>Interest received</dt>
            <dd>{amount(totals.received)}</dd>
          </div>
          <div>
            <dt>Interest due now</dt>
            <dd>{amount(totals.owed)}</dd>
          </div>
        </dl>
      )}
      {groups.map(({ listing, positions, ctx }) => (
        <section key={listing.project} className="fp fp-group" aria-labelledby={`fp-g-${listing.project}`}>
          <div className="fp-head">
            <h2 id={`fp-g-${listing.project}`}>{listing.url ? <a href={listing.url}>{listing.title}</a> : listing.title}</h2>
            {chain.testnet && <span className="fp-tag">Test network</span>}
          </div>
          <div className="fp-pos-grid">
            {positions.map((p) => (
              <PositionCard key={String(p.deposit.id)} p={p} ctx={ctx} />
            ))}
          </div>
        </section>
      ))}
      {loading && <p className="fp-muted">Loading your investments…</p>}
      {failed && <p className="fp-muted">Some projects couldn't load. Reload the page to try again.</p>}
      {!loading && !failed && groups.length === 0 && (
        <div className="fp">
          <p>This wallet has no investments on this site yet.</p>
        </div>
      )}
      <p className="fp-sub fp-wallet-note">Showing wallet {address}.</p>
    </div>
  );
}

