// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';
import { clientDir, readClientConfig } from './src/lib/client-dir.mjs';

const site = readClientConfig();

export default defineConfig({
  output: 'static',
  site: site.siteUrl || undefined,
  trailingSlash: 'always',
  // Client uploads, favicon, robots.txt etc. come straight from the client repo.
  publicDir: `${clientDir}/public`,
  // React only runs the wallet pages, so sites without a "fund" block don't load it.
  integrations: site.fund ? [react()] : [],
  vite: {
    server: { fs: { allow: ['.', clientDir] } },
    resolve: {
      alias: {
        // The wallet island, or an empty stand-in, so the wallet code is only
        // bundled for sites that use it.
        '@engine/fund-island': fileURLToPath(
          new URL(site.fund ? './src/fund/FundIsland.astro' : './src/fund/NoFund.astro', import.meta.url),
        ),
      },
    },
  },
});
