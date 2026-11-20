import { generateKeyPairSync, sign } from 'node:crypto';
import { accessIssuer, accessPilotOrigin } from '../access-pilot.js';
import { testDatabase } from './helpers.mjs';

export const audience = 'a'.repeat(64);
export const subject = 'fictional-provider-subject';
const kid = 'offline-fixture';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' };
const b64 = data => Buffer.from(JSON.stringify(data)).toString('base64url');

export function accessAssertion(changes = {}, head = {}, now = Math.floor(Date.now() / 1000)) {
  const message = b64({ alg: 'RS256', kid, ...head }) + '.' + b64({
    iss: accessIssuer, aud: [audience], sub: subject, type: 'app', email: 'synthetic@example.test',
    iat: now - 15, exp: now + 3500, ...changes
  });
  return message + '.' + sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url');
}
export function fakeAccessKeys() {
  return Response.json({ keys: [jwk] });
}
export function pilotFixture() {
  const DB = testDatabase(), userId = crypto.randomUUID();
  DB.sqlite.prepare('INSERT INTO users(id,username,password_hash,password_salt,role,created_at_ms) VALUES(?,?,?,?,?,?)')
    .run(userId, 'offline_pilot_listener', 'fixture-hash', 'fixture-salt', 'listener', Date.now());
  DB.sqlite.prepare('INSERT INTO staging_access_identities(subject,user_id) VALUES(?,?)').run(subject, userId);
  return {
    DB, userId, ALLOWED_ORIGIN: accessPilotOrigin, RADIO_FEATURES_ENABLED: 'true', REGISTRATION_ENABLED: 'false',
    ATTENDANCE_OBSERVER_ENABLED: 'false', ACCESS_PILOT_ENABLED: 'true', ACCESS_PILOT_AUD: audience,
    AUTH_RATE_SECRET: 'synthetic-offline-secret'
  };
}
