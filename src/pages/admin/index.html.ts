// The CMS page. Served as a plain static file (Sveltia must not run inside a
// framework page). The Sveltia version is whatever the engine's lockfile pins.
import type { APIRoute } from 'astro';
import { sveltiaVersion as version } from '../../cms/sveltia-pkg.mjs';

export const GET: APIRoute = () =>
  new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Editor</title>
    <script src="https://unpkg.com/@sveltia/cms@${version}/dist/sveltia-cms.js"></script>
  </head>
  <body></body>
</html>
`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
