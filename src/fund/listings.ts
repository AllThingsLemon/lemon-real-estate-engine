// Every listing linked to a project, for /portfolio/ and /manage/. Hidden
// listings too: their projects still have investors and upkeep. Those have
// no page to link to.
import { getCollection } from 'astro:content';
import { isAddress } from '../lib/client-dir.mjs';
import { listingUrl } from '../lib/site';
import type { Listing } from './queries';

export async function linkedListings(): Promise<Listing[]> {
  return (await getCollection('listings'))
    .filter((l) => isAddress(l.data.investment.project))
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title))
    .map((l) => ({
      project: l.data.investment.project as `0x${string}`,
      title: l.data.title,
      url: l.data.hidden ? '' : listingUrl(l.id),
    }));
}
