import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import worker from '../../backend/worker.js';
import { accessCompletion, accessIssuer, accessPilotOrigin } from '../../backend/access-pilot.js';
import { accessAssertion, fakeAccessKeys, pilotFixture } from '../../backend/tests/access-fixture.mjs';

const stage = accessPilotOrigin, pagePath = '/v2/radio-club.html';
const providerPath = '/offline-identity';
const files = new URL('../', import.meta.url);
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' };
const offlineNavigate = url => '<!doctype html><script>location.replace(' + JSON.stringify(url) + ')</script>';
const env = pilotFixture();
let visitedProvider = 0, keysRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  assert.equal(url, accessIssuer + '/cdn-cgi/access/certs');
  keysRequests++;
  return fakeAccessKeys();
};
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 900 } });
  await context.route('**/*', async route => {
    const source = route.request(), url = new URL(source.url());
    if (url.origin === accessIssuer && url.pathname === providerPath) {
      visitedProvider++;
      return route.fulfill({ status: 200, contentType: 'text/html', body: offlineNavigate(stage + accessCompletion) });
    }
    if (url.origin !== stage) return route.abort();
    if (url.pathname === accessCompletion && visitedProvider === 0) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: offlineNavigate(accessIssuer + providerPath) });
    }
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      const headers = await source.allHeaders();
      if (url.pathname === accessCompletion) headers['cf-access-jwt-assertion'] = accessAssertion();
      const reply = await worker.fetch(new Request(url, {
        method: source.method(), headers, body: source.postData() ?? undefined
      }), env);
      const responseHeaders = Object.fromEntries(reply.headers);
      const cookies = reply.headers.getSetCookie();
      if (cookies.length) responseHeaders['set-cookie'] = cookies.join('\n');
      if (url.pathname === accessCompletion && reply.status === 303) {
        assert.equal(responseHeaders.location, pagePath);
        delete responseHeaders.location;
        return route.fulfill({ status: 200, headers: responseHeaders, contentType: 'text/html', body: offlineNavigate(pagePath) });
      }
      return route.fulfill({ status: reply.status, headers: responseHeaders, body: Buffer.from(await reply.arrayBuffer()) });
    }
    if (url.pathname === '/v2/request-config.json') {
      return route.fulfill({ status: 200, json: { apiBase: stage, clubEnabled: true } });
    }
    if (!url.pathname.startsWith('/v2/')) return route.fulfill({ status: 404 });
    const path = url.pathname.slice(4);
    const asset = new URL(path, files);
    if (!asset.href.startsWith(files.href)) return route.fulfill({ status: 404 });
    const body = await readFile(asset).catch(() => null);
    if (!body) return route.fulfill({ status: 404 });
    return route.fulfill({ status: 200, body, contentType: types[path.split('.').at(-1)] ?? 'application/octet-stream' });
  });
  const page = await context.newPage();
  await page.goto(stage + pagePath);
  await page.locator('#access-pilot-login').click();
  await page.locator('#dashboard').waitFor({ state: 'visible' });
  assert.equal(visitedProvider, 1);
  assert.equal(keysRequests, 1);
  assert.equal(await page.locator('#admin').isVisible(), false);
  const current = (await context.cookies(stage + accessCompletion)).find(cookie => cookie.name === 'radio_session');
  assert.ok(current?.httpOnly && current.secure && current.sameSite === 'Lax');
  assert.match(current.value, /^acc_[a-f0-9]{64}$/);
  assert.ok(!(await context.cookies(stage + accessCompletion)).some(cookie => cookie.name.endsWith('radio_access_challenge')));
  await page.locator('#logout').click();
  await page.locator('#auth').waitFor({ state: 'visible' });
  assert.ok(!(await context.cookies(stage + '/api/me')).some(cookie => cookie.name === 'radio_session'));
  env.ACCESS_PILOT_ENABLED = 'false';
  const closed = page.waitForResponse(response => response.url() === stage + '/api/auth/access/status');
  await page.reload();
  assert.deepEqual(await (await closed).json(), { enabled: false });
  await page.locator('#auth').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#access-pilot-login').isVisible(), false);
  assert.equal(await page.locator('#auth-form [value=register]').isVisible(), false);
  console.log('PASS offline Chrome Access redirect, bounded session, role denial, logout and disabled pilot');
  await context.close();
} finally {
  globalThis.fetch = originalFetch;
  await browser.close();
  env.DB.sqlite.close();
}
