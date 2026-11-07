// The projects /manage/ lists: those the site's listings link to, then every
// project the indexer knows of that a trusted owner created and a trusted
// owner owns, then any created in this browser that the indexer hasn't
// caught up with (or that a site without an indexer can't find again).
// The creator matters: the factory lets anyone create a project naming any
// owner, so a stranger could name one of the site's owners, with their own
// payout wallets. Only the creator (msg.sender) can't be faked. Every project
// still passes the link check before anything about it shows.
import { useMemo, useSyncExternalStore } from 'react';
import { getAddress, type Address } from 'viem';
import { shortAddress } from './format';
import { useIxProjects } from './manage/ix';
import type { Listing, Trust } from './queries';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const CREATED_KEY = 'fund-created-projects';

interface Created {
  chainId: number;
  project: Address;
  name: string;
}

/** A project's name for the page: the one it was created with, else its address. */
export const projectTitle = (project: Address, name?: string) => name?.trim() || `Project ${shortAddress(project)}`;

// Browser storage can be unavailable (private windows, blocked site data):
// then a new project only shows once the indexer lists it.
let created: Created[] | null = null;
const listeners = new Set<() => void>();
function readCreated(): Created[] {
  if (created) return created;
  try {
    created = JSON.parse(localStorage.getItem(CREATED_KEY) || '[]');
  } catch {
    created = [];
  }
  return created!;
}

/** Remember a project created from this browser, so /manage/ lists it straight away. */
export function rememberCreated(chainId: number, project: Address, name: string) {
  const next = [...readCreated().filter((c) => !same(c.project, project)), { chainId, project, name }];
  created = next;
  try {
    localStorage.setItem(CREATED_KEY, JSON.stringify(next));
  } catch {
    // Only the reload is lost; the indexer still finds it.
  }
  listeners.forEach((l) => l());
}

function useCreated(chainId: number) {
  const all = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    readCreated,
  );
  return useMemo(() => all.filter((c) => c.chainId === chainId), [all, chainId]);
}

/**
 * This site's projects, listings first (their titles and pages win). `enabled`
 * holds back the indexer request (the header asks only once a wallet connects).
 */
export function useSiteProjects(listings: Listing[], trust: Trust, chainId: number, enabled = true) {
  const ix = useIxProjects(enabled);
  const mine = useCreated(chainId);
  const projects = useMemo(() => {
    const out = [...listings];
    const add = (project: Address, name: string) => {
      if (!out.some((l) => same(l.project, project))) out.push({ project: getAddress(project), title: projectTitle(project, name), url: '', unlisted: true });
    };
    const trusted = (a: string) => trust.trustedOwners.some((o) => same(o, a));
    for (const p of ix.data ?? []) if (trusted(p.creator) && trusted(p.owner)) add(p.address, p.name);
    for (const c of mine) add(c.project, c.name);
    return out;
  }, [listings, ix.data, mine, trust.trustedOwners]);
  return { projects, ixPending: enabled && ix.isPending && !ix.error, ixError: ix.error };
}
