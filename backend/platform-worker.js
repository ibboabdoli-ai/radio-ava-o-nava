import { normalizeObservation } from './attendance-engine.js';

const j=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const clean=(v,n)=>typeof v==='string'?v.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,n):'';
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async v=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));
const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
// Cloudflare Workers Web Crypto rejects PBKDF2 iteration counts above 100000.
const pbkdf=async(pass,salt)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},k,256)))};
const eq=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const changed=r=>Number(r?.meta?.changes||0);
const balance=async(db,id)=>Number((await first(db,'SELECT COALESCE(SUM(delta),0) AS balance FROM point_transactions WHERE user_id=?',id))?.balance||0);
const origin=env=>env.ALLOWED_ORIGIN||'https://radio.ibboabdoli.com';
const cors=(req,env)=>req.headers.get('Origin')===origin(env)?{'access-control-allow-origin':origin(env),'access-control-allow-credentials':'true','access-control-allow-methods':'GET, POST, PATCH, PUT, DELETE, OPTIONS','access-control-allow-headers':'Content-Type, Idempotency-Key, Authorization','vary':'Origin'}:{};
const cookie=t=>`radio_session=${t}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=604800`;
const readBody=async req=>{if(!req.headers.get('content-type')?.startsWith('application/json'))throw{status:415,code:'json_required'};if(Number(req.headers.get('content-length')||0)>8192)throw{status:413,code:'too_large'};const raw=await req.text();if(raw.length>8192)throw{status:413,code:'too_large'};try{return JSON.parse(raw)}catch{throw{status:400,code:'invalid_json'}}};
const session=async(req,db)=>{const t=req.headers.get('Cookie')?.match(/(?:^|;\s*)radio_session=([a-f0-9]{64})(?:;|$)/)?.[1];return t?first(db,'SELECT u.id,u.username,u.role,u.leaderboard_opt_in FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at_ms>?',await hash(t),Date.now()):null};
const profile=async(db,u)=>({id:u.id,username:u.username,role:u.role,leaderboardOptIn:!!u.leaderboard_opt_in,balance:await balance(db,u.id)});
const audit=(db,u,action,target,note='')=>run(db,'INSERT INTO admin_events(id,actor_user_id,action,target_id,note,created_at_ms) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),u.id,action,target,note,Date.now());
const rate=async(req,db,env)=>{const key=await hash(`${env.AUTH_RATE_SECRET||'local'}|${req.headers.get('CF-Connecting-IP')||'unknown'}`),now=Date.now();await run(db,'INSERT INTO auth_limits(client_hash,window_start_ms,attempts) VALUES(?,?,1) ON CONFLICT(client_hash) DO UPDATE SET window_start_ms=CASE WHEN window_start_ms<? THEN excluded.window_start_ms ELSE window_start_ms END,attempts=CASE WHEN window_start_ms<? THEN 1 ELSE attempts+1 END',key,now,now-900000,now-900000);return Number((await first(db,'SELECT attempts FROM auth_limits WHERE client_hash=?',key))?.attempts||0)<=20};

export default {async fetch(req,env){const h=cors(req,env),url=new URL(req.url),p=url.pathname,m=req.method;try{
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==origin(env))return j({error:'origin_not_allowed'},403,h);
 if(m==='OPTIONS')return new Response(null,{status:204,headers:h});
 if(p==='/health'&&m==='GET')return j({ok:true,configured:!!env.DB,featuresEnabled:env.RADIO_FEATURES_ENABLED==='true'},200,h);
 if(!env.DB||env.RADIO_FEATURES_ENABLED!=='true')return j({error:'service_disabled'},503,h);
 if(!env.ALLOWED_ORIGIN||!env.AUTH_RATE_SECRET)return j({error:'service_unconfigured'},503,h);
 if(!['GET','HEAD'].includes(m)&&req.headers.get('Origin')!==origin(env))return j({error:'origin_required'},403,h);
 const db=env.DB;
 if(p==='/api/auth/register'&&m==='POST'){
  if(env.REGISTRATION_ENABLED!=='true')return j({error:'registration_disabled'},503,h);
  if(!await rate(req,db,env))return j({error:'rate_limited'},429,h);
  const b=await readBody(req),username=clean(b.username,40).toLowerCase();
  if(!/^[a-z0-9_]{3,40}$/.test(username)||typeof b.password!=='string'||b.password.length<12||b.password.length>128)return j({error:'invalid_credentials'},400,h);
  const salt=token(),passwordHash=await pbkdf(b.password,salt);
  try{await run(db,'INSERT INTO users(id,username,password_salt,password_hash,created_at_ms) VALUES(?,?,?,?,?)',crypto.randomUUID(),username,salt,passwordHash,Date.now())}catch(e){if((await first(db,'SELECT id FROM users WHERE username=?',username)))return j({error:'username_unavailable'},409,h);throw e}
  return j({ok:true},201,h);
 }
 if(p==='/api/auth/login'&&m==='POST'){
  if(!await rate(req,db,env))return j({error:'rate_limited'},429,h);
  const b=await readBody(req),u=await first(db,'SELECT * FROM users WHERE username=?',clean(b.username,40).toLowerCase());
  const candidate=await pbkdf(typeof b.password==='string'?b.password.slice(0,128):'',u?.password_salt||'invalid-salt');
  if(!u||!eq(candidate,u.password_hash))return j({error:'invalid_credentials'},401,h);
  const t=token();await run(db,'INSERT INTO user_sessions(token_hash,user_id,expires_at_ms,created_at_ms) VALUES(?,?,?,?)',await hash(t),u.id,Date.now()+604800000,Date.now());return j({user:await profile(db,u)},200,{...h,'set-cookie':cookie(t)});
 }
 if(p==='/api/auth/logout'&&m==='POST'){const t=req.headers.get('Cookie')?.match(/(?:^|;\s*)radio_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(t)await run(db,'DELETE FROM user_sessions WHERE token_hash=?',await hash(t));return j({ok:true},200,{...h,'set-cookie':'radio_session=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0'})}
 if(p==='/api/catalog'&&m==='GET'){const q=`%${clean(url.searchParams.get('q'),80).replace(/[%_]/g,'')}%`;return j({songs:await all(db,'SELECT id,title,artist,cost FROM song_catalog WHERE active=1 AND (title LIKE ? OR artist LIKE ?) ORDER BY title LIMIT 50',q,q)},200,h)}
 if(p==='/api/queue'&&m==='GET')return j({queue:await all(db,"SELECT id,title,artist,queue_priority,created_at FROM song_requests WHERE status='approved' ORDER BY queue_priority DESC,created_at,id LIMIT 100")},200,h);
 if(p==='/api/leaderboard'&&m==='GET')return j({leaders:await all(db,'SELECT u.username AS name,COALESCE(SUM(t.delta),0) AS points FROM users u LEFT JOIN point_transactions t ON t.user_id=u.id WHERE u.leaderboard_opt_in=1 GROUP BY u.id ORDER BY points DESC,u.username LIMIT 50')},200,h);
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
 if(p==='/api/me'&&m==='PATCH'){const b=await readBody(req);if(typeof b.leaderboardOptIn!=='boolean')return j({error:'invalid_opt_in'},400,h);await run(db,'UPDATE users SET leaderboard_opt_in=? WHERE id=?',Number(b.leaderboardOptIn),u.id);return j({ok:true},200,h)}
 if(p==='/api/me/clubhouse-identity'&&m==='GET'){const linked=await first(db,'SELECT clubhouse_user_id FROM listener_identities WHERE user_id=?',u.id);return j({linked:!!linked,clubhouseUserId:linked?.clubhouse_user_id||null},200,h)}
 if(p==='/api/me/clubhouse-identity'&&m==='DELETE'){await run(db,'DELETE FROM listener_identities WHERE user_id=?',u.id);return j({ok:true},200,h)}
 if(p==='/api/me/transactions'&&m==='GET')return j({transactions:await all(db,'SELECT id,delta,kind,note,created_at_ms FROM point_transactions WHERE user_id=? ORDER BY created_at_ms DESC LIMIT 100',u.id)},200,h);
 if(p==='/api/me/attendance'&&m==='GET')return j({sessions:await all(db,'SELECT room_id,start_ms,last_seen_ms,end_ms,credited_seconds FROM attendance_sessions WHERE user_id=? ORDER BY start_ms DESC LIMIT 100',u.id)},200,h);
 if(p==='/api/me/requests'&&m==='GET')return j({requests:await all(db,'SELECT id,title,artist,status,cost,created_at FROM song_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100',u.id)},200,h);
 const cancel=p.match(/^\/api\/me\/requests\/([a-f0-9-]{36})$/i);if(cancel&&m==='PATCH'){const r=await run(db,"UPDATE song_requests SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=? AND status IN ('pending','approved')",cancel[1],u.id);return changed(r)?j({ok:true},200,h):j({error:'not_cancellable'},409,h)}
 if(p==='/api/requests'&&m==='POST'){
  const b=await readBody(req),songId=clean(b.catalogSongId,100),key=req.headers.get('Idempotency-Key')||'';if(!/^[a-f0-9-]{36}$/i.test(key))return j({error:'idempotency_key_required'},400,h);
  const prior=await first(db,'SELECT id,status,catalog_song_id FROM song_requests WHERE user_id=? AND idempotency_key=?',u.id,key);if(prior)return prior.catalog_song_id===songId?j({id:prior.id,status:prior.status,duplicate:true},200,h):j({error:'idempotency_conflict'},409,h);
  const song=await first(db,'SELECT * FROM song_catalog WHERE id=? AND active=1',songId);if(!song)return j({error:'song_unavailable'},404,h);
  const id=crypto.randomUUID();try{await run(db,'INSERT INTO song_requests(id,title,artist,requested_by,user_id,catalog_song_id,cost,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',id,song.title,song.artist,u.username,u.id,song.id,song.cost,key)}catch{return j({error:'duplicate_active_request'},409,h)}return j({id,status:'pending',cost:song.cost},201,h);
 }
 if(u.role!=='admin')return j({error:'forbidden'},403,h);
 if(p==='/api/admin/catalog'&&m==='POST'){const b=await readBody(req),title=clean(b.title,120),artist=clean(b.artist,120),source=clean(b.sourceUrl,500),note=clean(b.rightsNote,500),cost=Number(b.cost);let sourceOk=false;try{const parsed=new URL(source);sourceOk=parsed.protocol==='https:'&&parsed.hostname==='audius.co'&&!parsed.username&&!parsed.password}catch{}if(!title||!artist||!sourceOk||!note||b.rightsConfirmed!==true||b.playableConfirmed!==true||!Number.isInteger(cost)||cost<1||cost>1000)return j({error:'invalid_catalog_entry'},400,h);const id=crypto.randomUUID();await run(db,'INSERT INTO song_catalog(id,title,artist,source_url,rights_note,cost,playable_checked_at_ms,created_by_user_id,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?)',id,title,artist,source,note,cost,Date.now(),u.id,Date.now());await audit(db,u,'catalog_create',id);return j({id},201,h)}
 const catalog=p.match(/^\/api\/admin\/catalog\/([a-f0-9-]{36})$/i);if(catalog&&m==='PATCH'){const b=await readBody(req);if(typeof b.active!=='boolean')return j({error:'invalid_active'},400,h);const r=await run(db,'UPDATE song_catalog SET active=? WHERE id=?',Number(b.active),catalog[1]);if(!changed(r))return j({error:'not_found'},404,h);await audit(db,u,'catalog_active',catalog[1],String(b.active));return j({ok:true},200,h)}
 if(p==='/api/admin/requests'&&m==='GET'){const status=url.searchParams.get('status')||'pending';if(!['pending','approved','rejected','cancelled','played'].includes(status))return j({error:'invalid_status'},400,h);return j({requests:await all(db,'SELECT id,title,artist,requested_by,status,cost,queue_priority,created_at FROM song_requests WHERE status=? ORDER BY queue_priority DESC,created_at LIMIT 100',status)},200,h)}
 const request=p.match(/^\/api\/admin\/requests\/([a-f0-9-]{36})$/i);if(request&&m==='PATCH'){
  const b=await readBody(req),id=request[1];if(b.status==='approved'){const legacy=await run(db,"UPDATE song_requests SET status='approved',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending' AND user_id IS NULL AND cost=0",id);if(changed(legacy)){await audit(db,u,'legacy_request_approve',id);return j({ok:true,status:'approved',legacy:true},200,h)}const r=await run(db,"INSERT OR IGNORE INTO point_transactions(id,user_id,delta,kind,source_id,request_id,created_at_ms) SELECT ?,r.user_id,-r.cost,'request_spend',r.id,r.id,? FROM song_requests r WHERE r.id=? AND r.status='pending' AND r.user_id IS NOT NULL AND r.cost>0 AND (SELECT COALESCE(SUM(delta),0) FROM point_transactions WHERE user_id=r.user_id)>=r.cost",crypto.randomUUID(),Date.now(),id);if(!changed(r))return j({error:'insufficient_points_or_invalid_state'},409,h);await audit(db,u,'request_approve',id);return j({ok:true,status:'approved'},200,h)}
  if(b.status==='rejected'||b.status==='played'){const sql=b.status==='rejected'?"UPDATE song_requests SET status='rejected',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status IN ('pending','approved')":"UPDATE song_requests SET status='played',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='approved'";const r=await run(db,sql,id);if(!changed(r))return j({error:'invalid_state'},409,h);await audit(db,u,`request_${b.status}`,id);return j({ok:true,status:b.status},200,h)}
  if(Number.isInteger(b.queuePriority)&&b.queuePriority>=-100&&b.queuePriority<=100){const r=await run(db,"UPDATE song_requests SET queue_priority=? WHERE id=? AND status='approved'",b.queuePriority,id);if(!changed(r))return j({error:'invalid_state'},409,h);await audit(db,u,'request_priority',id,String(b.queuePriority));return j({ok:true},200,h)}return j({error:'invalid_action'},400,h);
 }
 if(p==='/api/admin/users'&&m==='GET')return j({users:await all(db,'SELECT u.id,u.username,u.role,u.leaderboard_opt_in,COALESCE(SUM(t.delta),0) AS balance FROM users u LEFT JOIN point_transactions t ON t.user_id=u.id GROUP BY u.id ORDER BY u.created_at_ms DESC LIMIT 100')},200,h);
 const identity=p.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/clubhouse-identity$/i);if(identity&&m==='PUT'){const b=await readBody(req),id=clean(b.clubhouseUserId,100);if(b.consentConfirmed!==true||!/^[a-zA-Z0-9_:-]{2,100}$/.test(id))return j({error:'consent_or_id_required'},400,h);if(!await first(db,'SELECT id FROM users WHERE id=?',identity[1]))return j({error:'user_not_found'},404,h);try{await run(db,'INSERT INTO listener_identities(clubhouse_user_id,user_id,consent_at_ms,mapped_by_user_id) VALUES(?,?,?,?)',id,identity[1],Date.now(),u.id)}catch{return j({error:'identity_already_mapped'},409,h)}await audit(db,u,'identity_map',identity[1]);return j({ok:true},200,h)}
 const adjust=p.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/adjust-points$/i);if(adjust&&m==='POST'){const b=await readBody(req),delta=Number(b.delta),note=clean(b.note,300),id=crypto.randomUUID();if(!Number.isInteger(delta)||!delta||Math.abs(delta)>1000||!note)return j({error:'invalid_adjustment'},400,h);const r=await run(db,"INSERT INTO point_transactions(id,user_id,delta,kind,source_id,note,created_at_ms) SELECT ?,u.id,?,'admin_adjustment',?,?,? FROM users u WHERE u.id=? AND (SELECT COALESCE(SUM(delta),0) FROM point_transactions WHERE user_id=u.id)+?>=0",id,delta,id,note,Date.now(),adjust[1],delta);if(!changed(r))return j({error:'user_missing_or_negative_balance'},409,h);await audit(db,u,'points_adjust',adjust[1],`${delta}: ${note}`);return j({ok:true},200,h)}
 if(p==='/api/admin/leaderboard'&&m==='GET')return j({leaders:await all(db,'SELECT u.id,u.username,COALESCE(SUM(t.delta),0) AS points FROM users u LEFT JOIN point_transactions t ON t.user_id=u.id GROUP BY u.id ORDER BY points DESC LIMIT 100')},200,h);
 if(p==='/api/admin/maintenance'&&m==='POST'){const now=Date.now();await run(db,'DELETE FROM user_sessions WHERE expires_at_ms<?',now);await run(db,'DELETE FROM attendance_observations WHERE received_ms<?',now-90*86400000);await run(db,'DELETE FROM attendance_sessions WHERE start_ms<? AND end_ms IS NOT NULL',now-365*86400000);await run(db,'DELETE FROM auth_limits WHERE window_start_ms<?',now-86400000);await run(db,'DELETE FROM request_limits WHERE last_request_at<?',now-86400000);await audit(db,u,'maintenance','retention');return j({ok:true},200,h)}
 return j({error:'not_found'},404,h);
 }catch(e){if(e?.status)return j({error:e.code},e.status,h);console.error('radio_worker_error',{method:m,path:p,name:e?.name||'Error'});return j({error:'internal_error'},500,h)}}};
