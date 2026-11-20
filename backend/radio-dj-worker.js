import { productionRadioOrigin } from '../v2/radio-api-origin.js';

const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (now) => {
  const values = Object.fromEntries(clock.formatToParts(now).map(part => [part.type, part.value]));
  return [values.year, values.month, values.day].join('-');
};
const leaseMs = 45_000;
const tokenMs = 4 * 60 * 60_000;
const head = `SELECT r.id,r.catalog_song_id FROM song_requests r JOIN song_catalog s ON s.id=r.catalog_song_id
  WHERE r.status='approved' AND s.active=1 ORDER BY r.queue_priority DESC,r.created_at,r.id LIMIT 1`;
const resetLease = "request_id=NULL,lease_id=NULL,lease_expires_ms=0,phase='idle',position_ms=0";
const authorizedSlot = "slot=1 AND token_hash=? AND token_expires_ms>? AND EXISTS (SELECT 1 FROM users WHERE id=issued_by AND role='admin')";
const approved = "EXISTS (SELECT 1 FROM song_requests r JOIN song_catalog s ON s.id=r.catalog_song_id AND s.active=1 WHERE r.id=request_id AND r.status='approved')";

export function radioGenre(value) {
  if (typeof value !== 'string') return null;
  const genre = value.normalize('NFKC').trim().toLowerCase();
  return genre.length <= 40 && /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(genre) ? genre : null;
}

export async function dailyRadioGenre(db, now, first) {
  const day = dayKey(now);
  const row = await first(db, 'SELECT genre FROM radio_daily_genres WHERE day=?', day);
  return { day, genre: row?.genre ?? null };
}

export async function radioDjRoute({ req, env, headers, user, first, run, changed, j, readBody, token, hash, uuid, audit }) {
  const path = new URL(req.url).pathname, method = req.method;
  const admin = path.startsWith('/api/admin/dj/');
  const production = env.ALLOWED_ORIGIN === productionRadioOrigin;
  const now = Date.now(), db = env.DB;
  const ok = (body, status = 200) => j(body, status, headers);
  const fail = (error, status) => ok({ error }, status);
  if (env.RADIO_DJ_ENABLED !== 'true') return method === 'GET' && path === '/api/dj/status'
    ? ok({ enabled: false, genre: null, playback: null }) : fail('radio_dj_disabled', 503);

  if (path === '/api/dj/status' && method === 'GET') {
    const [daily, playback] = await Promise.all([
      dailyRadioGenre(db, now, first),
      first(db, `SELECT r.title,r.artist,d.phase AS state,d.position_ms AS positionMs
        FROM radio_dj_runtime d JOIN song_requests r ON r.id=d.request_id
        JOIN song_catalog s ON s.id=r.catalog_song_id AND s.active=1
        WHERE d.slot=1 AND d.token_expires_ms>? AND d.lease_expires_ms>? AND r.status='approved'
        AND EXISTS(SELECT 1 FROM users WHERE id=d.issued_by AND role='admin')
        AND d.phase IN ('playing','paused')`, now, now)
    ]);
    return ok({ enabled: true, ...daily, playback });
  }

  if (admin) {
    if (user?.role !== 'admin') return fail('forbidden', 403);
    if (path === '/api/admin/dj/genre' && method === 'PUT') {
      const genre = radioGenre((await readBody(req)).genre);
      if (genre == null) return fail('invalid_genre', 400);
      const day = dayKey(now);
      await run(db, `INSERT INTO radio_daily_genres(day,genre,updated_by,updated_at_ms) VALUES(?,?,?,?)
        ON CONFLICT(day) DO UPDATE SET genre=excluded.genre,updated_by=excluded.updated_by,updated_at_ms=excluded.updated_at_ms`,
      day, genre, user.id, now);
      await audit(db, user, 'radio_daily_genre', day, genre);
      return ok({ day, genre });
    }
    if (path === '/api/admin/dj/genre' && method === 'DELETE') {
      const genre = radioGenre((await readBody(req)).genre);
      if (genre == null) return fail('invalid_genre', 400);
      const day = dayKey(now);
      const removed = await run(db, 'DELETE FROM radio_daily_genres WHERE day=? AND genre=?', day, genre);
      if (!changed(removed)) return fail('radio_dj_genre_changed', 409);
      await audit(db, user, 'radio_daily_genre_clear', day, genre);
      return ok({ day, genre: null });
    }
    if (path === '/api/admin/dj/pair' && method === 'POST') {
      const value = (production ? 'prod_' : '') + token();
      const existing = await run(db, `UPDATE radio_dj_runtime SET token_hash=?,token_expires_ms=?,issued_by=?,${resetLease}
        WHERE slot=1 AND (lease_expires_ms<=? OR phase IN ('idle','completed'))`, await hash(value), now + tokenMs, user.id, now);
      if (!changed(existing)) return fail('radio_dj_busy', 409);
      return ok({ token: value, expiresAt: now + tokenMs }, 201);
    }
    if (path === '/api/admin/dj/pair' && method === 'DELETE') {
      await run(db, `UPDATE radio_dj_runtime SET token_hash=NULL,token_expires_ms=0,issued_by=NULL,${resetLease} WHERE slot=1`);
      return ok({ ok: true });
    }
    if (path === '/api/admin/dj/catalog' && method === 'GET') {
      const { results } = await db.prepare('SELECT id,title,artist,genre FROM song_catalog WHERE active=1 ORDER BY title,id LIMIT 100').all();
      return ok({ tracks: results });
    }
    return fail('not_found', 404);
  }

  const format = production ? /^Bearer (prod_[a-f0-9]{64})$/ : /^Bearer ([a-f0-9]{64})$/;
  const bearer = req.headers.get('Authorization')?.match(format)?.[1];
  if (!bearer) return fail('unauthorized', 401);
  const digest = await hash(bearer);
  if (!await first(db, `SELECT 1 FROM radio_dj_runtime WHERE ${authorizedSlot}`, digest, now)) return fail('unauthorized', 401);

  if (path === '/api/dj/next' && method === 'GET') {
    const next = await first(db, `SELECT id AS requestId,catalog_song_id AS trackId FROM (${head})`);
    return ok({ next });
  }
  if (path === '/api/dj/claim' && method === 'POST') {
    const { requestId } = await readBody(req);
    if (!uuid(requestId)) return fail('invalid_dj_request', 400);
    const leaseId = crypto.randomUUID(), expiresAt = now + leaseMs;
    const claim = await first(db, `UPDATE radio_dj_runtime SET request_id=?,lease_id=?,lease_expires_ms=?,phase='claimed',position_ms=0
      WHERE ${authorizedSlot} AND (lease_expires_ms<=? OR phase IN ('idle','completed'))
      AND ?=(SELECT id FROM (${head})) RETURNING request_id AS requestId,lease_id AS leaseId,lease_expires_ms AS expiresAt`,
    requestId, leaseId, expiresAt, digest, now, now, requestId);
    return claim ? ok({ claim }) : fail('radio_dj_claim_conflict', 409);
  }
  if (path === '/api/dj/playback' && method === 'POST') {
    const { leaseId, event, positionMs } = await readBody(req);
    if (!uuid(leaseId) || !['playing', 'paused', 'complete', 'release'].includes(event)) return fail('invalid_dj_event', 400);
    if (event === 'release') {
      await run(db, `UPDATE radio_dj_runtime SET ${resetLease} WHERE ${authorizedSlot} AND lease_id=?`, digest, now, leaseId);
      return ok({ ok: true });
    }
    if (!Number.isSafeInteger(positionMs) || positionMs < 1 || positionMs > 2 * 60 * 60_000) return fail('invalid_dj_position', 400);
    const current = await first(db, `UPDATE radio_dj_runtime SET phase=?,position_ms=MAX(position_ms,?),lease_expires_ms=?
      WHERE ${authorizedSlot} AND lease_id=? AND lease_expires_ms>? AND ${approved}
      AND (phase IN ('playing','paused') OR (phase='claimed' AND ?='playing'))
      RETURNING phase,lease_expires_ms AS expiresAt`,
    event === 'complete' ? 'completed' : event, positionMs, now + leaseMs, digest, now, leaseId, now, event);
    if (current) return ok(current);
    if (event === 'complete' && await first(db, `SELECT 1 FROM radio_dj_runtime WHERE ${authorizedSlot} AND lease_id=? AND phase='completed'`,
      digest, now, leaseId)) return ok({ phase: 'completed' });
    return fail('radio_dj_lease_lost', 409);
  }
  return fail('not_found', 404);
}
