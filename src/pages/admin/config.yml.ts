import type { APIRoute } from 'astro';
import { stringify } from 'yaml';
import { buildCmsConfig } from '../../cms/config.mjs';

export const GET: APIRoute = () =>
  new Response(stringify(JSON.parse(JSON.stringify(buildCmsConfig())), { lineWidth: 0 }), {
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
  });
