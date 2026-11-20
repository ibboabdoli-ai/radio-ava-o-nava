import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { testDatabase } from './helpers.mjs';

const origin='https://staging.example.test';
const make=()=>({DB:testDatabase(),RADIO_FEATURES_ENABLED:'true',REGISTRATION_ENABLED:'true',ALLOWED_ORIGIN:origin,AUTH_RATE_SECRET:'mock-only-secret'});
async function call(env,path,data,cookie,extra={}){
 const headers={Origin:origin,'content-type':'application/json',...extra};if(cookie)headers.Cookie=cookie;
 const res=await worker.fetch(new Request(origin+path,{method:'POST',headers,body:JSON.stringify(data)}),env);
 return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')};
}
const pw='invented-long-password-123';

test('strong registration, session cookies, password change, and session revocation',async()=>{
 const env=make(),db=env.DB.sqlite;
 assert.equal((await call(env,'/api/auth/register',{username:'alice',password:pw})).status,201);
 const row=db.prepare('SELECT password_salt,password_hash FROM users WHERE username=?').get('alice');
 assert.match(row.password_hash,/^scrypt_n8192_r8_p10\$[a-f0-9]{64}$/);
 assert.equal(row.password_salt.length,64);
 const login=await call(env,'/api/auth/login',{username:'alice',password:pw});
 assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/Secure/);assert.match(login.cookie,/SameSite=Lax/);
 const second=await call(env,'/api/auth/login',{username:'alice',password:pw});assert.equal(second.status,200);
 const a=login.cookie.split(';')[0],b=second.cookie.split(';')[0];
 assert.equal((await call(env,'/api/me/recovery-code',{currentPassword:pw},a)).status,200);
 assert.equal((await call(env,'/api/me/password',{currentPassword:'wrong',newPassword:'new-invented-password-123'},a)).status,401);
 const change=await call(env,'/api/me/password',{currentPassword:pw,newPassword:'new-invented-password-123'},a);
 assert.equal(change.status,200);assert.match(change.cookie,/Max-Age=0/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account_recovery').get().n,0);
 for(const cookie of [a,b]){const res=await worker.fetch(new Request(origin+'/api/me',{headers:{Origin:origin,Cookie:cookie}}),env);assert.equal(res.status,401)}
 assert.equal((await call(env,'/api/auth/login',{username:'alice',password:pw})).status,401);
 assert.equal((await call(env,'/api/auth/login',{username:'alice',password:'new-invented-password-123'})).status,200);
});

test('concurrent recovery accepts a one-time code exactly once',async()=>{
 const env=make();await call(env,'/api/auth/register',{username:'carol',password:pw});
 const login=await call(env,'/api/auth/login',{username:'carol',password:pw});
 const code=(await call(env,'/api/me/recovery-code',{currentPassword:pw},login.cookie.split(';')[0])).body.recoveryCode;
 const passwords=['parallel-password-first-123','parallel-password-second-123'];
 const results=await Promise.all(passwords.map(newPassword=>call(env,'/api/auth/recover',{username:'carol',recoveryCode:code,newPassword})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,401]);
 const winner=passwords[results.findIndex(x=>x.status===200)];
 assert.equal((await call(env,'/api/auth/login',{username:'carol',password:winner})).status,200);
});

test('one-time recovery code rotates, recovers, and invalidates sessions',async()=>{
 const env=make(),db=env.DB.sqlite;
 await call(env,'/api/auth/register',{username:'bobbb',password:pw});
 const login=await call(env,'/api/auth/login',{username:'bobbb',password:pw}),cookie=login.cookie.split(';')[0];
 assert.equal((await call(env,'/api/me/recovery-code',{currentPassword:'wrong'},cookie)).status,401);
 const first=await call(env,'/api/me/recovery-code',{currentPassword:pw},cookie);
 assert.match(first.body.recoveryCode,/^[a-f0-9]{64}$/);
 const second=await call(env,'/api/me/recovery-code',{currentPassword:pw},cookie);
 assert.notEqual(first.body.recoveryCode,second.body.recoveryCode);
 assert.notEqual(db.prepare('SELECT code_hash FROM account_recovery').get().code_hash,second.body.recoveryCode);
 assert.equal((await call(env,'/api/auth/recover',{username:'bobbb',recoveryCode:first.body.recoveryCode,newPassword:'another-invented-password-123'})).status,401);
 assert.equal((await call(env,'/api/auth/recover',{username:'bobbb',recoveryCode:second.body.recoveryCode,newPassword:'another-invented-password-123'})).status,200);
 assert.equal((await call(env,'/api/auth/recover',{username:'bobbb',recoveryCode:second.body.recoveryCode,newPassword:'third-invented-password-123'})).status,401);
 const me=await worker.fetch(new Request(origin+'/api/me',{headers:{Origin:origin,Cookie:cookie}}),env);assert.equal(me.status,401);
 assert.equal((await call(env,'/api/auth/login',{username:'bobbb',password:'another-invented-password-123'})).status,200);
});

test('legacy 100k hash upgrades on successful login, and auth rejects CSRF and brute force',async()=>{
 const env=make(),db=env.DB.sqlite,salt='legacy-test-salt';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 const legacy=Buffer.from(bits).toString('hex');
 db.prepare('INSERT INTO users(id,username,password_salt,password_hash,created_at_ms) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),'legacy',salt,legacy,Date.now());
 assert.equal((await call(env,'/api/auth/login',{username:'legacy',password:'wrong'})).status,401);
 assert.equal(db.prepare('SELECT password_hash FROM users WHERE username=?').get('legacy').password_hash,legacy);
 assert.equal((await call(env,'/api/auth/login',{username:'legacy',password:pw})).status,200);
 assert.match(db.prepare('SELECT password_hash FROM users WHERE username=?').get('legacy').password_hash,/^scrypt_n8192_r8_p10\$/);
 const csrf=await worker.fetch(new Request(origin+'/api/auth/login',{method:'POST',headers:{Origin:'https://evil.example','content-type':'application/json'},body:'{}'}),env);assert.equal(csrf.status,403);
 for(let i=0;i<10;i++)assert.equal((await call(env,'/api/auth/login',{username:'target',password:'wrong'},null,{'CF-Connecting-IP':`192.0.2.${i}`})).status,401);
 assert.equal((await call(env,'/api/auth/login',{username:'target',password:'wrong'},null,{'CF-Connecting-IP':'192.0.2.99'})).status,429);
});
