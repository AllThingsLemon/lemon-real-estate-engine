// The header's Manage link: shown once the connected wallet holds a role on
// one of this site's projects, or has a handover waiting there. /manage/ is
// open to any wallet; the link only appears for the people who run projects.
import { useQueries } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { duties } from './duties';
import { linkQuery, rolesQuery, type Listing, type Trust } from './queries';

export function ManageLink({ sites, trust, current }: { sites: Listing[]; trust: Trust; current: boolean }) {
  const client = usePublicClient();
  const { address } = useAccount();
  // No reads until a wallet connects.
  const links = useQueries({ queries: sites.map((l) => ({ ...linkQuery(client, trust, l.project), enabled: Boolean(client && address) })) });
  const roles = useQueries({ queries: sites.map((l, i) => rolesQuery(client, l.project, address, links[i].data?.trusted === true)) });
  if (!address || !roles.some((r) => duties(r.data))) return null;
  return (
    <a className="wallet-manage" href="/manage/" aria-current={current ? 'page' : undefined}>
      Manage
    </a>
  );
}
