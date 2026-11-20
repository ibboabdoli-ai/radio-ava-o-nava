import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { testDatabase } from './helpers.mjs';

const origin='https://staging.example.test';
const password='synthetic-test-password-123';
const env=()=>({DB:testDatabase(),RADIO_FEATURES_ENABLED:'true',REGISTRATION_ENABLED:'true',ALLOWED_ORIGIN:origin,AUTH_RATE_SECRET:'test-only-rate-secret'});
async function post(e,path,data,cookie){
 const headers={Origin:origin,'content-type':'application/json'};if(cookie)headers.Cookie=cookie;
 const response=await worker.fetch(new Request(origin+path,{method:'POST',headers,body:JSON.stringify(data)}),e);
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
}
async function user(e,username){
 assert.equal((await post(e,'/api/auth/register',{username,password})).status,201);
 const login=await post(e,'/api/auth/login',{username,password});assert.equal(login.status,200);
 return login.cookie.split(';')[0];
}
function beforeWrite(e,fragment){
 const original=e.DB.prepare.bind(e.DB);let fired=false;
 e.DB.prepare=(sql)=>{
  const statement=original(sql);
  if(sql.includes(fragment)){
   const run=statement.run.bind(statement);
   statement.run=async()=>{
    if(!fired){fired=true;e.DB.sqlite.prepare('UPDATE users SET password_hash=? WHERE username=?').run(`scrypt_n8192_r8_p10$${'a'.repeat(64)}`,'raceuser')}
    return run();
   };
  }
  return statement;
 };
 return ()=>fired;
}

test('login cannot issue a session after a concurrent password reset',async()=>{
 const e=env();await user(e,'raceuser');
 const fired=beforeWrite(e,'INSERT INTO user_sessions(');
 const attempt=await post(e,'/api/auth/login',{username:'raceuser',password});
 assert.equal(fired(),true);
 assert.equal(attempt.status,401);
 assert.equal(e.DB.sqlite.prepare('SELECT count(*) AS n FROM user_sessions').get().n,0);
});

test('stale password change cannot overwrite a concurrent password reset',async()=>{
 const e=env(),cookie=await user(e,'raceuser');
 const fired=beforeWrite(e,'UPDATE users SET password_salt=?,password_hash=? WHERE id=?');
 const attempt=await post(e,'/api/me/password',{currentPassword:password,newPassword:'new-synthetic-password-123'},cookie);
 assert.equal(fired(),true);
 assert.equal(attempt.status,409);
 assert.equal(e.DB.sqlite.prepare('SELECT count(*) AS n FROM user_sessions').get().n,0);
});

test('stale session cannot issue a recovery code after password reset',async()=>{
 const e=env(),cookie=await user(e,'raceuser');
 const fired=beforeWrite(e,'INSERT INTO account_recovery(');
 const attempt=await post(e,'/api/me/recovery-code',{currentPassword:password},cookie);
 assert.equal(fired(),true);
 assert.equal(attempt.status,409);
 assert.equal(e.DB.sqlite.prepare('SELECT count(*) AS n FROM account_recovery').get().n,0);
});
