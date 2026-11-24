const googleIssuer = 'https://accounts.google.com';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const jwksEndpoint = 'https://www.googleapis.com/oauth2/v3/certs';
const encoder = new TextEncoder();
const flowCookie = '__Host-ava_google_flow';
const sessionCookie = '__Host-ava_library_session';
const maxSessionAge = 30 * 24 * 60 * 60;
const tokenPattern = /^[a-f0-9]{64}$/;

export function googleEnabled(env) {
  return Boolean(env.LIBRARY_GOOGLE_CLIENT_ID && env.LIBRARY_GOOGLE_CLIENT_SECRET);
}

const randomValue = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bytes = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
const decode = value => JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes(value)));
const cookie = (name, value, age) => name + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + age;
const cookieValue = (request, name) => request.headers.get('Cookie')?.split(/;\s*/).find(item => item.startsWith(name + '='))?.slice(name.length + 1);
const callbackUri = origin => origin + '/api/library/auth/google/callback';
const accountPage = '/v2/music-library/account.html';
const clearFlow = () => cookie(flowCookie, '', 0);

function redirect(url, cookies = []) {
  const headers = new Headers({'Location': url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'});
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, {status: 303, headers});
}

function callbackTarget(request, status = '') {
  const target = new URL(accountPage, request.url);
  const song = new URL(request.url).searchParams.get('song');
  if (/^[a-f0-9-]{32,36}$/i.test(song ?? '')) target.searchParams.set('song', song);
  if (status) target.searchParams.set('signin', status);
  return target;
}

export async function verifyGoogleToken(idToken, audience, nonce, fetcher = fetch) {
  if (typeof idToken !== 'string' || idToken.length > 8192) throw new Error('token_invalid');
  const parts = idToken.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('token_invalid');
  const [header, claims] = parts.slice(0, 2).map(decode);
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      !['accounts.google.com', googleIssuer].includes(claims.iss) || claims.aud !== audience ||
      (claims.azp !== undefined && claims.azp !== audience) || claims.nonce !== nonce ||
      typeof claims.sub !== 'string' || !/^[A-Za-z0-9_.-]{1,255}$/.test(claims.sub) ||
      !Number.isInteger(claims.exp) || claims.exp <= now ||
      !Number.isInteger(claims.iat) || claims.iat > now + 60 || claims.iat > claims.exp) throw new Error('token_invalid');

  const response = await fetcher(jwksEndpoint, {redirect:'error', signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('google_unavailable');
  const {keys} = await response.json();
  const jwk = keys?.find(item => item.kid === header.kid && item.kty === 'RSA' && item.alg === 'RS256' && item.use === 'sig');
  if (!jwk) throw new Error('token_invalid');
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), encoder.encode(parts.slice(0, 2).join('.')));
  if (!valid) throw new Error('token_invalid');
  return claims;
}

function pictureUrl(value) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.hostname.endsWith('.googleusercontent.com') ? url.href : null;
  } catch { return null; }
}

export async function startGoogle(request, env) {
  if (!googleEnabled(env)) return redirect(callbackTarget(request, 'unavailable'));
  const state = randomValue();
  const nonce = randomValue();
  const verifier = randomValue();
  const song = callbackTarget(request).searchParams.get('song') || '';
  const redirectTo = new URL('/o/oauth2/v2/auth', googleIssuer);
  redirectTo.search = new URLSearchParams({
    client_id:env.LIBRARY_GOOGLE_CLIENT_ID, redirect_uri:callbackUri(new URL(request.url).origin),
    scope:'openid profile', response_type:'code', state, nonce,
    code_challenge:base64url(await digest(verifier)), code_challenge_method:'S256',
  });
  return redirect(redirectTo, [cookie(flowCookie, [state, nonce, verifier, song].join('.'), 600)]);
}

export async function finishGoogle(request, env, db, fetcher = fetch) {
  const url = new URL(request.url);
  const [state, nonce, verifier, song] = (cookieValue(request, flowCookie) || '').split('.');
  const target = new URL(accountPage, url);
  if (/^[a-f0-9-]{32,36}$/i.test(song ?? '')) target.searchParams.set('song', song);
  try {
    const code = url.searchParams.get('code');
    if (!googleEnabled(env) || ![state,nonce,verifier].every(value => tokenPattern.test(value)) ||
        state !== url.searchParams.get('state') || url.searchParams.has('error') || !code || code.length > 1024) throw new Error('flow_invalid');
    const response = await fetcher(tokenEndpoint, {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(8000),
      body:new URLSearchParams({code,client_id:env.LIBRARY_GOOGLE_CLIENT_ID,client_secret:env.LIBRARY_GOOGLE_CLIENT_SECRET,
        redirect_uri:callbackUri(url.origin),code_verifier:verifier,grant_type:'authorization_code'}),
    });
    if (!response.ok) throw new Error('exchange_failed');
    const claims = await verifyGoogleToken((await response.json()).id_token, env.LIBRARY_GOOGLE_CLIENT_ID, nonce, fetcher);
    const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 120) : 'شنونده';
    const session = randomValue();
    const now = Date.now();
    await db.batch([
      db.prepare('INSERT INTO library_accounts(id,google_subject,display_name,picture_url) VALUES(?,?,?,?) ON CONFLICT(google_subject) DO UPDATE SET display_name=excluded.display_name,picture_url=excluded.picture_url')
        .bind(crypto.randomUUID(), claims.sub, name, pictureUrl(claims.picture)),
      db.prepare('INSERT INTO library_account_sessions(token_hash,account_id,expires_at) SELECT ?,id,? FROM library_accounts WHERE google_subject=?')
        .bind(base64url(await digest(session)), now + maxSessionAge * 1000, claims.sub),
      db.prepare('DELETE FROM library_account_sessions WHERE expires_at<=?').bind(now),
    ]);
    return redirect(target, [clearFlow(), cookie(sessionCookie, session, maxSessionAge)]);
  } catch {
    target.searchParams.set('signin', 'failed');
    return redirect(target, [clearFlow()]);
  }
}

export async function googleSession(request, db) {
  const token = cookieValue(request, sessionCookie);
  if (!tokenPattern.test(token)) return null;
  return db.prepare('SELECT a.id,a.display_name,a.picture_url FROM library_accounts a JOIN library_account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?')
    .bind(base64url(await digest(token)), Date.now()).first();
}

export async function clearGoogleSession(request, db) {
  const token = cookieValue(request, sessionCookie);
  if (tokenPattern.test(token)) await db.prepare('DELETE FROM library_account_sessions WHERE token_hash=?').bind(base64url(await digest(token))).run();
  return cookie(sessionCookie, '', 0);
}
