import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../shows.json',import.meta.url),'utf8'));
test('All twelve publicly accessible archived recordings respond to HEAD',async(t)=>{
  assert.equal(manifest.recordings.length,12);
  for(const recording of manifest.recordings){
    await t.test(recording.id,{timeout:20000},async()=>{
      const url=new URL(recording.src);
      assert.equal(url.protocol,'https:');
      assert.equal(url.hostname,'archive.ibboabdoli.com');
      const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(14000),redirect:'follow'});
      assert.ok(response.ok,'Archive HEAD HTTP '+response.status+' for '+recording.id);
      const len=Number(response.headers.get('content-length'));
      if(Number.isFinite(len)&&len!==0)assert.ok(len>1024,'Archive file unexpectedly small: '+recording.id);
      const ct=(response.headers.get('content-type')||'').toLowerCase();
      assert.ok(/audio|mpeg|octet-stream/.test(ct),'Archive Content-Type missing media: '+ct);
    });
  }
});

test('Diagnose byte-range support across all twelve archive recordings (issue #15)',async(t)=>{
 for(const item of manifest.recordings){
   await t.test(item.id,{timeout:18000},async()=>{
     const response=await fetch(item.src,{method:'GET',headers:{Range:'bytes=0-1'},signal:AbortSignal.timeout(14000)});
     try{
       if(response.status===206){
         assert.match(response.headers.get('content-range')||'',/^bytes 0-1\/\d+$/i,
           'Archive missing valid Content-Range for '+item.id);
       }else if(response.status===200){
         // The R2 custom domain currently returns full-body 200 for four existing recordings.
         // Report but do not block unrelated frontend changes. See issue #15.
         const headers=['accept-ranges','content-encoding','content-length','cf-cache-status','content-type']
           .map(name=>name+'='+String(response.headers.get(name)||'absent')).join(' ');
         t.diagnostic('RANGE UNSUPPORTED: '+item.id+' returned HTTP 200. '+headers);
         console.warn('::warning title=R2 range seeking unsupported::'+item.id+
           ' ignores Range; audio seeking may download the entire MP3. See issue #15.');
       }else{
         assert.fail('Unexpected HTTP '+response.status+' for '+item.id);
       }
     }finally{
       try{await response.body?.cancel();}catch{}
     }
   });
 }
});
