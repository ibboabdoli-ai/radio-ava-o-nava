import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { productionRadioApiOrigin, productionRadioOrigin, radioApiOrigin } from '../../v2/radio-api-origin.js';

export async function verifyProductionClubApi(value, request = fetch) {
  const selected = radioApiOrigin(value, productionRadioOrigin);
  const api = selected === productionRadioOrigin ? productionRadioOrigin : productionRadioApiOrigin;
  const options = {
    headers: { Origin: productionRadioOrigin },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000)
  };
  const [health, account, dj] = await Promise.all([
    request(api + '/health', options), request(api + '/api/me', options), request(api + '/api/dj/status', options)
  ]);
  const sameOriginPolicy = response => response.headers.get('access-control-allow-origin') === productionRadioOrigin
    && response.headers.get('access-control-allow-credentials') === 'true';
  if (health.status !== 200 || account.status !== 401 || dj.status !== 200 || ![health, account, dj].every(sameOriginPolicy)) {
    throw new Error('Production API health, credentialed CORS or anonymous-session check failed');
  }
  const current = await health.json();
  const player = await dj.json();
  if (current.configured !== true || current.featuresEnabled !== true || current.registrationEnabled !== false ||
      current.attendanceObserverEnabled !== false || player.enabled !== true) {
    throw new Error('Production feature flags are not ready');
  }
  return api;
}

export function productionClubAssets(api, html) {
  const origin = radioApiOrigin(api, productionRadioOrigin);
  const policy = `default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${origin}`;
  const anchor = '<meta charset="utf-8">';
  if (!html.includes(anchor)) throw new Error('Radio club page head could not be located');
  return {
    'request-config.json': JSON.stringify({
      apiBase: origin, clubEnabled: true, features: { requests: false, queue: false, leaderboard: false }
    }, null, 2) + '\n',
    'radio-club.html': html.replace(anchor, `${anchor}\n<meta http-equiv="Content-Security-Policy" content="${policy}">`)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const api = await verifyProductionClubApi(process.argv[2]);
  const dir = fileURLToPath(new URL('../.wrangler/', import.meta.url));
  const html = await readFile(new URL('../../v2/radio-club.html', import.meta.url), 'utf8');
  await mkdir(dir, { recursive: true });
  const output = await mkdtemp(join(dir, 'production-club-'));
  await Promise.all(Object.entries(productionClubAssets(api, html))
    .map(([name, body]) => writeFile(join(output, name), body, { flag: 'wx' })));
  console.log('Prepared production club overlays at ' + output);
}
