import { getCollection, getEntry } from 'astro:content';
import { readClientConfig } from './client-dir.mjs';

export const config = readClientConfig();

export async function getGeneral() {
  const entry = await getEntry('general', 'general');
  if (!entry) throw new Error('Missing content/settings/general.json in the client repo');
  return entry.data;
}

export async function getHome() {
  return (await getEntry('home', 'home'))?.data;
}

export async function getCategories() {
  const all = await getCollection('categories');
  return all.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}

export async function getListings() {
  const all = await getCollection('listings', (e) => !e.data.hidden);
  return all.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function getPages() {
  return getCollection('pages', (e) => !e.data.hidden);
}

export const listingUrl = (id: string) => `/${config.listingsPath}/${id}/`;

/** Internal links get a trailing slash; external ones are left alone. */
export function href(url: string) {
  if (!url) return '#';
  if (/^(https?:|mailto:|tel:|#)/.test(url)) return url;
  if (/^www\./.test(url)) return `https://${url}`;
  const path = url.startsWith('/') ? url : `/${url}`;
  return /\.[a-z0-9]+$/i.test(path) || path.endsWith('/') || path.includes('#') ? path : `${path}/`;
}

export const isExternal = (url: string) => /^(https?:)?\/\//.test(url) || /^www\./.test(url);

export function formatMonth(date?: Date) {
  return date ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
}

/** Google Fonts stylesheet URL for the theme fonts (Google Fonts names, e.g. "Poppins"). */
export function fontsHref(...fonts: string[]) {
  const families = [...new Set(fonts.filter(Boolean))]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700;800;900`)
    .join('&');
  return families ? `https://fonts.googleapis.com/css2?${families}&display=swap` : '';
}
