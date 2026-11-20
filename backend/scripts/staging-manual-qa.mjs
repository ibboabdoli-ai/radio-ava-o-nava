// Bounded QA against the one approved staging Worker. Reads existing ignored
// synthetic accounts locally; never prints passwords, cookies or response bodies.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const origin='https://ava-radio-staging.ibbo-abdoli.workers.dev';
async function checkAssets(){
 for(const path of ['/v2/radio-club.html','/v2/competition-ui.js','/competition.html']){
  let res;try{res=await fetch(origin+path,{redirect:'follow'})}catch{throw Error('Staging asset request failed at '+path)}
  assert.equal(new URL(res.url).origin,origin);assert.equal(res.status,200);
 }
}
if(process.argv.includes('--assets-only')){await checkAssets();console.log(JSON.stringify({staging:origin,assets:3,redirects:'same-origin only'}));process.exit(0)}
if(!process.argv.includes('--mutate-synthetic'))throw Error('Pass --mutate-synthetic to authorize bounded QA writes; use --assets-only for read-only asset checks.');
const accounts=JSON.parse(await readFile(new URL('../.wrangler/staging-qa-credentials.json',import.meta.url),'utf8'));
assert.ok(Array.isArray(accounts)&&accounts.length>=2);
async function call(path,{method='GET',data,cookie,key,requestOrigin=origin}={}){
 const headers={Origin:requestOrigin};if(cookie)headers.Cookie=cookie;if(key)headers['Idempotency-Key']=key;if(data!==undefined)headers['Content-Type']='application/json';
 let res;try{res=await fetch(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),redirect:'error'})}catch{throw Error('Staging request failed at '+method+' '+path)}
 let body={};try{body=await res.json()}catch{}return {status:res.status,body,cookie:res.headers.get('set-cookie')};
}
const health=await call('/health');assert.equal(health.status,200);assert.equal(health.body.configured,true);assert.equal(health.body.registrationEnabled,false);assert.equal(health.body.attendanceObserverEnabled,false);
assert.equal((await call('/api/auth/register',{method:'POST',data:{}})).status,503);
assert.equal((await call('/api/internal/attendance',{method:'POST',data:{}})).status,503);
assert.equal((await call('/health',{requestOrigin:'https://untrusted.example'})).status,403);
assert.equal((await call('/api/admin/competitions')).status,401);
const publicBefore=await call('/api/competitions');assert.equal(publicBefore.status,200);
const signed=[];
for(const record of accounts){
 const response=await call('/api/auth/login',{method:'POST',data:{username:record.username,password:record.password}});
 assert.equal(response.status,200);assert.ok(response.cookie?.startsWith('radio_session='));
 signed.push({id:response.body.user.id,username:record.username,role:response.body.user.role,cookie:response.cookie.split(';')[0]});
}
const admin=signed.find(x=>x.role==='admin'),listener=signed.find(x=>x.role==='listener');assert.ok(admin&&listener);
assert.equal((await call('/api/admin/users',{cookie:listener.cookie})).status,403);
const accountBefore=await call('/api/me',{cookie:listener.cookie});assert.equal(accountBefore.status,200);const start=accountBefore.body.user.balance;
const endpoint='/api/admin/users/'+listener.id+'/adjust-points',creditKey=crypto.randomUUID(),debitKey=crypto.randomUUID();
const credit=await call(endpoint,{method:'POST',data:{delta:1,note:'staging synthetic QA credit'},cookie:admin.cookie,key:creditKey});assert.equal(credit.status,200);assert.equal(credit.body.balance,start+1);
const repeat=await call(endpoint,{method:'POST',data:{delta:1,note:'staging synthetic QA credit'},cookie:admin.cookie,key:creditKey});assert.equal(repeat.status,200);assert.equal(repeat.body.duplicate,true);assert.equal(repeat.body.balance,start+1);
if(start+1<1000)assert.equal((await call(endpoint,{method:'POST',data:{delta:-1000,note:'staging synthetic QA rejected debit'},cookie:admin.cookie,key:crypto.randomUUID()})).status,409);
const debit=await call(endpoint,{method:'POST',data:{delta:-1,note:'staging synthetic QA rollback'},cookie:admin.cookie,key:debitKey});assert.equal(debit.status,200);assert.equal(debit.body.balance,start);
const history=await call('/api/me/transactions',{cookie:listener.cookie});assert.equal(history.status,200);
assert.ok(history.body.transactions.some(x=>x.source_type==='manual'&&x.note==='staging synthetic QA credit'));
assert.ok(history.body.transactions.some(x=>x.source_type==='manual'&&x.note==='staging synthetic QA rollback'));
const adminHistory=await call('/api/admin/transactions',{cookie:admin.cookie});assert.equal(adminHistory.status,200);
assert.ok(adminHistory.body.transactions.some(x=>x.note==='staging synthetic QA credit'&&x.actor===admin.username));
const existing=(await call('/api/admin/competitions',{cookie:admin.cookie})).body.competitions.find(x=>x.title==='QA synthetic competition 2026-11-20'&&x.status==='draft');
const created=existing?null:await call('/api/admin/competitions',{method:'POST',data:{title:'QA synthetic competition 2026-11-20',description:'Staging-only draft; no real registrations or results',rules:['Synthetic QA only']},cookie:admin.cookie});
if(created)assert.equal(created.status,201);
const id=existing?.id||created?.body.id;assert.match(id,/^[a-f0-9-]{36}$/i);
const edited=await call('/api/admin/competitions/'+id,{method:'PATCH',data:{title:'QA synthetic competition 2026-11-20',description:'Staging-only edited draft; no real registrations or results',rules:['Synthetic QA only'],status:'draft',resultsPublic:false},cookie:admin.cookie});assert.equal(edited.status,200);
assert.equal((await call('/api/admin/competitions/'+id+'/participants',{method:'POST',data:{userId:listener.id},cookie:admin.cookie})).status,400);
assert.equal((await call('/api/admin/competitions/'+id+'/awards',{method:'POST',data:{userId:listener.id,points:1,reason:'must fail'},cookie:admin.cookie,key:crypto.randomUUID()})).status,409);
const publicAfter=await call('/api/competitions');assert.equal(publicAfter.status,200);assert.equal(JSON.stringify(publicAfter.body).includes(id),false);
const finalAccount=await call('/api/me',{cookie:listener.cookie});assert.equal(finalAccount.body.user.balance,start);
await checkAssets();
console.log(JSON.stringify({staging:origin,health:health.status,registrationDisabled:true,attendanceDisabled:true,wrongOrigin:403,listenerAdminAccess:403,manualCredit:credit.status,duplicate:repeat.body.duplicate,negativeDebit:409,manualDebit:debit.status,balanceRestored:true,adminAudit:true,competitionDraftReady:true,competitionEdited:edited.status,unverifiedParticipant:400,unearnedPrize:409,draftHiddenPublicly:true,assets:3}));
