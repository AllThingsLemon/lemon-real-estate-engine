// The header's Manage link: shown once the connected wallet holds a role on
// one of this site's projects, has a handover waiting there, or is one of the
// site's trusted owners (who can create projects there). /manage/ is open to
// any wallet; the link only appears for the people who run projects.
import { useQueries } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { duties } from './duties';
import { useSiteProjects } from './projects';
import { linkQuery, rolesQuery, type Listing, type Trust } from './queries';

export function ManageLink({ sites, trust, chainId, current }: { sites: Listing[]; trust: Trust; chainId: number; current: boolean }) {
  const client = usePublicClient();
  const { address } = useAccount();
  const owner = Boolean(address && trust.trustedOwners.some((o) => o.toLowerCase() === address.toLowerCase()));
  // No reads until a wallet connects, and none for an owner, who always gets the link.
  const { projects } = useSiteProjects(sites, trust, chainId, Boolean(address) && !owner);
  const links = useQueries({ queries: projects.map((l) => ({ ...linkQuery(client, trust, l.project), enabled: Boolean(client && address && !owner) })) });
  const roles = useQueries({ queries: projects.map((l, i) => rolesQuery(client, l.project, address, !owner && links[i].data?.trusted === true)) });
  if (!address || !(owner || roles.some((r) => duties(r.data)))) return null;
  return (
    <a className="wallet-manage" href="/manage/" aria-current={current ? 'page' : undefined}>
      Manage
    </a>
  );
}
