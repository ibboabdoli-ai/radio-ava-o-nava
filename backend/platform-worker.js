import { normalizeObservation } from './attendance-engine.js';
import { dailyRadioGenre, radioDjRoute, radioGenre } from './radio-dj-worker.js';
import { scrypt as nodeScrypt } from 'node:crypto';

const j=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const clean=(v,n)=>typeof v==='string'?v.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,n):'';
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async v=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));
const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
// OWASP Password Storage Cheat Sheet: scrypt N=2^13, r=8, p=10.
const HASH_FORMAT_PREFIX='scrypt_n8192_r8_p10$';
const passwordHash=async(pass,salt)=>HASH_FORMAT_PREFIX+await new Promise((resolve,reject)=>nodeScrypt(pass,salt,32,{N:8192,r:8,p:10,maxmem:32*1024*1024},(error,key)=>error?reject(error):resolve(key.toString('hex'))));
// Read-only verifier for the two staging accounts created before the stronger KDF.
const legacyPbkdf=async(pass,salt)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},k,256)))};
const verifyPassword=async(pass,u)=>{if(u?.password_hash?.startsWith(HASH_FORMAT_PREFIX))return eq(await passwordHash(pass,u.password_salt),u.password_hash);if(/^[a-f0-9]{64}$/.test(u?.password_hash||''))return eq(await legacyPbkdf(pass,u.password_salt),u.password_hash);await passwordHash(pass,'invalid-salt');return false};
const eq=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const changed=r=>Number(r?.meta?.changes||0);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const balance=async(db,id)=>Number((await first(db,'SELECT COALESCE(SUM(delta),0) AS balance FROM point_transactions WHERE user_id=?',id))?.balance||0);
const origin=env=>env.ALLOWED_ORIGIN||'https://radio.ibboabdoli.com';
const cors=(req,env)=>req.headers.get('Origin')===origin(env)?{'access-control-allow-origin':origin(env),'access-control-allow-credentials':'true','access-control-allow-methods':'GET, POST, PATCH, PUT, DELETE, OPTIONS','access-control-allow-headers':'Content-Type, Idempotency-Key, Authorization','vary':'Origin'}:{};
const cookie=t=>`radio_session=${t}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=604800`;
const readBody=async req=>{if(!req.headers.get('content-type')?.startsWith('application/json'))throw{status:415,code:'json_required'};if(Number(req.headers.get('content-length')||0)>8192)throw{status:413,code:'too_large'};const raw=await req.text();if(raw.length>8192)throw{status:413,code:'too_large'};try{const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body}catch{throw{status:400,code:'invalid_json'}}};
const session=async(req,db)=>{const t=req.headers.get('Cookie')?.match(/(?:^|;\s*)radio_session=([a-f0-9]{64})(?:;|$)/)?.[1];return t?first(db,'SELECT u.id,u.username,u.role,u.leaderboard_opt_in FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at_ms>?',await hash(t),Date.now()):null};
const profile=async(db,u)=>({id:u.id,username:u.username,role:u.role,leaderboardOptIn:!!u.leaderboard_opt_in,balance:await balance(db,u.id)});
const audit=(db,u,action,target,note='')=>run(db,'INSERT INTO admin_events(id,actor_user_id,action,target_id,note,created_at_ms) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),u.id,action,target,note,Date.now());
const rate=async(req,db,env)=>{const key=await hash(`${env.AUTH_RATE_SECRET||'local'}|${req.headers.get('CF-Connecting-IP')||'unknown'}`),now=Date.now();await run(db,'INSERT INTO auth_limits(client_hash,window_start_ms,attempts) VALUES(?,?,1) ON CONFLICT(client_hash) DO UPDATE SET window_start_ms=CASE WHEN window_start_ms<? THEN excluded.window_start_ms ELSE window_start_ms END,attempts=CASE WHEN window_start_ms<? THEN 1 ELSE attempts+1 END',key,now,now-900000,now-900000);return Number((await first(db,'SELECT attempts FROM auth_limits WHERE client_hash=?',key))?.attempts||0)<=20};
const accountRate=async(db,env,username)=>{const key=await hash(`${env.AUTH_RATE_SECRET}|account|${username}`),now=Date.now();await run(db,'INSERT INTO auth_limits(client_hash,window_start_ms,attempts) VALUES(?,?,1) ON CONFLICT(client_hash) DO UPDATE SET window_start_ms=CASE WHEN window_start_ms<? THEN excluded.window_start_ms ELSE window_start_ms END,attempts=CASE WHEN window_start_ms<? THEN 1 ELSE attempts+1 END',key,now,now-900000,now-900000);return Number((await first(db,'SELECT attempts FROM auth_limits WHERE client_hash=?',key))?.attempts||0)<=10};
const clearCookie='radio_session=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0';

export default {async fetch(req,env){const h=cors(req,env),url=new URL(req.url),p=url.pathname,m=req.method;try{
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==origin(env))return j({error:'origin_not_allowed'},403,h);
 if(m==='OPTIONS')return new Response(null,{status:204,headers:h});
 if(p==='/health'&&m==='GET')return j({ok:true,configured:!!env.DB,featuresEnabled:env.RADIO_FEATURES_ENABLED==='true',registrationEnabled:env.REGISTRATION_ENABLED==='true',attendanceObserverEnabled:env.ATTENDANCE_OBSERVER_ENABLED==='true'},200,h);
 if(!env.DB||env.RADIO_FEATURES_ENABLED!=='true')return j({error:'service_disabled'},503,h);
 if(!env.ALLOWED_ORIGIN||!env.AUTH_RATE_SECRET)return j({error:'service_unconfigured'},503,h);
 if(!['GET','HEAD'].includes(m)&&req.headers.get('Origin')!==origin(env))return j({error:'origin_required'},403,h);
 const db=env.DB;
 const djEnabled=env.RADIO_DJ_ENABLED==='true';
 const djRoute=user=>radioDjRoute({req,env,headers:h,user,first,run,changed,j,readBody,token,hash,uuid,audit});
 if(p.startsWith('/api/dj/'))return await djRoute(null);
 if(p==='/api/auth/register'&&m==='POST'){
  if(env.REGISTRATION_ENABLED!=='true')return j({error:'registration_disabled'},503,h);
  if(!await rate(req,db,env))return j({error:'rate_limited'},429,h);
  const b=await readBody(req),username=clean(b.username,40).toLowerCase();
  if(!/^[a-z0-9_]{3,40}$/.test(username)||typeof b.password!=='string'||b.password.length<12||b.password.length>128)return j({error:'invalid_credentials'},400,h);
  const salt=token(),derived=await passwordHash(b.password,salt);
  try{await run(db,'INSERT INTO users(id,username,password_salt,password_hash,created_at_ms) VALUES(?,?,?,?,?)',crypto.randomUUID(),username,salt,derived,Date.now())}catch(e){if((await first(db,'SELECT id FROM users WHERE username=?',username)))return j({error:'username_unavailable'},409,h);throw e}
  return j({ok:true},201,h);
 }
 if(p==='/api/auth/login'&&m==='POST'){
  if(!await rate(req,db,env))return j({error:'rate_limited'},429,h);
  const b=await readBody(req),username=clean(b.username,40).toLowerCase();
  if(!await accountRate(db,env,username))return j({error:'rate_limited'},429,h);
  const u=await first(db,'SELECT * FROM users WHERE username=?',username);
  const pass=typeof b.password==='string'?b.password:'';
  if(pass.length>128||!await verifyPassword(pass,u))return j({error:'invalid_credentials'},401,h);
  if(!u.password_hash.startsWith(HASH_FORMAT_PREFIX)){
   const upgraded=await passwordHash(pass,u.password_salt);
   if(!changed(await run(db,'UPDATE users SET password_hash=? WHERE id=? AND password_hash=?',upgraded,u.id,u.password_hash)))return j({error:'invalid_credentials'},401,h);
   u.password_hash=upgraded;
  }
  const t=token(),now=Date.now();
  const inserted=await run(db,'INSERT INTO user_sessions(token_hash,user_id,expires_at_ms,created_at_ms) SELECT ?,id,?,? FROM users WHERE id=? AND password_hash=?',await hash(t),now+604800000,now,u.id,u.password_hash);
  if(!changed(inserted))return j({error:'invalid_credentials'},401,h);
  return j({user:await profile(db,u)},200,{...h,'set-cookie':cookie(t)});
 }
 if(p==='/api/auth/logout'&&m==='POST'){const t=req.headers.get('Cookie')?.match(/(?:^|;\s*)radio_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(t)await run(db,'DELETE FROM user_sessions WHERE token_hash=?',await hash(t));return j({ok:true},200,{...h,'set-cookie':clearCookie})}
 if(p==='/api/auth/recover'&&m==='POST'){
  if(!await rate(req,db,env))return j({error:'rate_limited'},429,h);
  const b=await readBody(req),username=clean(b.username,40).toLowerCase();
  if(!await accountRate(db,env,username))return j({error:'rate_limited'},429,h);
  const code=typeof b.recoveryCode==='string'?b.recoveryCode:'',pass=b.newPassword;
  if(!/^[a-f0-9]{64}$/.test(code)||typeof pass!=='string'||pass.length<12||pass.length>128)return j({error:'invalid_recovery'},400,h);
  const u=await first(db,'SELECT id FROM users WHERE username=?',username);
  const salt=token(),newHash=await passwordHash(pass,salt);
  const updated=u&&await run(db,'UPDATE users SET password_salt=?,password_hash=? WHERE id=? AND EXISTS (SELECT 1 FROM account_recovery WHERE user_id=? AND code_hash=?)',salt,newHash,u.id,u.id,await hash(code));
  if(!changed(updated))return j({error:'invalid_recovery'},401,h);
  return j({ok:true},200,{...h,'set-cookie':clearCookie});
 }
 if(p==='/api/catalog'&&m==='GET'){
  const q=`%${clean(url.searchParams.get('q'),80).replace(/[%_]/g,'')}%`;
  const daily=djEnabled?await dailyRadioGenre(db,Date.now(),first):null;
  const songs=daily?await all(db,'SELECT id,title,artist,cost,genre FROM song_catalog WHERE active=1 AND (title LIKE ? OR artist LIKE ?) AND (? IS NULL OR genre=?) ORDER BY title,id LIMIT 50',q,q,daily.genre,daily.genre)
    :await all(db,'SELECT id,title,artist,cost FROM song_catalog WHERE active=1 AND (title LIKE ? OR artist LIKE ?) ORDER BY title LIMIT 50',q,q);
  return j({songs},200,h);
 }
 if(p==='/api/queue'&&m==='GET')return j({queue:await all(db,"SELECT id,title,artist,queue_priority,created_at FROM song_requests WHERE status='approved' ORDER BY queue_priority DESC,created_at,id LIMIT 100")},200,h);
 if(p==='/api/leaderboard'&&m==='GET')return j({leaders:await all(db,'SELECT u.username AS name,COALESCE(SUM(t.delta),0) AS points FROM users u LEFT JOIN point_transactions t ON t.user_id=u.id WHERE u.leaderboard_opt_in=1 GROUP BY u.id ORDER BY points DESC,u.username COLLATE NOCASE LIMIT 50')},200,h);
 if(p==='/api/competitions'&&m==='GET'){
  const competitions=await all(db,"SELECT id,title,description,rules,status,results_public FROM competitions WHERE status IN ('published','closed') ORDER BY updated_at_ms DESC LIMIT 30");
  for(const c of competitions){c.results=c.results_public?await all(db,"SELECT r.placement,r.result_text,u.username AS displayName FROM competition_results r JOIN users u ON u.id=r.user_id WHERE r.competition_id=? AND r.public_approved=1 AND r.public_name_consent=1 ORDER BY r.placement IS NULL,r.placement,u.username LIMIT 50",c.id):[];c.rules=JSON.parse(c.rules);delete c.results_public}
  return j({competitions},200,h);
 }
 if(p==='/api/admin/attendance')return j({error:'legacy_attendance_disabled'},410,h);
 if(p==='/api/internal/attendance'&&m==='POST'){
  if(env.ATTENDANCE_OBSERVER_ENABLED!=='true'||!env.OBSERVER_TOKEN)return j({error:'observer_disabled'},503,h);
  const bearer=req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]||'';if(!eq(await hash(bearer),await hash(env.OBSERVER_TOKEN)))return j({error:'unauthorized'},401,h);
  const b=await readBody(req),o=normalizeObservation(b);if(!o)return j({error:'invalid_observation'},400,h);
  const mapping=await first(db,'SELECT user_id FROM listener_identities WHERE clubhouse_user_id=?',o.clubhouseUserId);if(!mapping)return j({error:'unmapped_identity'},404,h);
  const id=clean(b.observationId,100);if(!/^[a-zA-Z0-9_:-]{8,100}$/.test(id))return j({error:'invalid_observation_id'},400,h);
  const r=await run(db,"INSERT OR IGNORE INTO attendance_observations(observation_id,user_id,clubhouse_user_id,room_id,state,received_ms,source_kind) VALUES(?,?,?,?,?,?,'trusted_presence')",id,mapping.user_id,o.clubhouseUserId,o.roomId,o.state,Date.now());return j({accepted:!!changed(r),duplicate:!changed(r)},200,h);
 }
 const u=await session(req,db);if(!u)return j({error:'unauthorized'},401,h);
 if(p==='/api/me'&&m==='GET')return j({user:await profile(db,u)},200,h);
 if(p==='/api/me/dashboard'&&m==='GET'){
  const [points,attendance,requests]=await Promise.all([
   first(db,"SELECT COALESCE(SUM(delta),0) AS balance,COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) AS earned,COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) AS spent FROM point_transactions WHERE user_id=?",u.id),
   first(db,'SELECT COALESCE(SUM(credited_seconds),0) AS verifiedSeconds FROM attendance_sessions WHERE user_id=?',u.id),
   first(db,"SELECT COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS pending,COALESCE(SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END),0) AS approved FROM song_requests WHERE user_id=?",u.id)
  ]);
  let rank=null;
  if(u.leaderboard_opt_in){const ranked=await first(db,"WITH totals AS (SELECT users.id,users.username,COALESCE(SUM(point_transactions.delta),0) AS points FROM users LEFT JOIN point_transactions ON point_transactions.user_id=users.id WHERE users.leaderboard_opt_in=1 GROUP BY users.id) SELECT 1+COUNT(*) AS rank FROM totals WHERE points>? OR (points=? AND username COLLATE NOCASE<? COLLATE NOCASE)",points.balance,points.balance,u.username);rank=ranked.rank}
  return j({dashboard:{balance:points.balance,earned:points.earned,spent:points.spent,verifiedSeconds:attendance.verifiedSeconds,pending:requests.pending,approved:requests.approved,rank}},200,h);
 }
 if(p==='/api/me/password'&&m==='POST'){
  if(!await accountRate(db,env,u.username))return j({error:'rate_limited'},429,h);
  const b=await readBody(req),pass=b.newPassword;
  if(typeof pass!=='string'||pass.length<12||pass.length>128)return j({error:'invalid_credentials'},400,h);
  const current=await first(db,'SELECT password_salt,password_hash FROM users WHERE id=?',u.id);
  if(!await verifyPassword(typeof b.currentPassword==='string'?b.currentPassword:'',current))return j({error:'invalid_credentials'},401,h);
  const salt=token(),derived=await passwordHash(pass,salt);
  if(!changed(await run(db,'UPDATE users SET password_salt=?,password_hash=? WHERE id=? AND password_hash=?',salt,derived,u.id,current.password_hash)))return j({error:'credentials_changed'},409,h);
  return j({ok:true},200,{...h,'set-cookie':clearCookie});
 }
 if(p==='/api/me/recovery-code'&&m==='POST'){
  if(!await accountRate(db,env,u.username))return j({error:'rate_limited'},429,h);
  const b=await readBody(req),current=await first(db,'SELECT password_salt,password_hash FROM users WHERE id=?',u.id);
  if(!await verifyPassword(typeof b.currentPassword==='string'?b.currentPassword:'',current))return j({error:'invalid_credentials'},401,h);
  const code=token();
  const issued=await run(db,'INSERT INTO account_recovery(user_id,code_hash,created_at_ms) SELECT id,?,? FROM users WHERE id=? AND password_hash=? ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,created_at_ms=excluded.created_at_ms',await hash(code),Date.now(),u.id,current.password_hash);
  if(!changed(issued))return j({error:'credentials_changed'},409,h);
  return j({recoveryCode:code},200,h);
 }
 if(p==='/api/me'&&m==='PATCH'){const b=await readBody(req);if(typeof b.leaderboardOptIn!=='boolean')return j({error:'invalid_opt_in'},400,h);await run(db,'UPDATE users SET leaderboard_opt_in=? WHERE id=?',Number(b.leaderboardOptIn),u.id);return j({ok:true},200,h)}
 if(p==='/api/me/clubhouse-identity'&&m==='GET'){const linked=await first(db,'SELECT clubhouse_user_id FROM listener_identities WHERE user_id=?',u.id);return j({linked:!!linked,clubhouseUserId:linked?.clubhouse_user_id||null},200,h)}
 if(p==='/api/me/clubhouse-identity'&&m==='DELETE'){await run(db,'DELETE FROM listener_identities WHERE user_id=?',u.id);return j({ok:true},200,h)}
 if(p==='/api/me/transactions'&&m==='GET')return j({transactions:await all(db,'SELECT id,delta,kind,source_type,note,created_at_ms FROM point_transactions WHERE user_id=? ORDER BY created_at_ms DESC LIMIT 100',u.id)},200,h);
 if(p==='/api/me/competition-results'&&m==='GET')return j({results:await all(db,'SELECT c.id AS competition_id,c.title,r.placement,r.result_text,r.is_winner,r.public_approved,r.public_name_consent,a.points AS awarded_points FROM competition_results r JOIN competitions c ON c.id=r.competition_id LEFT JOIN competition_awards a ON a.competition_id=r.competition_id AND a.user_id=r.user_id WHERE r.user_id=? ORDER BY r.recorded_at_ms DESC LIMIT 100',u.id)},200,h);
 const consent=p.match(/^\/api\/me\/competitions\/([a-f0-9-]{36})\/consent$/i);
 if(consent&&m==='PATCH'){const b=await readBody(req);if(typeof b.publicNameConsent!=='boolean')return j({error:'invalid_consent'},400,h);const r=await run(db,'UPDATE competition_results SET public_name_consent=? WHERE competition_id=? AND user_id=?',Number(b.publicNameConsent),consent[1],u.id);return changed(r)?j({ok:true},200,h):j({error:'result_not_found'},404,h)}
 if(p==='/api/me/attendance'&&m==='GET')return j({sessions:await all(db,'SELECT room_id,start_ms,last_seen_ms,end_ms,credited_seconds FROM attendance_sessions WHERE user_id=? ORDER BY start_ms DESC LIMIT 100',u.id)},200,h);
 if(p==='/api/me/requests'&&m==='GET')return j({requests:await all(db,'SELECT id,title,artist,status,cost,catalog_song_id,created_at FROM song_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100',u.id)},200,h);
 const cancel=p.match(/^\/api\/me\/requests\/([a-f0-9-]{36})$/i);if(cancel&&m==='PATCH'){const r=await run(db,"UPDATE song_requests SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=? AND status IN ('pending','approved')",cancel[1],u.id);return changed(r)?j({ok:true},200,h):j({error:'not_cancellable'},409,h)}
 if(p==='/api/requests'&&m==='POST'){
  const b=await readBody(req),songId=clean(b.catalogSongId,100),key=req.headers.get('Idempotency-Key')||'';if(!/^[a-f0-9-]{36}$/i.test(key))return j({error:'idempotency_key_required'},400,h);
  const prior=await first(db,'SELECT id,status,catalog_song_id FROM song_requests WHERE user_id=? AND idempotency_key=?',u.id,key);if(prior)return prior.catalog_song_id===songId?j({id:prior.id,status:prior.status,duplicate:true},200,h):j({error:'idempotency_conflict'},409,h);
  const song=await first(db,'SELECT * FROM song_catalog WHERE id=? AND active=1',songId);if(!song)return j({error:'song_unavailable'},404,h);
  const daily=djEnabled?await dailyRadioGenre(db,Date.now(),first):null;
  const id=crypto.randomUUID();
  try{
   const inserted=await run(db,`INSERT INTO song_requests(id,title,artist,requested_by,user_id,catalog_song_id,cost,idempotency_key)
     SELECT ?,title,artist,?,?,id,cost,? FROM song_catalog WHERE id=? AND active=1${daily?' AND NOT EXISTS (SELECT 1 FROM radio_daily_genres WHERE day=? AND radio_daily_genres.genre<>song_catalog.genre)':''}`,
   id,u.username,u.id,key,song.id,...(daily?[daily.day]:[]));
   if(!changed(inserted))return j({error:daily?'genre_mismatch':'song_unavailable'},409,h);
  }catch(error){
   const original=await first(db,'SELECT id,status,catalog_song_id FROM song_requests WHERE user_id=? AND idempotency_key=?',u.id,key);
   if(original)return original.catalog_song_id===songId?j({id:original.id,status:original.status,duplicate:true},200,h):j({error:'idempotency_conflict'},409,h);
   if(await first(db,"SELECT id FROM song_requests WHERE user_id=? AND catalog_song_id=? AND status IN ('pending','approved')",u.id,song.id))return j({error:'duplicate_active_request'},409,h);
   throw error;
  }
  return j({id,status:'pending',cost:song.cost},201,h);
 }
 if(u.role!=='admin')return j({error:'forbidden'},403,h);
 if(p.startsWith('/api/admin/dj/'))return await djRoute(u);
 if(p==='/api/admin/events'&&m==='GET')return j({events:await all(db,'SELECT e.action,e.target_id,e.note,e.created_at_ms,u.username AS actor FROM admin_events e JOIN users u ON u.id=e.actor_user_id ORDER BY e.created_at_ms DESC LIMIT 50')},200,h);
 if(p==='/api/admin/transactions'&&m==='GET')return j({transactions:await all(db,'SELECT t.delta,t.kind,t.source_type,t.note,t.created_at_ms,u.username,a.username AS actor FROM point_transactions t JOIN users u ON u.id=t.user_id LEFT JOIN users a ON a.id=t.actor_user_id ORDER BY t.created_at_ms DESC LIMIT 50')},200,h);
 if(p==='/api/admin/catalog'&&m==='POST'){
  const b=await readBody(req),title=clean(b.title,120),artist=clean(b.artist,120),source=clean(b.sourceUrl,500),note=clean(b.rightsNote,500),cost=Number(b.cost);
  const genre=b.genre==null||b.genre===''?'':radioGenre(b.genre);
  let sourceOk=false;
  try{const parsed=new URL(source);sourceOk=parsed.protocol==='https:'&&parsed.hostname==='audius.co'&&!parsed.username&&!parsed.password}catch{}
  if(genre===null)return j({error:'invalid_genre'},400,h);
  if(!title||!artist||!sourceOk||!note||b.rightsConfirmed!==true||b.playableConfirmed!==true||!Number.isInteger(cost)||cost<1||cost>1000)return j({error:'invalid_catalog_entry'},400,h);
  const id=crypto.randomUUID();
  await run(db,`INSERT INTO song_catalog(id,title,artist,source_url,rights_note,cost,playable_checked_at_ms,created_by_user_id,created_at_ms${djEnabled?',genre':''}) VALUES(?,?,?,?,?,?,?,?,?${djEnabled?',?':''})`,id,title,artist,source,note,cost,Date.now(),u.id,Date.now(),...(djEnabled?[genre]:[]));
  await audit(db,u,'catalog_create',id);return j({id},201,h);
 }
 const catalog=p.match(/^\/api\/admin\/catalog\/([a-f0-9-]{36})$/i);
 if(catalog&&m==='PATCH'){
  const b=await readBody(req),id=catalog[1];
  if(djEnabled&&b.genre!==undefined){
   const genre=radioGenre(b.genre);
   if(genre===null)return j({error:'invalid_genre'},400,h);
   if(!changed(await run(db,'UPDATE song_catalog SET genre=? WHERE id=?',genre,id)))return j({error:'not_found'},404,h);
   await audit(db,u,'catalog_genre',id,genre);return j({ok:true},200,h);
  }
  if(typeof b.active!=='boolean')return j({error:'invalid_active'},400,h);
  const r=await run(db,'UPDATE song_catalog SET active=? WHERE id=?',Number(b.active),id);
  if(!changed(r))return j({error:'not_found'},404,h);
  await audit(db,u,'catalog_active',id,String(b.active));return j({ok:true},200,h);
 }
 if(p==='/api/admin/requests'&&m==='GET'){const status=url.searchParams.get('status')||'pending';if(!['pending','approved','rejected','cancelled','played'].includes(status))return j({error:'invalid_status'},400,h);return j({requests:await all(db,`SELECT id,title,artist,requested_by,status,cost,queue_priority,created_at${djEnabled?',catalog_song_id IS NOT NULL AS playback_managed':''} FROM song_requests WHERE status=? ORDER BY queue_priority DESC,created_at,id LIMIT 100`,status)},200,h)}
 const request=p.match(/^\/api\/admin\/requests\/([a-f0-9-]{36})$/i);if(request&&m==='PATCH'){
  const b=await readBody(req),id=request[1];if(b.status==='approved'){const legacy=await run(db,"UPDATE song_requests SET status='approved',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending' AND user_id IS NULL AND cost=0",id);if(changed(legacy)){await audit(db,u,'legacy_request_approve',id);return j({ok:true,status:'approved',legacy:true},200,h)}const r=await run(db,"INSERT OR IGNORE INTO point_transactions(id,user_id,delta,kind,source_id,request_id,created_at_ms) SELECT ?,r.user_id,-r.cost,'request_spend',r.id,r.id,? FROM song_requests r WHERE r.id=? AND r.status='pending' AND r.user_id IS NOT NULL AND r.cost>0 AND (SELECT COALESCE(SUM(delta),0) FROM point_transactions WHERE user_id=r.user_id)>=r.cost",crypto.randomUUID(),Date.now(),id);if(!changed(r))return j({error:'insufficient_points_or_invalid_state'},409,h);await audit(db,u,'request_approve',id);return j({ok:true,status:'approved'},200,h)}
  if(b.status==='rejected'||b.status==='played'){
   const sql=b.status==='rejected'
    ?"UPDATE song_requests SET status='rejected',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status IN ('pending','approved')"
    :`UPDATE song_requests SET status='played',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='approved'${djEnabled?' AND catalog_song_id IS NULL':''}`;
   const r=await run(db,sql,id);if(!changed(r))return j({error:'invalid_state'},409,h);
   await audit(db,u,`request_${b.status}`,id);return j({ok:true,status:b.status},200,h)
  }
  if(Number.isInteger(b.queuePriority)&&b.queuePriority>=-100&&b.queuePriority<=100){const r=await run(db,"UPDATE song_requests SET queue_priority=? WHERE id=? AND status='approved'",b.queuePriority,id);if(!changed(r))return j({error:'invalid_state'},409,h);await audit(db,u,'request_priority',id,String(b.queuePriority));return j({ok:true},200,h)}return j({error:'invalid_action'},400,h);
 }
 if(p==='/api/admin/users'&&m==='GET')return j({users:await all(db,'SELECT u.id,u.username,u.role,u.leaderboard_opt_in,COALESCE(SUM(t.delta),0) AS balance FROM users u LEFT JOIN point_transactions t ON t.user_id=u.id GROUP BY u.id ORDER BY u.created_at_ms DESC LIMIT 100')},200,h);
 const identity=p.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/clubhouse-identity$/i);if(identity&&m==='PUT'){const b=await readBody(req),id=clean(b.clubhouseUserId,100);if(b.consentConfirmed!==true||!/^[a-zA-Z0-9_:-]{2,100}$/.test(id))return j({error:'consent_or_id_required'},400,h);if(!await first(db,'SELECT id FROM users WHERE id=?',identity[1]))return j({error:'user_not_found'},404,h);try{await run(db,'INSERT INTO listener_identities(clubhouse_user_id,user_id,consent_at_ms,mapped_by_user_id) VALUES(?,?,?,?)',id,identity[1],Date.now(),u.id)}catch{return j({error:'identity_already_mapped'},409,h)}await audit(db,u,'identity_map',identity[1]);return j({ok:true},200,h)}
 const adjust=p.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/adjust-points$/i);if(adjust&&m==='POST'){
  const b=await readBody(req),delta=b.delta,note=clean(b.note,300),key=req.headers.get('Idempotency-Key')?.toLowerCase();
  if(!Number.isInteger(delta)||!delta||Math.abs(delta)>1000||!note)return j({error:'invalid_adjustment'},400,h);
  if(!uuid(key))return j({error:'idempotency_key_required'},400,h);
  const prior=await first(db,"SELECT user_id,delta,note,actor_user_id FROM point_transactions WHERE kind='admin_adjustment' AND source_id=?",key);
  if(prior)return prior.user_id===adjust[1]&&prior.delta===delta&&prior.note===note&&prior.actor_user_id===u.id?j({ok:true,duplicate:true,balance:await balance(db,adjust[1])},200,h):j({error:'idempotency_conflict'},409,h);
  const r=await run(db,"INSERT OR IGNORE INTO point_transactions(id,user_id,delta,kind,source_id,note,created_at_ms,actor_user_id,source_type) SELECT ?,u.id,?,'admin_adjustment',?,?,?,?, 'manual' FROM users u WHERE u.id=? AND (SELECT COALESCE(SUM(delta),0) FROM point_transactions WHERE user_id=u.id)+?>=0",crypto.randomUUID(),delta,key,note,Date.now(),u.id,adjust[1],delta);
  if(!changed(r)){const duplicate=await first(db,"SELECT user_id,delta,note,actor_user_id FROM point_transactions WHERE kind='admin_adjustment' AND source_id=?",key);return duplicate&&duplicate.user_id===adjust[1]&&duplicate.delta===delta&&duplicate.note===note&&duplicate.actor_user_id===u.id?j({ok:true,duplicate:true,balance:await balance(db,adjust[1])},200,h):j({error:duplicate?'idempotency_conflict':'user_missing_or_negative_balance'},409,h)}
  return j({ok:true,balance:await balance(db,adjust[1])},200,h);
 }
 if(p==='/api/admin/competitions'&&m==='GET'){
  const competitions=await all(db,'SELECT id,title,description,rules,status,results_public,created_at_ms,updated_at_ms FROM competitions ORDER BY updated_at_ms DESC LIMIT 100');
  for(const c of competitions){c.rules=JSON.parse(c.rules);c.participants=await all(db,'SELECT p.user_id,u.username FROM competition_participants p JOIN users u ON u.id=p.user_id WHERE p.competition_id=? ORDER BY p.verified_at_ms DESC LIMIT 100',c.id);c.results=await all(db,'SELECT r.user_id,u.username,r.placement,r.result_text,r.is_winner,r.public_approved,r.public_name_consent,a.points AS awarded_points FROM competition_results r JOIN users u ON u.id=r.user_id LEFT JOIN competition_awards a ON a.competition_id=r.competition_id AND a.user_id=r.user_id WHERE r.competition_id=? ORDER BY r.placement IS NULL,r.placement,u.username LIMIT 100',c.id)}
  return j({competitions},200,h);
 }
 if(p==='/api/admin/competitions'&&m==='POST'){
  const b=await readBody(req),title=clean(b.title,120),description=clean(b.description,1000),rules=Array.isArray(b.rules)?b.rules.map(x=>clean(x,300)):null;
  if(!title||!description||!rules||rules.length>12||rules.some(x=>!x)||JSON.stringify(rules).length>4000)return j({error:'invalid_competition'},400,h);
  const id=crypto.randomUUID(),now=Date.now();await run(db,"INSERT INTO competitions(id,title,description,rules,status,results_public,created_by_user_id,updated_by_user_id,created_at_ms,updated_at_ms) VALUES(?,?,?,?,'draft',0,?,?,?,?)",id,title,description,JSON.stringify(rules),u.id,u.id,now,now);await audit(db,u,'competition_create',id);return j({id},201,h);
 }
 const competition=p.match(/^\/api\/admin\/competitions\/([a-f0-9-]{36})$/i);
 if(competition&&m==='PATCH'){
  const b=await readBody(req),title=clean(b.title,120),description=clean(b.description,1000),rules=Array.isArray(b.rules)?b.rules.map(x=>clean(x,300)):null;
  if(!title||!description||!rules||rules.length>12||rules.some(x=>!x)||JSON.stringify(rules).length>4000||!['draft','published','closed'].includes(b.status)||typeof b.resultsPublic!=='boolean')return j({error:'invalid_competition'},400,h);
  const r=await run(db,'UPDATE competitions SET title=?,description=?,rules=?,status=?,results_public=?,updated_by_user_id=?,updated_at_ms=? WHERE id=?',title,description,JSON.stringify(rules),b.status,Number(b.resultsPublic),u.id,Date.now(),competition[1]);if(!changed(r))return j({error:'not_found'},404,h);await audit(db,u,'competition_edit',competition[1]);return j({ok:true},200,h);
 }
 const participant=p.match(/^\/api\/admin\/competitions\/([a-f0-9-]{36})\/participants$/i);
 if(participant&&m==='POST'){
  const b=await readBody(req);if(!uuid(b.userId)||b.verifiedFromApprovedForm!==true)return j({error:'verification_required'},400,h);
  const r=await run(db,'INSERT OR IGNORE INTO competition_participants(competition_id,user_id,verified_by_user_id,verified_at_ms) SELECT c.id,u.id,?,? FROM competitions c JOIN users u ON u.id=? WHERE c.id=?',u.id,Date.now(),b.userId,participant[1]);
  if(!changed(r))return j({error:'participant_exists_or_missing'},409,h);await audit(db,u,'competition_participant',participant[1]);return j({ok:true},201,h);
 }
 const result=p.match(/^\/api\/admin\/competitions\/([a-f0-9-]{36})\/results$/i);
 if(result&&m==='POST'){
  const b=await readBody(req),description=clean(b.resultText,500),placement=b.placement===null?null:b.placement;
  if(!uuid(b.userId)||!description||!(placement===null||(Number.isInteger(placement)&&placement>=1&&placement<=100000))||typeof b.isWinner!=='boolean'||typeof b.publicApproved!=='boolean'||'publicNameConsent' in b||(b.isWinner&&placement===null))return j({error:'invalid_result'},400,h);
  let r;try{r=await run(db,'INSERT INTO competition_results(competition_id,user_id,placement,result_text,is_winner,public_approved,public_name_consent,recorded_by_user_id,recorded_at_ms) SELECT p.competition_id,p.user_id,?,?,?,?,0,?,? FROM competition_participants p WHERE p.competition_id=? AND p.user_id=? ON CONFLICT(competition_id,user_id) DO UPDATE SET placement=excluded.placement,result_text=excluded.result_text,is_winner=excluded.is_winner,public_approved=excluded.public_approved,recorded_by_user_id=excluded.recorded_by_user_id,recorded_at_ms=excluded.recorded_at_ms WHERE NOT EXISTS (SELECT 1 FROM competition_awards a WHERE a.competition_id=excluded.competition_id AND a.user_id=excluded.user_id) OR (competition_results.placement IS excluded.placement AND competition_results.result_text=excluded.result_text AND competition_results.is_winner=excluded.is_winner)',placement,description,Number(b.isWinner),Number(b.publicApproved),u.id,Date.now(),result[1],b.userId)}catch{return j({error:'result_conflict'},409,h)}
  if(!changed(r))return j({error:'participant_missing_or_awarded'},409,h);await audit(db,u,'competition_result',result[1]);return j({ok:true},200,h);
 }
 const award=p.match(/^\/api\/admin\/competitions\/([a-f0-9-]{36})\/awards$/i);
 if(award&&m==='POST'){
  const b=await readBody(req),reason=clean(b.reason,300),key=req.headers.get('Idempotency-Key')?.toLowerCase();
  if(!uuid(b.userId)||!Number.isInteger(b.points)||b.points<1||b.points>1000||!reason)return j({error:'invalid_award'},400,h);
  if(!uuid(key))return j({error:'idempotency_key_required'},400,h);
  const prior=await first(db,'SELECT competition_id,user_id,points,reason,awarded_by_user_id FROM competition_awards WHERE id=?',key);
  if(prior)return prior.competition_id===award[1]&&prior.user_id===b.userId&&prior.points===b.points&&prior.reason===reason&&prior.awarded_by_user_id===u.id?j({ok:true,duplicate:true},200,h):j({error:'idempotency_conflict'},409,h);
  const r=await run(db,'INSERT OR IGNORE INTO competition_awards(id,competition_id,user_id,points,reason,awarded_by_user_id,created_at_ms) SELECT ?,r.competition_id,r.user_id,?,?,?,? FROM competition_results r WHERE r.competition_id=? AND r.user_id=? AND r.is_winner=1',key,b.points,reason,u.id,Date.now(),award[1],b.userId);
  if(!changed(r))return j({error:'award_exists_or_ineligible'},409,h);return j({ok:true,balance:await balance(db,b.userId)},201,h);
 }
 if(p==='/api/admin/leaderboard'&&m==='GET')return j({leaders:await all(db,'SELECT u.id,u.username,COALESCE(SUM(t.delta),0) AS points FROM users u LEFT JOIN point_transactions t ON t.user_id=u.id GROUP BY u.id ORDER BY points DESC LIMIT 100')},200,h);
 if(p==='/api/admin/maintenance'&&m==='POST'){const now=Date.now();await run(db,'DELETE FROM user_sessions WHERE expires_at_ms<?',now);await run(db,'DELETE FROM attendance_observations WHERE received_ms<?',now-90*86400000);await run(db,'DELETE FROM attendance_sessions WHERE start_ms<? AND end_ms IS NOT NULL',now-365*86400000);await run(db,'DELETE FROM auth_limits WHERE window_start_ms<?',now-86400000);await run(db,'DELETE FROM request_limits WHERE last_request_at<?',now-86400000);await audit(db,u,'maintenance','retention');return j({ok:true},200,h)}
 return j({error:'not_found'},404,h);
 }catch(e){if(e?.status)return j({error:e.code},e.status,h);console.error('radio_worker_error',{method:m,path:p,name:e?.name||'Error'});return j({error:'internal_error'},500,h)}}};
