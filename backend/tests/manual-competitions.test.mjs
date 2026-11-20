import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import {testDatabase} from './helpers.mjs';

const base='https://api.example.test',site='https://radio.ibboabdoli.com';
const make=()=>({DB:testDatabase(),RADIO_FEATURES_ENABLED:'true',REGISTRATION_ENABLED:'true',ATTENDANCE_OBSERVER_ENABLED:'false',ALLOWED_ORIGIN:site,AUTH_RATE_SECRET:'mock-only-secret'});
async function call(env,path,method='GET',data,cookie,key){
 const headers={Origin:site};if(cookie)headers.Cookie=cookie;if(data!==undefined)headers['content-type']='application/json';if(key)headers['Idempotency-Key']=key;
 const res=await worker.fetch(new Request(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
 return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')};
}
async function account(env,name,admin=false){
 assert.equal((await call(env,'/api/auth/register','POST',{username:name,password:'long-test-password-123'})).status,201);
 if(admin)env.DB.sqlite.prepare("UPDATE users SET role='admin' WHERE username=?").run(name);
 const login=await call(env,'/api/auth/login','POST',{username:name,password:'long-test-password-123'});
 assert.equal(login.status,200);return {id:login.body.user.id,cookie:login.cookie.split(';')[0]};
}
const adjust=(env,admin,user,delta,note,key)=>call(env,`/api/admin/users/${user.id}/adjust-points`,'POST',{delta,note},admin.cookie,key);
const competition=(env,admin)=>call(env,'/api/admin/competitions','POST',{title:'مسابقهٔ آزمایشی',description:'فقط دادهٔ ساختگی',rules:['قانون آزمایشی']},admin.cookie);

test('manual points require admin, reason and idempotency; balance stays nonnegative',async()=>{
 const env=make(),admin=await account(env,'qaadmin',true),alice=await account(env,'qauser1');
 const path=`/api/admin/users/${alice.id}/adjust-points`,key=crypto.randomUUID();
 assert.equal((await adjust(env,alice,alice,5,'test',key)).status,403);
 assert.equal((await adjust(env,admin,alice,5,'',key)).status,400);
 assert.equal((await adjust(env,admin,alice,5,'test')).status,400);
 const concurrent=await Promise.all([adjust(env,admin,alice,5,'manual mock credit',key),adjust(env,admin,alice,5,'manual mock credit',key)]);
 assert.deepEqual(concurrent.map(x=>x.status),[200,200]);
 assert.equal(concurrent.filter(x=>x.body.duplicate).length,1);
 assert.equal((await call(env,'/api/me','GET',undefined,alice.cookie)).body.user.balance,5);
 assert.equal((await adjust(env,admin,alice,6,'conflicting reuse',key)).status,409);
 assert.equal((await adjust(env,admin,alice,-6,'too much',crypto.randomUUID())).status,409);
 assert.equal((await adjust(env,admin,alice,-3,'authorized deduction',crypto.randomUUID())).body.balance,2);
 const history=(await call(env,'/api/me/transactions','GET',undefined,alice.cookie)).body.transactions;
 assert.equal(history.length,2);assert.ok(history.every(x=>x.source_type==='manual'));
 const row=env.DB.sqlite.prepare("SELECT actor_user_id,note,source_type,created_at_ms FROM point_transactions WHERE source_id=?").get(key);
 assert.equal(row.actor_user_id,admin.id);assert.equal(row.note,'manual mock credit');assert.equal(row.source_type,'manual');assert.ok(row.created_at_ms>0);
 assert.equal(env.DB.sqlite.prepare("SELECT count(*) AS n FROM admin_events WHERE action='points_adjust'").get().n,2);
 const noOrigin=await worker.fetch(new Request(base+path,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID(),Cookie:admin.cookie},body:JSON.stringify({delta:1,note:'csrf'})}),env);
 assert.equal(noOrigin.status,403);
});

test('concurrent distinct manual deductions cannot double spend one balance',async()=>{
 const env=make(),admin=await account(env,'qaadmin3',true),alice=await account(env,'qauser4');
 assert.equal((await adjust(env,admin,alice,5,'synthetic starting balance',crypto.randomUUID())).status,200);
 const results=await Promise.all([adjust(env,admin,alice,-4,'first deduction',crypto.randomUUID()),adjust(env,admin,alice,-4,'second deduction',crypto.randomUUID())]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 assert.equal((await call(env,'/api/me','GET',undefined,alice.cookie)).body.user.balance,1);
 assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM point_transactions WHERE user_id=? AND delta=-4").get(alice.id).n,1);
});

test('competition follows approved form, keeps participants private and awards once',async()=>{
 const env=make(),admin=await account(env,'qaadmin2',true),alice=await account(env,'qauser2'),bob=await account(env,'qauser3');
 const created=await competition(env,admin);assert.equal(created.status,201);const id=created.body.id;
 assert.equal((await call(env,'/api/competitions')).body.competitions.length,0);
 assert.equal((await call(env,'/api/admin/competitions','GET',undefined,alice.cookie)).status,403);
 assert.equal((await call(env,`/api/admin/competitions/${id}/participants`,'POST',{userId:alice.id},admin.cookie)).status,400);
 assert.equal((await call(env,`/api/admin/competitions/${id}/participants`,'POST',{userId:alice.id,verifiedFromApprovedForm:true},admin.cookie)).status,201);
 assert.equal((await call(env,`/api/admin/competitions/${id}/participants`,'POST',{userId:alice.id,verifiedFromApprovedForm:true},admin.cookie)).status,409);
 assert.equal((await call(env,`/api/admin/competitions/${id}/results`,'POST',{userId:bob.id,placement:1,resultText:'برندهٔ آزمایشی',isWinner:true,publicApproved:true},admin.cookie)).status,409);
 const result={userId:alice.id,placement:1,resultText:'نتیجهٔ آزمایشی',isWinner:true,publicApproved:true};
 assert.equal((await call(env,`/api/admin/competitions/${id}/results`,'POST',result,admin.cookie)).status,200);
 assert.equal((await call(env,`/api/admin/competitions/${id}`,'PATCH',{title:'مسابقهٔ آزمایشی',description:'فقط دادهٔ ساختگی',rules:['قانون آزمایشی'],status:'published',resultsPublic:true},admin.cookie)).status,200);
 let publicData=(await call(env,'/api/competitions')).body.competitions;
 assert.equal(publicData.length,1);assert.equal(publicData[0].results.length,0);
 assert.equal(JSON.stringify(publicData).includes(alice.id),false);
 assert.equal(JSON.stringify(publicData).includes('qauser2'),false);
 const key=crypto.randomUUID(),prize={userId:alice.id,points:7,reason:'جایزهٔ آزمایشی'};
 const awards=await Promise.all([call(env,`/api/admin/competitions/${id}/awards`,'POST',prize,admin.cookie,key),call(env,`/api/admin/competitions/${id}/awards`,'POST',prize,admin.cookie,key)]);
 assert.deepEqual(awards.map(x=>x.status).sort(),[200,201]);
 assert.equal((await call(env,`/api/admin/competitions/${id}/awards`,'POST',prize,admin.cookie,crypto.randomUUID())).status,409);
 assert.equal((await call(env,'/api/me','GET',undefined,alice.cookie)).body.user.balance,7);
 assert.equal(env.DB.sqlite.prepare("SELECT count(*) AS n FROM point_transactions WHERE source_type='competition_prize'").get().n,1);
 assert.equal((await call(env,`/api/admin/competitions/${id}/results`,'POST',{...result,resultText:'changed'},admin.cookie)).status,409);
 assert.equal((await call(env,`/api/admin/competitions/${id}/results`,'POST',{...result,publicNameConsent:true},admin.cookie)).status,400);
 assert.equal((await call(env,`/api/me/competitions/${id}/consent`,'PATCH',{publicNameConsent:false},bob.cookie)).status,404);
 assert.equal((await call(env,`/api/me/competitions/${id}/consent`,'PATCH',{publicNameConsent:true},alice.cookie)).status,200);
 assert.equal((await call(env,'/api/me/competition-results','GET',undefined,alice.cookie)).body.results[0].public_name_consent,1);
 publicData=(await call(env,'/api/competitions')).body.competitions;
 assert.equal(publicData[0].results[0].displayName,'qauser2');
 assert.equal((await call(env,`/api/me/competitions/${id}/consent`,'PATCH',{publicNameConsent:false},alice.cookie)).status,200);
 assert.equal((await call(env,'/api/competitions')).body.competitions[0].results.length,0);
 assert.equal((await call(env,'/api/me/attendance','GET',undefined,alice.cookie)).body.sessions.length,0);
});
