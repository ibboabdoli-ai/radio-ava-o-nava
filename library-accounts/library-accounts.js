import {clearGoogleSession, finishGoogle, googleEnabled, googleSession, startGoogle} from './google-auth.js';

const prefix = '/api/library/';
const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const playlistRoute = new RegExp('^' + prefix + 'playlists/(' + uuid + ')(?:/tracks/(' + uuid + '|[a-f0-9]{32}))?$','i');
const validArchiveSource = /^archive:audio\/[a-f0-9]{64}\.(?:mp3|wav|ogg|m4a|flac)$/;
const unavailable = {error:'not_found'};
const accountPage = 'https://ava-radio-staging.ibbo-abdoli.workers.dev';
const publishedCatalogUrl = 'https://api-radio.ibboabdoli.com/api/library/tracks';
let catalogCache;

async function publishedCatalog(fetcher) {
  if (catalogCache?.fetcher === fetcher && catalogCache.expires > Date.now()) return catalogCache.tracks;
  const response = await fetcher(publishedCatalogUrl,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw {status:503,code:'catalog_unavailable'};
  const {tracks} = await response.json();
  if (!Array.isArray(tracks)) throw {status:503,code:'catalog_unavailable'};
  const indexed = new Map(tracks.map(track=>[track.id,{id:track.id,title:track.title,artist:track.artist}]));
  catalogCache = {fetcher,tracks:indexed,expires:Date.now()+60000};
  return indexed;
}

export function isLibraryAccounts(path) {
  return path === prefix + 'profile' || path === prefix + 'playlist-catalog' || path === prefix + 'playlists' ||
    path.startsWith(prefix + 'playlists/') || path.startsWith(prefix + 'auth/');
}

async function libraryProfile(request, db, clubSession) {
  const google = await googleSession(request, db);
  if (google) return {...google, method:'google'};
  const club = await clubSession();
  if (!club || club.role !== 'listener') return null;
  let account = await db.prepare('SELECT id FROM library_accounts WHERE club_user_id=?').bind(club.id).first();
  if (!account) {
    await db.prepare('INSERT INTO library_accounts(id,club_user_id,display_name) VALUES(?,?,?) ON CONFLICT(club_user_id) DO NOTHING')
      .bind(crypto.randomUUID(), club.id, club.username).run();
    account = await db.prepare('SELECT id FROM library_accounts WHERE club_user_id=?').bind(club.id).first();
  }
  return account ? {...account, display_name:club.username.replace(/^ch:/, '@'), picture_url:null, method:'club'} : null;
}

function namedPlaylist(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export async function libraryAccounts({req, env, clubSession, readBody, j, h, fetcher=fetch}) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const db = env.DB;
  const respond = (body, status = 200, headers = {}) => j(body, status, {...h,...headers});
  if (url.origin !== accountPage || env.ALLOWED_ORIGIN !== accountPage ||
      env.LIBRARY_ACCOUNTS_ENABLED !== 'true') return respond(unavailable, 404);
  if (!['GET','HEAD'].includes(method) && req.headers.get('Origin') !== url.origin) return respond({error:'origin_required'},403);

  if (method === 'GET' && path === prefix + 'auth/google') return startGoogle(req, env);
  if (method === 'GET' && path === prefix + 'auth/google/callback') return finishGoogle(req, env, db);
  if (method === 'POST' && path === prefix + 'auth/logout') {
    return respond({ok:true},200,{'set-cookie':await clearGoogleSession(req,db)});
  }
  if (method === 'GET' && path === prefix + 'playlist-catalog') {
    const tracks = await publishedCatalog(fetcher);
    return respond({tracks:[...tracks.values()]});
  }
  const account = await libraryProfile(req, db, clubSession);
  if (method === 'GET' && path === prefix + 'profile') {
    return respond({
      account: account ? {name:account.display_name,picture:account.picture_url,method:account.method} : null,
      googleEnabled:googleEnabled(env),
    });
  }
  const route = playlistRoute.exec(path);
  const [, playlistId, songId] = route || [];
  if (method === 'GET' && playlistId && !songId) {
    const {results} = await db.prepare(
      'SELECT p.name,p.is_public,p.account_id,t.song_id FROM library_playlists p LEFT JOIN library_playlist_tracks t ON t.playlist_id=p.id WHERE p.id=? AND (p.is_public=1 OR p.account_id=?) ORDER BY t.position'
    ).bind(playlistId,account?.id ?? '').all();
    if (!results.length) return respond(unavailable,404);
    const first = results[0];
    const songs = results.filter(row=>row.song_id);
    const catalog = songs.length ? await publishedCatalog(fetcher) : new Map();
    return respond({
      id:playlistId, name:first.name, public:Boolean(first.is_public), owned:first.account_id===account?.id,
      tracks:songs.map(row=>catalog.get(row.song_id) || {id:row.song_id,title:null,artist:null}),
    });
  }
  if (!account) return respond({error:'sign_in_required'},401);

  if (path === prefix + 'playlists' && method === 'GET') {
    const {results} = await db.prepare('SELECT id,name,is_public AS public FROM library_playlists WHERE account_id=? ORDER BY created_at DESC,id').bind(account.id).all();
    return respond({playlists:results});
  }
  if (path === prefix + 'playlists' && method === 'POST') {
    const name = namedPlaylist(await readBody(req));
    if (!name) return respond({error:'invalid_name'},400);
    const created = await db.prepare(
      'INSERT INTO library_playlists(id,account_id,name,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM library_playlists WHERE account_id=?)<100 RETURNING id'
    ).bind(crypto.randomUUID(),account.id,name,Date.now(),account.id).first();
    return created ? respond(created,201) : respond({error:'playlist_limit'},409);
  }

  if (!playlistId) return respond(unavailable,404);
  const owned = await db.prepare('SELECT id FROM library_playlists WHERE id=? AND account_id=?').bind(playlistId,account.id).first();
  if (!owned) return respond(unavailable,404);
  if (!songId && method === 'PATCH') {
    const body = await readBody(req);
    const name = namedPlaylist(body);
    if (!name || typeof body.public !== 'boolean') return respond({error:'invalid_playlist'},400);
    await db.prepare('UPDATE library_playlists SET name=?,is_public=? WHERE id=? AND account_id=?').bind(name,Number(body.public),playlistId,account.id).run();
    return respond({ok:true});
  }
  if (!songId && method === 'DELETE') {
    await db.prepare('DELETE FROM library_playlists WHERE id=? AND account_id=?').bind(playlistId,account.id).run();
    return respond({ok:true});
  }
  if (songId && method === 'PUT') {
    if (!(await publishedCatalog(fetcher)).has(songId)) return respond(unavailable,404);
    const song = await db.prepare('SELECT source_url FROM song_catalog WHERE id=? AND active=1').bind(songId).first();
    if (!validArchiveSource.test(song?.source_url || '')) return respond(unavailable,404);
    await db.prepare(
      'INSERT INTO library_playlist_tracks(playlist_id,song_id,position) SELECT ?,?,COALESCE((SELECT max(position)+1 FROM library_playlist_tracks WHERE playlist_id=?),1) WHERE EXISTS(SELECT 1 FROM library_playlists WHERE id=? AND account_id=?) AND (SELECT count(*) FROM library_playlist_tracks WHERE playlist_id=?)<500 ON CONFLICT(playlist_id,song_id) DO NOTHING'
    ).bind(playlistId,songId,playlistId,playlistId,account.id,playlistId).run();
    const present = await db.prepare('SELECT 1 FROM library_playlist_tracks WHERE playlist_id=? AND song_id=?').bind(playlistId,songId).first();
    return present ? respond({ok:true}) : respond({error:'track_limit'},409);
  }
  if (songId && method === 'DELETE') {
    await db.prepare('DELETE FROM library_playlist_tracks WHERE playlist_id=? AND song_id=? AND EXISTS(SELECT 1 FROM library_playlists WHERE id=? AND account_id=?)')
      .bind(playlistId,songId,playlistId,account.id).run();
    return respond({ok:true});
  }
  return respond(unavailable,404);
}
