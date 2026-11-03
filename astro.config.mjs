// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';
import { clientDir, readClientConfig } from './src/lib/client-dir.mjs';

const site = readClientConfig();
const fundFile = (path) => fileURLToPath(new URL(`./src/fund/${path}`, import.meta.url));

// Wallet pages that only exist on sites with a "fund" block.
const fundPages = {
  name: 'engine-fund-pages',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({ pattern: '/portfolio', entrypoint: fundFile('pages/portfolio.astro') });
    },
  },
};

export default defineConfig({
  output: 'static',
  site: site.siteUrl || undefined,
  trailingSlash: 'always',
  // Client uploads, favicon, robots.txt etc. come straight from the client repo.
  publicDir: `${clientDir}/public`,
  // React only runs the wallet pages, so sites without a "fund" block don't load it.
  integrations: site.fund ? [react(), fundPages] : [],
  vite: {
    server: { fs: { allow: ['.', clientDir] } },
    resolve: {
      alias: {
        // The wallet components, or empty stand-ins, so the wallet code is
        // only bundled for sites that use it.
        '@engine/fund': fundFile(site.fund ? 'index.ts' : 'none.ts'),
      },
    },
  },
});
