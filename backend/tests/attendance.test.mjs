import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { normalizeObservation, processVerifiedObservation } from '../attendance-engine.js';
import { testDatabase } from './helpers.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('presence model rejects unverified data and only credits continuous observations', () => {
  const first = { state: 'seen', roomId: 'room-1', receivedMs: 100_000 };
  assert.throws(() => processVerifiedObservation(null, first), /unverified/);
  const a = processVerifiedObservation(null, first, true);
  assert.equal(a.creditSeconds, 0);
  const b = processVerifiedObservation(a, { ...first, receivedMs: 160_000 }, true);
  assert.equal(b.creditSeconds, 60);
  const c = processVerifiedObservation(b, { ...first, receivedMs: 300_000 }, true);
  assert.equal(c.creditSeconds, 0);
  assert.equal(c.newSession, true);
  const left = processVerifiedObservation(c, { ...first, state: 'left', receivedMs: 350_000 }, true);
  assert.equal(left.creditSeconds, 0);
  assert.equal(processVerifiedObservation(left, { ...first, receivedMs: 351_000 }, true).creditSeconds, 0);
  const moved = processVerifiedObservation(b, { ...first, roomId: 'room-2', receivedMs: 170_000 }, true);
  assert.equal(moved.creditSeconds, 0);
  assert.equal(moved.newSession, true);
  assert.equal(normalizeObservation({ observationId: randomUUID(), clubhouseUserId: '123', roomId: 'room-1', state: 'seen' })?.state, 'seen');
});

test('migration applies to PR #27 schema without importing legacy scores', () => {
  const db = testDatabase();
  const tables = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const name of ['users', 'attendance_observations', 'attendance_sessions', 'point_transactions', 'song_catalog']) {
    assert.ok(tables.includes(name), name);
  }
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM point_transactions').get().n, 0);
  db.sqlite.close();
});

test('migration preserves PR #27 requests but excludes unverified legacy scores', () => {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['schema.sql', 'attendance.sql']) sql.exec(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  sql.prepare("INSERT INTO song_requests(id,title,artist,requested_by,status) VALUES('legacy-request','Old Song','Artist','Private Name','approved')").run();
  sql.prepare("INSERT INTO listener_scores(clubhouse_user_id,display_name,total_seconds,first_seen_ms,last_seen_ms,last_room_id) VALUES('legacy-user','Private Name',600,1,601000,'old-room')").run();
  sql.exec(readFileSync(new URL('../migrations/0002_radio_platform.sql', import.meta.url), 'utf8'));
  const request = sql.prepare("SELECT title,status,user_id,cost FROM song_requests WHERE id='legacy-request'").get();
  assert.equal(request.title, 'Old Song'); assert.equal(request.status, 'approved');
  assert.equal(request.user_id, null); assert.equal(request.cost, 0);
  sql.prepare("UPDATE song_requests SET status='rejected' WHERE id='legacy-request'").run();
  assert.equal(sql.prepare("SELECT status FROM song_requests WHERE id='legacy-request'").get().status, 'rejected');
  assert.equal(sql.prepare('SELECT count(*) AS n FROM point_transactions').get().n, 0);
  sql.close();
});

test('D1 attendance trigger awards complete minutes once, across sessions and concurrent users', () => {
  const db = testDatabase();
  const sql = db.sqlite;
  for (const [id, clubhouseId] of [['u1', 'ch1'], ['u2', 'ch2']]) {
    sql.prepare('INSERT INTO users(id,username,password_salt,password_hash,created_at_ms) VALUES(?,?,?,?,0)').run(id,id,'salt','hash');
    sql.prepare('INSERT INTO listener_identities(clubhouse_user_id,user_id,consent_at_ms,mapped_by_user_id) VALUES(?,?,0,?)').run(clubhouseId,id,id);
  }
  const observe = (id, user, clubhouseId, room, state, ms) => sql.prepare(
    "INSERT OR IGNORE INTO attendance_observations(observation_id,user_id,clubhouse_user_id,room_id,state,received_ms,source_kind) VALUES(?,?,?,?,?,?,'trusted_presence')"
  ).run(id,user,clubhouseId,room,state,ms);
  const id1 = randomUUID();
  assert.equal(observe(id1,'u1','ch1','room1','seen',100_000).changes, 1);
  assert.equal(observe(id1,'u1','ch1','room1','seen',100_000).changes, 0);
  observe(randomUUID(),'u2','ch2','room1','seen',100_000);
  observe(randomUUID(),'u1','ch1','room1','seen',160_000);
  observe(randomUUID(),'u2','ch2','room1','seen',145_000);
  observe(randomUUID(),'u1','ch1','room1','left',200_000);
  observe(randomUUID(),'u1','ch1','room1','seen',300_000);
  observe(randomUUID(),'u1','ch1','room1','seen',360_000);
  const scores = sql.prepare("SELECT user_id,total_seconds,awarded_points FROM attendance_state ORDER BY user_id").all().map(row => ({ ...row }));
  assert.deepEqual(scores, [
    { user_id: 'u1', total_seconds: 120, awarded_points: 2 },
    { user_id: 'u2', total_seconds: 45, awarded_points: 0 }
  ]);
  assert.equal(sql.prepare("SELECT sum(delta) AS points FROM point_transactions WHERE user_id='u1'").get().points, 2);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM attendance_sessions WHERE user_id='u1'").get().n, 2);
  sql.close();
});

test('fractional intervals add to one minute and stale observations cannot roll state backward', () => {
  const db = testDatabase(), sql = db.sqlite;
  sql.prepare('INSERT INTO users(id,username,password_salt,password_hash,created_at_ms) VALUES(?,?,?,?,0)').run('u3','u3','s','h');
  const observe = (ms, state = 'seen', id = randomUUID()) => sql.prepare("INSERT OR IGNORE INTO attendance_observations(observation_id,user_id,clubhouse_user_id,room_id,state,received_ms,source_kind) VALUES(?,'u3','ch3','room1',?,?,'trusted_presence')").run(id,state,ms);
  observe(100_000);
  for (let i = 1; i <= 60; i++) observe(100_000 + i * 1001);
  assert.equal(sql.prepare("SELECT total_millis FROM attendance_state WHERE user_id='u3'").get().total_millis, 60_060);
  assert.equal(sql.prepare("SELECT awarded_points FROM attendance_state WHERE user_id='u3'").get().awarded_points, 1);
  assert.equal(observe(100_001).changes, 0);
  assert.equal(sql.prepare("SELECT last_seen_ms FROM attendance_state WHERE user_id='u3'").get().last_seen_ms, 160_060);
  observe(160_060, 'left');
  observe(160_061);
  assert.equal(sql.prepare("SELECT awarded_points FROM attendance_state WHERE user_id='u3'").get().awarded_points, 1);
  sql.close();
});
