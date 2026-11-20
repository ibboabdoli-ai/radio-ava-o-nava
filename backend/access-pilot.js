export const accessPilotOrigin = 'https://ava-radio-staging.ibbo-abdoli.workers.dev';
export const accessIssuer = 'https://lingering-waterfall-4739.cloudflareaccess.com';
export const accessCompletion = '/api/auth/access/complete';
const challengeCookieName = '__Secure-radio_access_challenge';
const challengeLifetime = 600;
const maxSession = 900;
const keyCacheTime = 5 * 60_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const textPart = /^[A-Za-z0-9_-]+$/;
const audiencePattern = /^[a-f0-9]{64}$/;
export const accessSessionPrefix = 'acc_';

export function accessPilotEnabled(env) {
  return env.RADIO_FEATURES_ENABLED === 'true' && env.ACCESS_PILOT_ENABLED === 'true' &&
    env.REGISTRATION_ENABLED !== 'true' && env.ATTENDANCE_OBSERVER_ENABLED !== 'true' &&
    env.ALLOWED_ORIGIN === accessPilotOrigin && typeof env.ACCESS_PILOT_AUD === 'string' &&
    audiencePattern.test(env.ACCESS_PILOT_AUD);
}

const decode = part => Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), ch => ch.charCodeAt(0));
const parse = part => JSON.parse(decoder.decode(decode(part)));
const allowedKid = value => typeof value === 'string' && value.length <= 128 && textPart.test(value);
const numericDate = value => Number.isSafeInteger(value) && value > 0;
const challengeCookie = (value, seconds) =>
  `${challengeCookieName}=${value}; HttpOnly; Secure; SameSite=Lax; Path=${accessCompletion}; Max-Age=${seconds}`;
const challengeFrom = req => req.headers.get('Cookie')?.match(/(?:^|;\s*)__Secure-radio_access_challenge=([a-f0-9]{64})(?:;|$)/)?.[1];

export function createAccessVerifier(request = (...args) => fetch(...args)) {
  let keyCache;
  let loading;
  async function readKeys(now) {
    if (keyCache?.expiresAt > now) return keyCache.keys;
    if (loading) return await loading;
    loading = (async () => {
      const response = await request(accessIssuer + '/cdn-cgi/access/certs', { redirect: 'error', signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('Access keys unavailable');
      const { keys } = await response.json();
      if (!Array.isArray(keys) || keys.length < 1 || keys.length > 10) throw new Error('Invalid Access keys');
      const imported = new Map();
      for (const key of keys) {
        if (key?.kty !== 'RSA' || key.alg !== 'RS256' || !allowedKid(key.kid) || key.e !== 'AQAB' ||
            typeof key.n !== 'string' || key.n.length > 700 || !textPart.test(key.n) || imported.has(key.kid)) {
          throw new Error('Invalid Access signing key');
        }
        const publicKey = await crypto.subtle.importKey('jwk',
          { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256' },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        if (publicKey.algorithm.modulusLength < 2048) throw new Error('Invalid Access signing key size');
        imported.set(key.kid, publicKey);
      }
      keyCache = { expiresAt: now + keyCacheTime, keys: imported };
      return imported;
    })();
    try {
      return await loading;
    } finally {
      loading = undefined;
    }
  }

  return async (assertion, expectedAudience, nowMilliseconds) => {
    if (typeof assertion !== 'string' || assertion.length > 8192) return null;
    const bits = assertion.split('.');
    if (bits.length !== 3 || !bits.every(part => textPart.test(part))) return null;
    const now = Math.floor(nowMilliseconds / 1000);
    let meta, claims, sig;
    try {
      meta = parse(bits[0]); claims = parse(bits[1]); sig = decode(bits[2]);
    } catch {
      return null;
    }
    if (meta?.alg !== 'RS256' || meta.crit !== undefined || !allowedKid(meta.kid) ||
        claims?.iss !== accessIssuer || claims.type !== 'app' ||
        !Array.isArray(claims.aud) || claims.aud.length !== 1 || claims.aud[0] !== expectedAudience ||
        typeof claims.sub !== 'string' || claims.sub.length > 128 || !textPart.test(claims.sub) ||
        typeof claims.email !== 'string' || claims.email.length > 254 || !claims.email.includes('@') ||
        !numericDate(claims.exp) || claims.exp <= now || !numericDate(claims.iat) ||
        claims.iat > now + 30 || claims.exp <= claims.iat || claims.exp - claims.iat > 3630 ||
        (claims.nbf !== undefined && (!numericDate(claims.nbf) || claims.nbf > now + 30))) return null;
    const key = (await readKeys(nowMilliseconds)).get(meta.kid);
    if (!key || !await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, encoder.encode(bits[0] + '.' + bits[1]))) return null;
    return { subject: claims.sub, expiresAtSeconds: claims.exp };
  };
}

const verify = createAccessVerifier();

export function accessSessionQuery(first, db, tokenHash, env, now) {
  return first(db, `SELECT u.id,u.username,u.role,u.leaderboard_opt_in
    FROM staging_access_sessions s JOIN staging_access_identities i ON i.subject=s.subject
    JOIN users u ON u.id=i.user_id
    WHERE s.token_hash=? AND s.audience=? AND s.expires_at_ms>?`, tokenHash, env.ACCESS_PILOT_AUD, now);
}

export async function accessPilotRoute({ req, env, headers, j, rate, first, run, token, hash, cookie }) {
  const url = new URL(req.url);
  const enabled = accessPilotEnabled(env) && url.origin === accessPilotOrigin;
  const reply = (data, status = 200, extra = {}) => j(data, status, { ...headers, ...extra });
  if (url.pathname === '/api/auth/access/status' && req.method === 'GET') return reply({ enabled });
  if (!enabled) return reply({ error: 'access_pilot_disabled' }, 503);
  if (url.pathname === '/api/auth/access/start' && req.method === 'POST') {
    if (!await rate(req, env.DB, env)) return reply({ error: 'rate_limited' }, 429);
    const value = token(), now = Date.now();
    await run(env.DB, 'INSERT INTO staging_access_challenges(token_hash,expires_at_ms) VALUES(?,?)', await hash(value), now + challengeLifetime * 1000);
    return reply({ next: accessCompletion }, 200, { 'set-cookie': challengeCookie(value, challengeLifetime) });
  }
  if (url.pathname !== accessCompletion || req.method !== 'GET') return reply({ error: 'not_found' }, 404);
  const challenge = challengeFrom(req);
  const assertion = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!challenge || !assertion) return reply({ error: 'invalid_access_login' }, 401);
  if (!await rate(req, env.DB, env)) return reply({ error: 'rate_limited' }, 429);
  const now = Date.now();
  const pending = await first(env.DB, 'DELETE FROM staging_access_challenges WHERE token_hash=? AND expires_at_ms>? RETURNING token_hash',
    await hash(challenge), now);
  if (!pending) return reply({ error: 'invalid_access_login' }, 401);
  let identity;
  try {
    identity = await verify(assertion, env.ACCESS_PILOT_AUD, now);
  } catch {
    return reply({ error: 'access_provider_unavailable' }, 503);
  }
  if (!identity) return reply({ error: 'invalid_access_login' }, 401);
  const sessionDuration = Math.min(maxSession, identity.expiresAtSeconds - Math.ceil(Date.now() / 1000));
  if (sessionDuration < 1) return reply({ error: 'invalid_access_login' }, 401);
  const value = accessSessionPrefix + token();
  const inserted = await first(env.DB, `INSERT INTO staging_access_sessions(token_hash,subject,audience,expires_at_ms)
    SELECT ?,subject,?,? FROM staging_access_identities WHERE subject=? RETURNING subject`,
  await hash(value), env.ACCESS_PILOT_AUD, Date.now() + sessionDuration * 1000, identity.subject);
  if (!inserted) return reply({ error: 'invalid_access_login' }, 401);
  const responseHeaders = new Headers({ ...headers, 'cache-control': 'no-store', location: '/v2/radio-club.html', 'referrer-policy': 'no-referrer' });
  responseHeaders.append('set-cookie', cookie(value, sessionDuration));
  responseHeaders.append('set-cookie', challengeCookie('', 0));
  return new Response(null, { status: 303, headers: responseHeaders });
}
