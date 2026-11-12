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
    repo: process.env.CMS_REPO || cfg.repo || '',
    branch: cfg.branch || 'main',
    siteUrl: (process.env.SITE_URL || cfg.siteUrl || '').replace(/\/$/, ''),
    authUrl: process.env.CMS_AUTH_URL || cfg.authUrl || '',
    listingsPath: cfg.listingsPath || 'projects',
    fund: readFundConfig(cfg.fund),
  };
}

// Chains the wallet pages support. BSC testnet first; mainnet once there's a factory on it.
export const FUND_CHAINS = [97, 56];

export const isAddress = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

/** Where the client's editor keeps the trusted owners (CMS → Site settings → Project owners). */
export const OWNERS_FILE = 'content/settings/owners.json';

/**
 * The wallets whose projects this site shows: site.config.json's
 * `fund.trustedOwners` plus the list in the editor's Site settings. The
 * editor's list adds to the site manager's, never replaces it, so a client
 * adding its own wallet can't untrust the existing projects. An editor's save
 * must never fail the build, so a bad address there is left out with a
 * warning (leaving one out can't trust anything more).
 */
function readOwners(fromSiteManager) {
  const fromEditor = [];
  const listed = readClientJson(OWNERS_FILE).owners;
  for (const o of Array.isArray(listed) ? listed : []) {
    if (!isAddress(o?.wallet)) console.warn(`${OWNERS_FILE}: left out ${JSON.stringify(o?.wallet ?? o)}, which isn't a wallet address`);
    else if (!fromEditor.some((f) => f.address.toLowerCase() === o.wallet.toLowerCase()))
      fromEditor.push({ address: o.wallet, name: typeof o.name === 'string' ? o.name.trim() : '' });
  }
  const fromManager = fromSiteManager
    .filter((address) => !fromEditor.some((f) => f.address.toLowerCase() === address.toLowerCase()))
    .map((address) => ({ address, name: '' }));
  const owners = [...fromEditor, ...fromManager];
  if (!owners.length) console.warn(`No trusted owners: add them in the editor (Site settings → Project owners). No project shows until then.`);
  return owners;
}

/**
 * The optional `fund` block: turns on the wallet pages for listings linked to
 * real-estate-fund projects. Missing means no wallet code at all. It's only in
 * site.config.json, so a mistake here is the site manager's: fail the build
 * with a clear message rather than ship a site that trusts the wrong contracts.
 * The trusted owners are the exception: the client can add to them (readOwners).
 */
function readFundConfig(fund) {
  if (fund == null) return null;
  const fail = (msg) => {
    throw new Error(`site.config.json "fund": ${msg}`);
  };
  if (typeof fund !== 'object' || Array.isArray(fund)) fail('must be an object');
  if (!FUND_CHAINS.includes(fund.chainId)) fail(`chainId must be one of ${FUND_CHAINS.join(', ')}`);
  const addresses = (key) => {
    const list = fund[key];
    if (!Array.isArray(list) || !list.length || !list.every(isAddress)) fail(`${key} must be a list of 0x addresses`);
    return list;
  };
  if (!isAddress(fund.lens)) fail('lens must be a 0x address');
  if (fund.walletConnectProjectId != null && typeof fund.walletConnectProjectId !== 'string') {
    fail('walletConnectProjectId must be a string');
  }
  // The fund repo's indexer Worker: lists and history on /manage/. Optional.
  if (fund.indexerUrl != null && !/^(https:\/\/|http:\/\/localhost[:/])/.test(fund.indexerUrl)) {
    fail('indexerUrl must be an https URL');
  }
  // Optional: the site manager's owners, trusted alongside the editor's list.
  if (fund.trustedOwners != null && !(Array.isArray(fund.trustedOwners) && fund.trustedOwners.every(isAddress))) {
    fail('trustedOwners must be a list of 0x addresses');
  }
  const owners = readOwners(fund.trustedOwners ?? []);
  return {
    chainId: fund.chainId,
    factories: addresses('factories'),
    lens: fund.lens,
    trustedOwners: owners.map((o) => o.address),
    /** The trusted owners with the names the editor gave them ('' for none). */
    owners,
    walletConnectProjectId: fund.walletConnectProjectId || '',
    indexerUrl: (fund.indexerUrl || '').replace(/\/+$/, ''),
  };
}
