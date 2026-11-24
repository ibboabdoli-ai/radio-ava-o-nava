import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {finishGoogle, googleSession, startGoogle, verifyGoogleToken} from './google-auth.js';
import {libraryAccounts} from './library-accounts.js';

const origin='https://ava-radio-staging.ibbo-abdoli.workers.dev';
const clubA={id:'club-a',username:'ch:listener_a',role:'listener'};
const clubB={id:'club-b',username:'ch:listener_b',role:'listener'};
const track='a'.repeat(32);
const secondTrack='b'.repeat(32);

function setup() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE song_catalog(id TEXT PRIMARY KEY,title TEXT,artist TEXT,source_url TEXT,active INTEGER);');
  sqlite.exec(readFileSync(new URL('./0021_library_accounts.sql',import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO users VALUES('club-a'),('club-b')");
  const insert=sqlite.prepare('INSERT INTO song_catalog VALUES(?,?,?,?,1)');
  insert.run(track,'همسفر','گوگوش','archive:audio/' + 'a'.repeat(64) + '.mp3');
  insert.run(secondTrack,'آشنایی','هایده','archive:audio/' + 'b'.repeat(64) + '.mp3');
  const db={
    prepare(sql) {
      const stmt=sqlite.prepare(sql);
      return {bind(...params){return {
        first:async()=>stmt.get(...params)??null,
        all:async()=>({results:stmt.all(...params)}),
        run:async()=>({meta:stmt.run(...params)}),
      }}};
    },
    async batch(statements){
      sqlite.exec('BEGIN');
      try{
        const results=[];
        for(const stmt of statements) results.push(await stmt.run());
        sqlite.exec('COMMIT');
        return results;
      }catch(error){sqlite.exec('ROLLBACK');throw error;}
    },
  };
  const env={DB:db,ALLOWED_ORIGIN:origin,LIBRARY_ACCOUNTS_ENABLED:'true'};
  const request=(path,{user=null,method='GET',body,headers={},site=origin}={})=>libraryAccounts({
    req:new Request(site+'/api/library/'+path,{method,headers:{Origin:site,...headers},body:body&&JSON.stringify(body)}),
    env,clubSession:async()=>user,readBody:req=>req.json(),h:{},
    j:(data,status,headers)=>Response.json(data,{status,headers}),
  });
  return {env,db,request};
}

test('club and Google accounts have separate sessions; private playlists stay owner-only', async () => {
  const {request}=setup();
  const guest=await request('profile');
  assert.deepEqual(await guest.json(),{account:null,googleEnabled:false});
  assert.equal((await request('playlists')).status,401);
  const loggedIn=await request('profile',{user:clubA});
  assert.deepEqual((await loggedIn.json()).account,{name:'@listener_a',picture:null,method:'club'});
  const create=await request('playlists',{user:clubA,method:'POST',body:{name:'آهنگ‌های من'}});
  assert.equal(create.status,201);
  const {id}=await create.json();
  const path='playlists/'+id;
  assert.equal((await request(path,{user:clubB})).status,404);
  assert.equal((await request(path)).status,404);
  assert.equal((await request(path,{user:clubB,method:'DELETE'})).status,404);
  for(const song of [track,track,secondTrack]){
    assert.equal((await request(path+'/tracks/'+song,{user:clubA,method:'PUT'})).status,200);
  }
  const privateList=await request(path,{user:clubA});
  assert.deepEqual((await privateList.json()).tracks.map(song=>song.id),[track,secondTrack]);
  assert.equal((await request(path,{user:clubA,method:'PATCH',headers:{Origin:'https://other.test'},body:{name:'نوشته',public:true}})).status,403);
  assert.equal((await request(path,{user:clubA,method:'PATCH',body:{name:'برای شنیدن',public:true}})).status,200);
  const publicList=await request(path);
  assert.deepEqual(await publicList.json(),{
    id,name:'برای شنیدن',public:true,owned:false,
    tracks:[{id:track,title:'همسفر',artist:'گوگوش'},{id:secondTrack,title:'آشنایی',artist:'هایده'}],
  });
  assert.equal((await request(path+'/tracks/'+track,{user:clubA,method:'DELETE'})).status,200);
  assert.equal((await request(path,{user:clubA,method:'PATCH',body:{name:'خصوصی دوباره',public:false}})).status,200);
  assert.equal((await request(path)).status,404);
  assert.equal((await request(path,{user:clubA,method:'DELETE'})).status,200);
  assert.equal((await request(path,{user:clubA})).status,404);
  assert.equal((await request('profile',{site:'https://radio.ibboabdoli.com'})).status,404);
});

test('Google callback verifies the signed identity, PKCE and nonce before creating a first-party session', async () => {
  const {env,db,request}=setup();
  env.LIBRARY_GOOGLE_CLIENT_ID='test-client.example';
  env.LIBRARY_GOOGLE_CLIENT_SECRET='synthetic-secret';
  const {publicKey,privateKey}=await crypto.subtle.generateKey(
    {name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
    true,['sign','verify']
  );
  const jwk={...await crypto.subtle.exportKey('jwk',publicKey),alg:'RS256',use:'sig',kid:'test-key'};
  const sign=async claims=>{
    const encoded=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,Buffer.from(encoded));
    return encoded+'.'+Buffer.from(signature).toString('base64url');
  };
  const flow=await startGoogle(new Request(origin+'/api/library/auth/google?song='+track),env);
  assert.equal(flow.status,303);
  const google=new URL(flow.headers.get('Location'));
  assert.equal(google.hostname,'accounts.google.com');
  assert.equal(google.searchParams.get('scope'),'openid profile');
  assert.equal(google.searchParams.get('code_challenge_method'),'S256');
  const flowValue=flow.headers.getSetCookie()[0].split(';')[0];
  const now=Math.floor(Date.now()/1000);
  const claims={iss:'https://accounts.google.com',aud:env.LIBRARY_GOOGLE_CLIENT_ID,nonce:google.searchParams.get('nonce'),sub:'synthetic-user',name:'شنوندهٔ گوگل',iat:now,exp:now+300};
  const idToken=await sign(claims);
  let exchanged=0;
  const fetcher=async (url,options)=>{
    if(url.endsWith('/token')){
      exchanged+=1;
      assert.equal(options.body.get('code'),'synthetic-code');
      assert.equal(options.body.get('redirect_uri'),origin+'/api/library/auth/google/callback');
      assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(options.body.get('code_verifier')))).toString('base64url'),google.searchParams.get('code_challenge'));
      return Response.json({id_token:idToken});
    }
    assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({keys:[jwk]});
  };
  const callback=state=>new Request(origin+'/api/library/auth/google/callback?'+new URLSearchParams({state,code:'synthetic-code'}),{headers:{Cookie:flowValue}});
  const failed=await finishGoogle(callback('wrong-state'),env,db,fetcher);
  assert.equal(exchanged,0);
  assert.equal(new URL(failed.headers.get('Location')).searchParams.get('signin'),'failed');
  const signedIn=await finishGoogle(callback(google.searchParams.get('state')),env,db,fetcher);
  assert.equal(exchanged,1);
  assert.equal(new URL(signedIn.headers.get('Location')).searchParams.get('song'),track);
  const cookie=signedIn.headers.getSetCookie().find(value=>value.startsWith('__Host-ava_library_session='));
  assert.ok(cookie?.includes('Secure; HttpOnly; SameSite=Lax'));
  const headers={Cookie:cookie.split(';')[0]};
  const googleProfile=await request('profile',{headers});
  assert.deepEqual((await googleProfile.json()).account,{name:'شنوندهٔ گوگل',picture:null,method:'google'});
  await assert.rejects(verifyGoogleToken(idToken,claims.aud,'incorrect-nonce',fetcher));
  await assert.rejects(verifyGoogleToken(await sign({...claims,exp:now-1}),claims.aud,claims.nonce,fetcher));
  const forged=idToken.slice(0,idToken.lastIndexOf('.')+1)+'invalidsignature';
  await assert.rejects(verifyGoogleToken(forged,claims.aud,claims.nonce,fetcher));
  const signedOut=await request('auth/logout',{method:'POST',headers});
  assert.equal(signedOut.status,200);
  assert.equal(await googleSession(new Request(origin,{headers}),db),null);
});
