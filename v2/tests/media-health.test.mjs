import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../shows.json',import.meta.url),'utf8'));
test('Five publicly accessible archived recordings respond to HEAD',async(t)=>{
  assert.equal(manifest.recordings.length,5);
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
