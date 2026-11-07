// Every listing linked to a project, for /portfolio/ and /manage/. Hidden
// listings too: their projects still have investors and upkeep. Those have
// no page to link to.
import { getCollection } from 'astro:content';
import { basename } from 'node:path';
import { isAddress } from '../lib/client-dir.mjs';
import { listingUrl } from '../lib/site';
import type { EditorListing, Listing } from './queries';

const byOrder = <T extends { data: { order: number; title: string } }>(a: T, b: T) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);

export async function linkedListings(): Promise<Listing[]> {
  return (await getCollection('listings'))
    .filter((l) => isAddress(l.data.investment.project))
    .sort(byOrder)
    .map((l) => ({
      project: l.data.investment.project as `0x${string}`,
      title: l.data.title,
      url: l.data.hidden ? '' : listingUrl(l.id),
    }));
}

/**
 * Listings not linked to a project yet, for /manage/'s "Link to a listing".
 * The slug is the file's name, which is how the editor addresses an entry.
 */
export async function unlinkedListings(): Promise<EditorListing[]> {
  return (await getCollection('listings'))
    .filter((l) => !isAddress(l.data.investment.project))
    .sort(byOrder)
    .map((l) => ({ slug: l.filePath ? basename(l.filePath).replace(/\.md$/, '') : l.id, title: l.data.title }));
}
