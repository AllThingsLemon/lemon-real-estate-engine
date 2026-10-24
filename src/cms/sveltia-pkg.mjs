// Finds files inside the installed @sveltia/cms package (its exports map only
// exposes the JS entry, so resolve that and walk up).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(createRequire(import.meta.url).resolve('@sveltia/cms')), '..');
export const sveltiaFile = (rel) => resolve(root, rel);
export const sveltiaVersion = JSON.parse(readFileSync(sveltiaFile('package.json'), 'utf8')).version;
