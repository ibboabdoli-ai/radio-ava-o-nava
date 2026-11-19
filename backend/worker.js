// Cloudflare Worker + D1. No player/stream changes. Secrets are NEVER exposed to visitors.
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const input=(value,max)=>typeof value==='string'?Array.from(value.trim()).filter(ch=>ch.charCodeAt(0)>=32&&ch.charCodeAt(0)!==127).join('').slice(0,max):'';
const statuses=new Set(['pending','approved','rejected','played']);
function cors(req,env){
 const origin=req.headers.get('Origin');
 const allowed=env.ALLOWED_ORIGIN||'https://radio.ibboabdoli.com';
 return origin===allowed?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'GET, POST, PATCH, OPTIONS','access-control-allow-headers':'Content-Type, Authorization'}:{};
}
function isAdmin(req,env){
 const bearer=req.headers.get('Authorization')||'';
 return Boolean(env.ADMIN_TOKEN&&bearer===`Bearer ${env.ADMIN_TOKEN}`);
}
async function fingerprint(ip,secret){
 const data=new TextEncoder().encode(secret+'|'+ip);
 const bytes=await crypto.subtle.digest('SHA-256',data);
 return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export default {
 async fetch(req,env){
  const headers=cors(req,env);
  const origin=req.headers.get('Origin');
  if(origin&&origin!==(env.ALLOWED_ORIGIN||'https://radio.ibboabdoli.com'))return json({error:'origin_not_allowed'},403,headers);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!env.DB)return json({error:'service_unconfigured'},503,headers);
  const url=new URL(req.url);
  if(url.pathname==='/health'&&req.method==='GET')return json({ok:true},200,headers);
  if(url.pathname==='/api/queue'&&req.method==='GET'){
   const rows=await env.DB.prepare("SELECT id,title,artist,created_at FROM song_requests WHERE status='approved' ORDER BY created_at ASC LIMIT 50").all();
   return json({queue:rows.results},200,headers);
  }
  if(url.pathname==='/api/requests'&&req.method==='POST'){
   if(!env.IP_HASH_SECRET)return json({error:'service_unconfigured'},503,headers);
   if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415,headers);
   if(Number(req.headers.get('content-length')||0)>4096)return json({error:'too_large'},413,headers);
   let payload;
   try{payload=await req.json();}catch{return json({error:'invalid_json'},400,headers);}
   const title=input(payload?.title,120),artist=input(payload?.artist,120),requestedBy=input(payload?.requestedBy,60);
   if(!title||!artist||!requestedBy)return json({error:'missing_fields'},400,headers);
   const ip=req.headers.get('CF-Connecting-IP')||'unknown';
   const hash=await fingerprint(ip,env.IP_HASH_SECRET);
   const now=Date.now(),id=crypto.randomUUID();
   // D1 atomic conditional upsert throttles repeated submissions across isolates.
   const rate=await env.DB.prepare("INSERT INTO request_limits (client_hash,last_request_at) VALUES (?,?) ON CONFLICT(client_hash) DO UPDATE SET last_request_at=excluded.last_request_at WHERE last_request_at <= ?").bind(hash,now,now-60000).run();
   if(rate.meta.changes===0)return json({error:'rate_limited'},429,headers);
   await env.DB.prepare("INSERT INTO song_requests (id,title,artist,requested_by) VALUES (?,?,?,?)").bind(id,title,artist,requestedBy).run();
   return json({id,status:'pending',message:'درخواست ثبت شد و منتظر تایید مدیر است'},201,headers);
  }
  if(url.pathname==='/api/admin/requests'&&req.method==='GET'){
   if(!isAdmin(req,env))return json({error:'unauthorized'},401,headers);
   const status=url.searchParams.get('status')||'pending';
   if(!statuses.has(status))return json({error:'invalid_status'},400,headers);
   const rows=await env.DB.prepare('SELECT id,title,artist,requested_by,status,created_at FROM song_requests WHERE status=? ORDER BY created_at ASC LIMIT 100').bind(status).all();
   return json({requests:rows.results},200,headers);
  }
  const match=url.pathname.match(new RegExp('^/api/admin/requests/([0-9a-f-]{36})$','i'));
  if(match&&req.method==='PATCH'){
   if(!isAdmin(req,env))return json({error:'unauthorized'},401,headers);
   let body;try{body=await req.json();}catch{return json({error:'invalid_json'},400,headers);}
   if(!['approved','rejected','played'].includes(body?.status))return json({error:'invalid_status'},400,headers);
   const result=await env.DB.prepare("UPDATE song_requests SET status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(body.status,match[1]).run();
   if(!result.meta.changes)return json({error:'not_found'},404,headers);
   return json({ok:true,status:body.status},200,headers);
  }
  return json({error:'not_found'},404,headers);
 }
};
