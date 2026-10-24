// @ts-check
import { defineConfig } from 'astro/config';
import { clientDir, readClientConfig } from './src/lib/client-dir.mjs';

const site = readClientConfig();

export default defineConfig({
  output: 'static',
  site: site.siteUrl || undefined,
  trailingSlash: 'always',
  // Client uploads, favicon, robots.txt etc. come straight from the client repo.
  publicDir: `${clientDir}/public`,
  vite: {
    server: { fs: { allow: ['.', clientDir] } },
  },
});
