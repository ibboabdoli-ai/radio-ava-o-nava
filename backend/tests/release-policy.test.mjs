import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker.js';
import { testDatabase } from './helpers.mjs';
import { productionRadioOrigin, radioApiOrigin } from '../../v2/radio-api-origin.js';
import { productionClubAssets, verifyProductionClubApi } from '../scripts/prepare-production-club.mjs';
import { renderProductionWorkerConfig } from '../scripts/prepare-production-worker.mjs';

const productionApi = 'https://api.radio.ibboabdoli.com';
const staging = 'https://ava-radio-staging.ibbo-abdoli.workers.dev';
const environment = (origin = staging) => ({
  DB: testDatabase(), ALLOWED_ORIGIN: origin, RADIO_FEATURES_ENABLED: 'true',
  REGISTRATION_ENABLED: 'true', ATTENDANCE_OBSERVER_ENABLED: 'true', OBSERVER_TOKEN: 'only-test', AUTH_RATE_SECRET: 'local-test-only'
});

test('production Worker preparation requires a separate D1 and a closed configuration', async () => {
  const template = await readFile(new URL('../wrangler.toml.example', import.meta.url), 'utf8');
  const accountId = '1'.repeat(32), independent = '34266595-3d88-4e6a-a793-04250d92533f';
  assert.throws(() => renderProductionWorkerConfig(template, accountId, 'ABE077D0-B360-4BEB-864A-0E3AB354CFD0'), /independent/);
  assert.throws(() => renderProductionWorkerConfig(template, accountId, ''), /independent/);
  assert.throws(() => renderProductionWorkerConfig(template, 'invalid', independent), /account ID/);
  assert.throws(() => renderProductionWorkerConfig(template.replace('workers_dev = false', 'workers_dev = true'), accountId, independent), /private/);
  assert.throws(() => renderProductionWorkerConfig(template.replace('workers_dev = false', ''), accountId, independent), /private/);
  assert.throws(() => renderProductionWorkerConfig(template.replace('RADIO_DJ_ENABLED = "false"', 'RADIO_DJ_ENABLED = "true"'), accountId, independent), /private/);
  const config = renderProductionWorkerConfig(template, accountId, independent);
  assert.match(config, /^name = "ava-radio-production"$/m);
  assert.match(config, /^database_name = "ava-radio-production"$/m);
  assert.ok(config.includes(independent));
  assert.doesNotMatch(config, /"ava-radio-staging"|REPLACE_WITH/);
});

test('the production club accepts same-site HTTPS and refuses the staging API', async () => {
  assert.equal(radioApiOrigin(productionApi, productionRadioOrigin), productionApi);
  assert.equal(radioApiOrigin(staging, staging), staging);
  for (const url of [staging, 'http://api.radio.ibboabdoli.com', productionApi + ':8080', productionApi + '/api', 'https://api.radio.ibboabdoli.com.example.test', 'https://other.radio.ibboabdoli.com']) {
    assert.throws(() => radioApiOrigin(url, productionRadioOrigin), TypeError);
  }
  let invoked = false;
  await assert.rejects(verifyProductionClubApi(staging, () => { invoked = true; }), TypeError);
  assert.equal(invoked, false);
});

test('production overlays require the active API, anonymous-session gate and closed features', async () => {
  const headers = { 'access-control-allow-origin': productionRadioOrigin, 'access-control-allow-credentials': 'true' };
  const health = { configured: true, featuresEnabled: true, registrationEnabled: false, attendanceObserverEnabled: false };
  const verify = (overrides = {}, accountStatus = 401) => verifyProductionClubApi(productionApi, async (url, options) => {
    assert.equal(options.headers.Origin, productionRadioOrigin);
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/health')) return Response.json({ ...health, ...overrides }, { headers });
    return Response.json({ enabled: true }, { headers, status: url.endsWith('/api/me') ? accountStatus : 200 });
  });
  assert.equal(await verify(), productionApi);
  await assert.rejects(verify({ registrationEnabled: true }), /feature flags/);
  await assert.rejects(verify({}, 200), /anonymous-session/);
  const out = productionClubAssets(productionApi, '<head><meta charset="utf-8"></head>');
  assert.equal(JSON.parse(out['request-config.json']).apiBase, productionApi);
  assert.match(out['radio-club.html'], /connect-src 'self' https:\/\/api\.radio\.ibboabdoli\.com/);
  assert.doesNotMatch(out['radio-club.html'], /workers\.dev/);
});

test('production signup and attendance stay disabled despite permissive environment flags', async () => {
  const env = environment(productionRadioOrigin);
  const call = async (path, method = 'GET') => worker.fetch(new Request(productionApi + path, {
    method, headers: { Origin: productionRadioOrigin, 'content-type': 'application/json' },
    body: method === 'POST' ? '{}' : undefined
  }), env);
  const health = await (await call('/health')).json();
  assert.equal(health.registrationEnabled, false);
  assert.equal(health.attendanceObserverEnabled, false);
  for (const [path, error] of [
    ['/api/auth/register', 'registration_disabled'], ['/api/internal/attendance', 'observer_disabled']
  ]) {
    const reply = await call(path, 'POST');
    assert.equal(reply.status, 503);
    assert.equal((await reply.json()).error, error);
  }
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('a production pairing uses its own code format and rejects staging codes', async () => {
  const env = { ...environment(productionRadioOrigin), RADIO_DJ_ENABLED: 'true' };
  const userId = crypto.randomUUID(), session = '9'.repeat(64), now = Date.now();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session));
  env.DB.sqlite.prepare('INSERT INTO users(id,username,password_salt,password_hash,role,created_at_ms) VALUES(?,?,?,?,?,?)')
    .run(userId, 'qa_admin', 'fictional-salt', 'fixture-hash', 'admin', now);
  env.DB.sqlite.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at_ms,created_at_ms) VALUES(?,?,?,?)')
    .run(Buffer.from(digest).toString('hex'), userId, now + 60000, now);
  const pair = await worker.fetch(new Request(productionApi + '/api/admin/dj/pair', {
    method: 'POST', headers: { Origin: productionRadioOrigin, Cookie: 'radio_session=' + session, 'content-type': 'application/json' }, body: '{}'
  }), env);
  assert.equal(pair.status, 201);
  const { token } = await pair.json();
  assert.match(token, /^prod_[a-f0-9]{64}$/);
  const next = (code) => worker.fetch(new Request(productionApi + '/api/dj/next', { headers: { Authorization: 'Bearer ' + code } }), env);
  assert.equal((await next(token.slice(5))).status, 401);
  assert.equal((await next(token)).status, 200);
});

test('JSON intake rejects a chunked body over the byte budget without its Content-Length', async () => {
  const env = environment();
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(4096));
      controller.enqueue(new Uint8Array(4097));
    },
    cancel() { cancelled = true; }
  });
  const reply = await worker.fetch(new Request(staging + '/api/auth/login', {
    method: 'POST', headers: { Origin: staging, 'content-type': 'application/json' }, body, duplex: 'half'
  }), env);
  assert.equal(reply.status, 413);
  assert.equal((await reply.json()).error, 'too_large');
  assert.equal(cancelled, true);
});
