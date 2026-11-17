import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const get=name=>readFileSync(join(root,name),'utf8');
const html=get('index.html'),app=get('app.js'),css=get('site.css'),sw=get('sw.js');
const catalog=JSON.parse(get('catalog.json')),shows=JSON.parse(get('shows.json')),manifest=JSON.parse(get('manifest.webmanifest'));
test('All v2 source assets exist and scripts parse',()=>{
  for(const p of ['index.html','app.js','site.css','catalog.json','shows.json','manifest.webmanifest','sw.js','manage.html'])assert.ok(existsSync(join(root,p)),p);
  new vm.Script(app);new vm.Script(sw);
  assert.match(html,/<html lang="fa" dir="rtl">/);assert.ok(css.includes('@media(max-width:620px)'));
});
test('All static HTML element IDs are unique and JS ID references resolve',()=>{
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  const refs=[...app.matchAll(/\$\('([^']+)'\)|setText\('([^']+)'/g)].map(m=>m[1]||m[2]);
  assert.deepEqual([...new Set(refs.filter(id=>!ids.includes(id)))],[]);
});
test('Catalog keeps only reviewed official-source records',()=>{
  assert.equal(catalog.tracks.length,16);
  const ids=new Set();
  for(const t of catalog.tracks){
    assert.ok(t.title&&t.artist&&t.artistId);
    assert.ok(['track','album'].includes(t.type));
    assert.ok(Array.isArray(t.genres)&&t.genres.length);
    assert.equal(new URL(t.url).hostname,'soundcloud.com');
    assert.ok(!ids.has(t.id));ids.add(t.id);
  }
});
test('Shows keep original audio recordings and schedule',()=>{
  assert.deepEqual(shows.schedule.weekdays,[6,0,1,2,3]);
  assert.equal(shows.schedule.hour,22);assert.equal(shows.timezone,'Asia/Tehran');
  assert.equal(shows.recordings.length,4);
  for(const r of shows.recordings)assert.equal(new URL(r.src).hostname,'archive.ibboabdoli.com');
  assert.equal(new URL(shows.links.contest).hostname,'docs.google.com');
  assert.equal(new URL(shows.links.stream).hostname,'live.ibboabdoli.com');
});
test('Tehran schedule offset agrees for November 2026',()=>{
  const candidate=new Date('2026-11-17T18:30:00Z');
  for(const [tz,expected] of [['Asia/Tehran','22:00'],['Europe/Stockholm','19:30'],['Europe/London','18:30']]){
    assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(candidate),expected);
  }
});
test('PWA scope is isolated and does not cache third-party audio',()=>{
  assert.equal(manifest.id,'/v2/');assert.equal(manifest.scope,'/v2/');
  assert.match(sw,/req\.method!=='GET'/);assert.match(sw,/new URL\(req\.url\)\.origin!==self\.location\.origin/);
  assert.ok(!sw.includes('archive.ibboabdoli.com'));assert.ok(!sw.includes('live.ibboabdoli.com'));
});
test('No app secrets, hardcoded credentials or false live claims',()=>{
  assert.ok(!/icecast.*password\s*[:=]/i.test(app+get('shows.json')));
  assert.match(app,/Unknown is not OFFLINE/);
  assert.match(app,/navigator\.mediaSession/);
});
