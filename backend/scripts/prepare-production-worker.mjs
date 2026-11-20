import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

export const productionResourceName = 'ava-radio-production';
const stagingDatabaseId = 'abe077d0-b360-4beb-864a-0e3ab354cfd0';
const databaseIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function renderProductionWorkerConfig(template, accountId, databaseId) {
  if (typeof accountId !== 'string' || !/^[0-9a-f]{32}$/i.test(accountId)) {
    throw new Error('A verified Cloudflare account ID is required');
  }
  if (typeof databaseId !== 'string' || !databaseIdPattern.test(databaseId) ||
      databaseId.toLowerCase() === stagingDatabaseId) {
    throw new Error('An independent production D1 UUID is required');
  }
  const values = {
    REPLACE_WITH_VERIFIED_PRODUCTION_WORKER: productionResourceName,
    REPLACE_WITH_VERIFIED_PRODUCTION_ACCOUNT_ID: accountId.toLowerCase(),
    REPLACE_WITH_VERIFIED_PRODUCTION_D1_NAME: productionResourceName,
    REPLACE_WITH_VERIFIED_PRODUCTION_D1_ID: databaseId.toLowerCase()
  };
  let output = template;
  for (const [placeholder, value] of Object.entries(values)) {
    if (output.split(placeholder).length !== 2) throw new Error('Unexpected production Worker template');
    output = output.replace(placeholder, value);
  }
  const closedSettings = [
    /^workers_dev = false\r?$/m, /^preview_urls = false\r?$/m,
    /^RADIO_FEATURES_ENABLED = "false"\r?$/m, /^REGISTRATION_ENABLED = "false"\r?$/m,
    /^ATTENDANCE_OBSERVER_ENABLED = "false"\r?$/m, /^RADIO_DJ_ENABLED = "false"\r?$/m
  ];
  if (/^\s*(?:routes?|triggers)\b/m.test(output) || !closedSettings.every(setting => setting.test(output))) {
    throw new Error('Production preparation requires a private Worker with all features disabled');
  }
  return output.replace('main = "worker.js"', 'main = "../../worker.js"');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const template = await readFile(new URL('../wrangler.toml.example', import.meta.url), 'utf8');
  const contents = renderProductionWorkerConfig(template, process.argv[2], process.argv[3]);
  const root = fileURLToPath(new URL('../.wrangler/', import.meta.url));
  await mkdir(root, { recursive: true });
  const folder = await mkdtemp(join(root, 'production-worker-'));
  const path = join(folder, 'wrangler.toml');
  await writeFile(path, contents, { flag: 'wx' });
  console.log(path);
}
