import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backend = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(backend, '../v2');
const target = path.resolve(backend, '.wrangler/staging-frontend');
const generatedRoot = path.resolve(backend, '.wrangler');
if (!target.startsWith(`${generatedRoot}${path.sep}`)) throw new Error('Invalid generated asset path.');
const supplied = process.argv[2];
if (!supplied) throw new Error('Pass the HTTPS staging Worker origin as the only argument.');
const url = new URL(supplied);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
  throw new Error('The staging URL must be an HTTPS origin without a path, query, or credentials.');
}
if (!url.hostname.endsWith('.workers.dev')) throw new Error('Use the isolated staging workers.dev origin.');

await rm(target, { recursive: true, force: true });
const site = path.join(target, 'v2');
await mkdir(site, { recursive: true });
await cp(source, site, { recursive: true, filter: src => {
  const relative = path.relative(source, src).replaceAll('\\', '/');
  return relative !== 'tests' && !relative.startsWith('tests/') && relative !== 'CNAME' && relative !== 'install-images.js';
} });
await cp(path.resolve(backend, '../radio-neon-logo.webp'), path.join(target, 'radio-neon-logo.webp'));
const imageSource = path.resolve(backend, '../assets');
const imageTarget = path.join(target, 'assets');
await mkdir(imageTarget);
for (const platform of ['ios', 'android']) {
  for (let step = 1; step <= 4; step++) {
    const filename = `${platform}-install-${step}.jpg`;
    await cp(path.join(imageSource, filename), path.join(imageTarget, filename));
  }
}
await writeFile(path.join(target, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
await writeFile(path.join(target, 'index.html'), '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta http-equiv="refresh" content="0;url=/v2/"><title>رادیو آوا و نوا — staging</title></head><body><a href="/v2/">ورود به نسخهٔ آزمایشی</a></body></html>\n');
for (const name of await readdir(site)) {
  if (!name.endsWith('.html')) continue;
  const file = path.join(site, name);
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace(/<head(\s[^>]*)?>/i, match => `${match}\n<meta name="robots" content="noindex, nofollow">`));
}
const configPath = path.join(site, 'request-config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
config.apiBase = url.origin;
config.clubEnabled = true;
config.features = { requests: false, queue: false, leaderboard: false };
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared isolated staging assets at ${target} for ${url.origin}`);
