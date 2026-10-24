// Validates the generated CMS config against Sveltia's published JSON schema,
// so a typo in src/cms/config.mjs fails CI instead of a client's editor.
import { readFileSync } from 'node:fs';
import { sveltiaFile } from '../src/cms/sveltia-pkg.mjs';
import Ajv from 'ajv';
import { buildCmsConfig } from '../src/cms/config.mjs';

const schema = JSON.parse(readFileSync(sveltiaFile('schema/sveltia-cms.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false, logger: false });
const validate = ajv.compile(schema);
const config = JSON.parse(JSON.stringify(buildCmsConfig()));

if (validate(config)) {
  console.log('CMS config OK');
} else {
  // anyOf produces noisy errors; show the most specific ones.
  const errs = validate.errors.filter((e) => e.keyword !== 'anyOf' && e.keyword !== 'if');
  for (const e of errs.slice(0, 40)) console.error(`${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);
  process.exit(1);
}
