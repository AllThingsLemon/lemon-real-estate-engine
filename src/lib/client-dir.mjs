// Where the client's content repo lives. Locally that's ./client (a clone or
// symlink); on Cloudflare the client repo is the build root and the engine is
// cloned into ./engine, so the build sets CLIENT_DIR=..
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const raw = resolve(process.cwd(), process.env.CLIENT_DIR || 'client');

if (!existsSync(resolve(raw, 'site.config.json'))) {
  throw new Error(
    `No client content found at ${raw} (missing site.config.json).\n` +
      `Set CLIENT_DIR, or run: pnpm client <path-or-git-url>`,
  );
}

export const clientDir = realpathSync(raw);

/** Reads a JSON file from the client repo; returns fallback if it's missing. */
export function readClientJson(relPath, fallback = {}) {
  const file = resolve(clientDir, relPath);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Jesse-only settings: repo, branch, siteUrl, authUrl. Not editable in the CMS. */
export function readClientConfig() {
  const cfg = readClientJson('site.config.json');
  return {
    repo: cfg.repo || '',
    branch: cfg.branch || 'main',
    siteUrl: (process.env.SITE_URL || cfg.siteUrl || '').replace(/\/$/, ''),
    authUrl: process.env.CMS_AUTH_URL || cfg.authUrl || '',
    listingsPath: cfg.listingsPath || 'projects',
  };
}
