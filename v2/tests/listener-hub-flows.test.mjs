import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(join(root, 'request-song.js'), 'utf8');

function createDOM() {
  const elements = new Map();
  function element(tag='div') {
    return {
      tag, textContent: '', value: '', disabled: false, hidden: false, children: [], handlers: {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = [...children]; },
      setAttribute(attr, value) { this[attr] = value; },
      addEventListener(type, callback) { this.handlers[type] = callback; },
      reset() { this.resets = (this.resets || 0) + 1; }
    };
  }
  return {
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    }
  };
}

async function start(config, apiResponses={}) {
  const document = createDOM();
  const calls = [];
  const fetch = async (url, options={}) => {
    calls.push({url, options});
    if (url === './request-config.json') {
      if (config instanceof Error) throw config;
      return {ok:true,json:async()=>config};
    }
    const handler = apiResponses[url];
    if (!handler) throw Error('Unexpected request: '+url);
    return typeof handler === 'function' ? handler(options) : handler;
  };
  const context = {document, URL, fetch, AbortController, setTimeout, clearTimeout};
  // Must start disabled, as set by actual HTML.
  document.getElementById('requestSubmit').disabled = true;
  document.getElementById('refreshQueue').disabled = true;
  vm.runInNewContext(script, context, {filename:'request-song.js'});
  // Flush config and follow-up fetches.
  await new Promise(resolve=>setImmediate(resolve));
  return {document, calls};
}
const get = (document,id)=>document.getElementById(id);
const json = (status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('unavailable config keeps all customer actions disabled', async () => {
  const {document,calls} = await start(new Error('offline'));
  assert.equal(calls.length,1);
  assert.equal(get(document,'requestSubmit').disabled,true);
  assert.match(get(document,'clubStatusText').textContent,/برقرار نشد/);
});

test('enabled request sends only intended fields, confirms HTTP 201, resets form', async () => {
  const base='https://example.org';
  const {document,calls} = await start(
    {apiBase:base,features:{requests:true,queue:false,leaderboard:false}},
    {[base+'/api/requests']:json(201,{id:'id1',status:'pending'})}
  );
  get(document,'songTitle').value='  آهنگ تست  ';
  get(document,'songArtist').value='  خواننده  ';
  get(document,'requester').value='  کاربر  ';
  assert.equal(get(document,'requestSubmit').disabled,false);
  let prevented=false;
  await get(document,'requestForm').handlers.submit({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.method,'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body),{title:'آهنگ تست',artist:'خواننده',requestedBy:'کاربر'});
  assert.equal(get(document,'requestForm').resets,1);
  assert.match(get(document,'requestFeedback').textContent,/ثبت شد/);
  assert.equal(get(document,'requestSubmit').disabled,false);
});

test('API rate limit produces a retry message without resetting user form', async () => {
  const base='https://example.org';
  const {document} = await start(
    {apiBase:base,features:{requests:true,queue:false,leaderboard:false}},
    {[base+'/api/requests']:json(429,{error:'rate_limited'})}
  );
  get(document,'songTitle').value='قطعه';
  get(document,'songArtist').value='خواننده';
  get(document,'requester').value='شنونده';
  await get(document,'requestForm').handlers.submit({preventDefault(){}});
  assert.match(get(document,'requestFeedback').textContent,/یک دقیقه/);
  assert.equal(get(document,'requestForm').resets,undefined);
  assert.equal(get(document,'requestSubmit').disabled,false);
});

test('malformed and non-HTTPS API URLs fail closed', async () => {
  for (const apiBase of ['http://example.org','https://example.org/path','https://test:pass@example.org','bad-url']) {
    const {document,calls}=await start({apiBase,features:{requests:true,queue:true,leaderboard:true}});
    assert.equal(get(document,'requestSubmit').disabled,true,apiBase);
    assert.equal(calls.length,1,apiBase);
  }
});

test('public queue and ranking render untrusted strings as text, not HTML', async () => {
  const base='https://example.org';
  const {document,calls}=await start(
    {apiBase:base,features:{requests:false,queue:true,leaderboard:true}},
    {
      [base+'/api/queue']:json(200,{queue:[{title:'<script>alert(1)</script>',artist:'آزمایشی'}]}),
      [base+'/api/public/leaderboard']:json(200,{leaders:[{displayName:'<img onerror=alert(1)>',points:20}]})
    }
  );
  assert.equal(calls.length,3);
  const q=get(document,'queueList').children[0].children[1].children[0];
  const l=get(document,'leaderboardList').children[0].children[1].children[0];
  assert.equal(q.textContent,'<script>alert(1)</script>');
  assert.equal(l.textContent,'<img onerror=alert(1)>');
  assert.equal(get(document,'queueCount').textContent,'1');
  assert.equal(get(document,'leaderboardStatus').hidden,true);
});

test('API queue failure leaves a clear retry state', async () => {
  const base='https://example.org';
  const {document}=await start(
    {apiBase:base,features:{requests:false,queue:true,leaderboard:false}},
    {[base+'/api/queue']:json(503,{error:'unavailable'})}
  );
  assert.equal(get(document,'queueCount').textContent,'—');
  assert.match(get(document,'queueStatus').textContent,/دوباره/);
  assert.equal(get(document,'refreshQueue').disabled,false);
});

test('new account portal flag prevents the legacy request payload from reaching the integrated API', async () => {
  const {document,calls}=await start({
    apiBase:'https://api.example.org',clubEnabled:true,
    features:{requests:true,queue:false,leaderboard:false}
  });
  assert.equal(get(document,'requestSubmit').disabled,true);
  await get(document,'requestForm').handlers.submit({preventDefault(){}});
  assert.equal(calls.length,1);
});
