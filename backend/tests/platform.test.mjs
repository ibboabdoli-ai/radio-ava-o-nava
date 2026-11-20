import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { testDatabase } from './helpers.mjs';

const base = 'https://api.example.test';
const site = 'https://radio.ibboabdoli.com';
const make = () => ({ DB: testDatabase(), RADIO_FEATURES_ENABLED: 'true', REGISTRATION_ENABLED: 'true', ALLOWED_ORIGIN: site, AUTH_RATE_SECRET: 'mock-only-secret' });
async function call(env, path, method = 'GET', data, cookie, extra = {}) {
  const headers = { Origin: site, ...extra };
  if (cookie) headers.Cookie = cookie;
  if (data !== undefined) headers['content-type'] = 'application/json';
  const res = await worker.fetch(new Request(base + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) }), env);
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') };
}
async function account(env, username, admin = false) {
  assert.equal((await call(env, '/api/auth/register', 'POST', { username, password: 'long-test-password-123' })).status, 201);
  if (admin) env.DB.sqlite.prepare("UPDATE users SET role='admin' WHERE username=?").run(username);
  const login = await call(env, '/api/auth/login', 'POST', { username, password: 'long-test-password-123' });
  assert.equal(login.status, 200);
  return { user: login.body.user, cookie: login.cookie.split(';')[0] };
}
async function catalog(env, admin, cost = 2) {
  const r = await call(env, '/api/admin/catalog', 'POST', { title: 'Test Track', artist: 'Test Artist', sourceUrl: 'https://audius.co/artist/test', rightsNote: 'Manual permission record for mock testing', cost, rightsConfirmed: true, playableConfirmed: true }, admin.cookie);
  assert.equal(r.status, 201); return r.body.id;
}
const request = (env, user, songId, key = crypto.randomUUID()) => call(env, '/api/requests', 'POST', { catalogSongId: songId }, user.cookie, { 'Idempotency-Key': key });

test('features and registration default disabled, origins and authorization enforced', async () => {
  const env = make(); delete env.RADIO_FEATURES_ENABLED;
  assert.equal((await call(env, '/health')).body.featuresEnabled, false);
  assert.equal((await call(env, '/api/catalog')).status, 503);
  env.RADIO_FEATURES_ENABLED = 'true'; delete env.REGISTRATION_ENABLED;
  assert.equal((await call(env, '/api/auth/register', 'POST', {})).status, 503);
  assert.equal((await call(env, '/api/me')).status, 401);
  const bad = await worker.fetch(new Request(base + '/api/auth/register', { method: 'POST', headers: { Origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }), env);
  assert.equal(bad.status, 403);
  const noOrigin = await worker.fetch(new Request(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env);
  assert.equal(noOrigin.status, 403);
  delete env.AUTH_RATE_SECRET;
  assert.equal((await call(env, '/api/catalog')).status, 503);
});

test('auth, catalog, request idempotency, atomic spending, refund and privacy', async () => {
  const env = make(), admin = await account(env, 'admin1', true), alice = await account(env, 'alice1'), bob = await account(env, 'bob22');
  assert.match(alice.cookie, /^radio_session=/);
  assert.equal((await call(env, '/api/auth/login', 'POST', { username: 'alice1', password: 'wrong-password' })).status, 401);
  assert.equal((await call(env, '/api/admin/users', 'GET', undefined, alice.cookie)).status, 403);
  assert.equal((await call(env, '/api/admin/events', 'GET', undefined, alice.cookie)).status, 403);
  assert.equal((await call(env, '/api/admin/transactions', 'GET', undefined, alice.cookie)).status, 403);
  assert.equal((await call(env, '/api/me/dashboard')).status, 401);
  assert.equal((await call(env, '/api/admin/catalog', 'POST', { title: 'Bad', artist: 'A', sourceUrl: 'https://audius.co/a/b', rightsNote: 'none', cost: 1 }, admin.cookie)).status, 400);
  const song = await catalog(env, admin, 2);
  assert.equal((await call(env, '/api/catalog?q=Test')).body.songs.length, 1);
  const key = crypto.randomUUID(), first = await request(env, alice, song, key);
  assert.equal(first.status, 201);
  assert.equal((await request(env, alice, song, key)).body.duplicate, true);
  assert.equal((await request(env, alice, song)).status, 409);
  assert.equal((await call(env, `/api/admin/requests/${first.body.id}`, 'PATCH', { status: 'approved' }, admin.cookie)).status, 409);
  assert.equal((await call(env, `/api/admin/users/${alice.user.id}/adjust-points`, 'POST', { delta: 2, note: 'Mock test credit' }, admin.cookie)).status, 200);
  const approvals = await Promise.all([call(env, `/api/admin/requests/${first.body.id}`, 'PATCH', { status: 'approved' }, admin.cookie), call(env, `/api/admin/requests/${first.body.id}`, 'PATCH', { status: 'approved' }, admin.cookie)]);
  assert.deepEqual(approvals.map(x => x.status).sort(), [200, 409]);
  assert.equal((await call(env, '/api/me', 'GET', undefined, alice.cookie)).body.user.balance, 0);
  assert.equal((await call(env, '/api/queue')).body.queue.length, 1);
  assert.equal(JSON.stringify((await call(env, '/api/queue')).body).includes('alice1'), false);
  assert.equal((await call(env, '/api/leaderboard')).body.leaders.length, 0);
  const summary = await call(env, '/api/me/dashboard', 'GET', undefined, alice.cookie);
  assert.equal(summary.status, 200);
  assert.deepEqual(summary.body.dashboard, {balance:0,earned:2,spent:2,verifiedSeconds:0,pending:0,approved:1,rank:null});
  assert.equal((await call(env, '/api/me', 'PATCH', { leaderboardOptIn: true }, alice.cookie)).status, 200);
  assert.equal((await call(env, '/api/leaderboard')).body.leaders.length, 1);
  assert.equal((await call(env, '/api/me/dashboard', 'GET', undefined, alice.cookie)).body.dashboard.rank, 1);
  assert.equal((await call(env, `/api/me/requests/${first.body.id}`, 'PATCH', {}, bob.cookie)).status, 409);
  assert.equal((await call(env, `/api/admin/requests/${first.body.id}`, 'PATCH', { status: 'rejected' }, admin.cookie)).status, 200);
  assert.equal((await call(env, '/api/me', 'GET', undefined, alice.cookie)).body.user.balance, 2);
  assert.equal((await call(env, '/api/queue')).body.queue.length, 0);
  const afterRefund = (await call(env, '/api/me/dashboard', 'GET', undefined, alice.cookie)).body.dashboard;
  assert.deepEqual({balance:afterRefund.balance,earned:afterRefund.earned,spent:afterRefund.spent,pending:afterRefund.pending,approved:afterRefund.approved},{balance:2,earned:4,spent:2,pending:0,approved:0});
  assert.ok((await call(env, '/api/admin/events', 'GET', undefined, admin.cookie)).body.events.length>0);
  assert.ok((await call(env, '/api/admin/transactions', 'GET', undefined, admin.cookie)).body.transactions.length>0);
  const kinds = (await call(env, '/api/me/transactions', 'GET', undefined, alice.cookie)).body.transactions.map(x => x.kind);
  assert.deepEqual(kinds.sort(), ['admin_adjustment', 'refund', 'request_spend']);
  assert.equal((await call(env, '/api/auth/logout', 'POST', {}, alice.cookie)).status, 200);
  assert.equal((await call(env, '/api/me', 'GET', undefined, alice.cookie)).status, 401);
});

test('trusted mock observer is disabled by default and deduplicates observations', async () => {
  const env = make(), admin = await account(env, 'admin2', true), alice = await account(env, 'alice2');
  const endpoint = '/api/internal/attendance', observation = { observationId: crypto.randomUUID(), clubhouseUserId: 'stable_123', roomId: 'room_1', state: 'seen' };
  assert.equal((await call(env, endpoint, 'POST', observation)).status, 503);
  env.ATTENDANCE_OBSERVER_ENABLED = 'true'; env.OBSERVER_TOKEN = 'only-for-test';
  assert.equal((await call(env, endpoint, 'POST', observation)).status, 401);
  assert.equal((await call(env, endpoint, 'POST', observation, null, { Authorization: 'Bearer only-for-test' })).status, 404);
  assert.equal((await call(env, `/api/admin/users/${alice.user.id}/clubhouse-identity`, 'PUT', { clubhouseUserId: 'stable_123', consentConfirmed: true }, admin.cookie)).status, 200);
  assert.equal((await call(env, '/api/me/clubhouse-identity', 'GET', undefined, alice.cookie)).body.clubhouseUserId, 'stable_123');
  const send = o => call(env, endpoint, 'POST', o, null, { Authorization: 'Bearer only-for-test' });
  assert.equal((await send(observation)).body.accepted, true);
  assert.equal((await send(observation)).body.duplicate, true);
  assert.equal((await call(env, '/api/me', 'GET', undefined, alice.cookie)).body.user.balance, 0);
  env.DB.sqlite.prepare('UPDATE attendance_state SET last_seen_ms=last_seen_ms-65000 WHERE user_id=?').run(alice.user.id);
  assert.equal((await send({ ...observation, observationId: crypto.randomUUID() })).status, 200);
  assert.equal((await call(env, '/api/me', 'GET', undefined, alice.cookie)).body.user.balance, 1);
  assert.equal((await call(env, '/api/admin/attendance', 'POST', observation, admin.cookie)).status, 410);
  assert.equal((await call(env, '/api/me/clubhouse-identity', 'DELETE', undefined, alice.cookie)).status, 200);
  assert.equal((await send({ ...observation, observationId: crypto.randomUUID() })).status, 404);
});

test('two pending requests cannot spend the same balance twice', async () => {
  const env=make(), admin=await account(env,'admin3',true), user=await account(env,'user33');
  const song1=await catalog(env,admin,2),song2=await catalog(env,admin,2);
  const a=await request(env,user,song1),b=await request(env,user,song2);
  assert.equal(a.status,201);assert.equal(b.status,201);
  assert.equal((await call(env,`/api/admin/users/${user.user.id}/adjust-points`,'POST',{delta:2,note:'Mock credit'},admin.cookie)).status,200);
  const results=await Promise.all([a,b].map(x=>call(env,`/api/admin/requests/${x.body.id}`,'PATCH',{status:'approved'},admin.cookie)));
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  assert.equal((await call(env,'/api/me','GET',undefined,user.cookie)).body.user.balance,0);
  assert.equal((await call(env,'/api/queue')).body.queue.length,1);
  assert.equal((await call(env,'/api/me/requests','GET',undefined,user.cookie)).body.requests.length,2);
});

test('legacy PR #27 pending requests remain moderatable without inventing point costs', async () => {
  const env=make(), admin=await account(env,'admin4',true), id=crypto.randomUUID();
  env.DB.sqlite.prepare("INSERT INTO song_requests(id,title,artist,requested_by,status) VALUES(?,'Old Song','Artist','Legacy Name','pending')").run(id);
  const approved=await call(env,`/api/admin/requests/${id}`,'PATCH',{status:'approved'},admin.cookie);
  assert.equal(approved.status,200); assert.equal(approved.body.legacy,true);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM point_transactions').get().n,0);
  assert.equal((await call(env,`/api/admin/requests/${id}`,'PATCH',{status:'rejected'},admin.cookie)).status,200);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM point_transactions').get().n,0);
});
