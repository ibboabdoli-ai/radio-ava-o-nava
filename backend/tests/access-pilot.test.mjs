import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { accessCompletion, accessIssuer, accessPilotOrigin, createAccessVerifier } from '../access-pilot.js';
import { accessAssertion, audience, fakeAccessKeys, pilotFixture, subject } from './access-fixture.mjs';

const stage = accessPilotOrigin;
const auth = '/api/auth/access/';
const seal = response => response.headers.getSetCookie()[0]?.split(';')[0];
const call = (env, path, method = 'GET', extra = {}) => worker.fetch(new Request(stage + path, {
  method, headers: { Origin: stage, ...extra }
}), env);

test('signed user assertion pins issuer and audience, validates time, and caches only provider keys', async () => {
  let calls = 0;
  const verify = createAccessVerifier(async (url, init) => {
    calls++;
    assert.equal(url, accessIssuer + '/cdn-cgi/access/certs');
    assert.equal(init.redirect, 'error');
    return fakeAccessKeys();
  });
  const nowMs = Date.now(), now = Math.floor(nowMs / 1000);
  const good = accessAssertion({}, {}, now);
  const [first, second] = await Promise.all([verify(good, audience, nowMs), verify(good, audience, nowMs)]);
  assert.deepEqual(first, { subject, expiresAtSeconds: now + 3500 });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  for (const input of [
    accessAssertion({ iss: 'https://different.example.test' }),
    accessAssertion({ aud: [audience, 'other'] }),
    accessAssertion({ exp: now - 1 }),
    accessAssertion({ iat: now + 900 }),
    accessAssertion({ exp: now + 10_000 }),
    accessAssertion({ type: 'org' }),
    accessAssertion({ email: null }),
    accessAssertion({ sub: null }),
    accessAssertion({ nbf: now + 900 }),
    accessAssertion({}, { alg: 'none' }),
    accessAssertion({}, { crit: ['unrecognized'] }),
    accessAssertion({}, { kid: 'missing' })
  ]) assert.equal(await verify(input, audience, nowMs), null);
  const [a, b, c] = good.split('.');
  assert.equal(await verify([a, b, (c[0] === 'A' ? 'B' : 'A') + c.slice(1)].join('.'), audience, nowMs), null);
  assert.equal(calls, 1);
  const unavailable = createAccessVerifier(async () => new Response(null, { status: 502 }));
  await assert.rejects(unavailable(good, audience, nowMs), /Access keys unavailable/);
});

test('one browser challenge grants one short session for a linked listener and supports revocation', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, accessIssuer + '/cdn-cgi/access/certs');
    assert.equal(options.redirect, 'error');
    return fakeAccessKeys();
  });
  const env = pilotFixture(), sql = env.DB.sqlite;
  assert.throws(() => sql.prepare('UPDATE staging_access_identities SET user_id=? WHERE subject=?').run(env.userId, subject), /access_identity_is_immutable/);
  assert.equal((await call(env, auth + 'start', 'POST', { Origin: 'https://elsewhere.test' })).status, 403);
  assert.equal((await call(env, accessCompletion, 'GET', { 'Cf-Access-Jwt-Assertion': accessAssertion() })).status, 401);
  const start = await call(env, auth + 'start', 'POST');
  assert.equal(start.status, 200);
  assert.equal((await start.json()).next, accessCompletion);
  assert.match(start.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax; Path=\/api\/auth\/access\/complete; Max-Age=600/);
  const challenge = seal(start);
  assert.doesNotMatch(sql.prepare('SELECT token_hash FROM staging_access_challenges').get().token_hash, new RegExp(challenge.split('=')[1]));
  const headers = { Cookie: challenge, 'Cf-Access-Jwt-Assertion': accessAssertion({ role: 'admin' }) };
  const replies = await Promise.all([call(env, accessCompletion, 'GET', headers), call(env, accessCompletion, 'GET', headers)]);
  assert.deepEqual(replies.map(res => res.status).sort(), [303, 401]);
  const login = replies.find(res => res.status === 303);
  assert.equal(login.headers.get('location'), '/v2/radio-club.html');
  assert.equal(login.headers.get('cache-control'), 'no-store');
  assert.match(login.headers.getSetCookie()[0], /^radio_session=acc_[a-f0-9]{64}; HttpOnly; Secure; SameSite=Lax; Path=\/api; Max-Age=900$/);
  assert.match(login.headers.getSetCookie()[1], /Max-Age=0$/);
  const session = seal(login);
  const me = await call(env, '/api/me', 'GET', { Cookie: session });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.role, 'listener');
  assert.equal((await call(env, '/api/admin/users', 'GET', { Cookie: session })).status, 403);
  const rotated = { ...env, ACCESS_PILOT_AUD: 'b'.repeat(64) };
  assert.equal((await call(rotated, '/api/me', 'GET', { Cookie: session })).status, 401);
  assert.equal((await call({ ...env, ACCESS_PILOT_ENABLED: 'false' }, '/api/me', 'GET', { Cookie: session })).status, 401);
  const logout = await call(env, '/api/auth/logout', 'POST', { Cookie: session });
  assert.equal(logout.status, 200);
  assert.equal((await call(env, '/api/me', 'GET', { Cookie: session })).status, 401);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM staging_access_sessions').get().n, 0);

  for (const [changes, expected] of [[{ sub: 'unlinked' }, 401], [{}, 303]]) {
    const next = await call(env, auth + 'start', 'POST');
    const result = await call(env, accessCompletion, 'GET', { Cookie: seal(next), 'Cf-Access-Jwt-Assertion': accessAssertion(changes) });
    assert.equal(result.status, expected);
    if (expected === 303) {
      sql.prepare('DELETE FROM staging_access_identities WHERE subject=?').run(subject);
      assert.equal((await call(env, '/api/me', 'GET', { Cookie: seal(result) })).status, 401);
    }
  }
  assert.equal(sql.prepare('SELECT count(*) AS n FROM users').get().n, 1);
});

test('pilot is fail-closed and retains the shared auth rate limit', async () => {
  const env = pilotFixture();
  for (const overrides of [
    { ACCESS_PILOT_ENABLED: 'false' }, { ACCESS_PILOT_AUD: '' }, { REGISTRATION_ENABLED: 'true' },
    { ATTENDANCE_OBSERVER_ENABLED: 'true' }
  ]) {
    const config = { ...env, ...overrides };
    assert.deepEqual(await (await call(config, auth + 'status')).json(), { enabled: false });
    assert.equal((await call(config, auth + 'start', 'POST')).status, 503);
  }
  const actualProduction = 'https://radio.ibboabdoli.com';
  const status = await worker.fetch(new Request(actualProduction + auth + 'status'), { ...env, ALLOWED_ORIGIN: actualProduction });
  assert.deepEqual(await status.json(), { enabled: false });
  for (let i = 0; i < 20; i++) assert.equal((await call(env, auth + 'start', 'POST')).status, 200);
  assert.equal((await call(env, auth + 'start', 'POST')).status, 429);
});
