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

test('Mobile visual polish, motion accessibility and legacy parity',()=>{
  const polish=get('polish.css'),mobile=get('mobile.css'),interaction=get('interaction.js');
  new vm.Script(interaction);
  assert.match(html,/href="\.\/polish\.css\?v=6"/);
  assert.match(html,/href="\.\/mobile\.css\?v=4"/);
  assert.match(html,/src="\.\/interaction\.js\?v=5"/);
  for(const id of ['liveFullscreen','liveCopy','liveShare','requestSongLink','install','about','contact'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const system of ['ios','android'])for(let n=1;n<=4;n++)assert.ok(html.includes(system+'-install-'+n+'.svg'));
  assert.match(html,/class="install-platform-detail" open/);
  assert.match(html,/class="install-platform-detail"><summary/);
  assert.match(mobile,/@media\(max-width:700px\)/);
  assert.match(mobile,/scroll-snap-type:x mandatory/);
  assert.match(polish,/prefers-reduced-motion:reduce/);
  assert.match(interaction,/pointerdown/);
  assert.match(interaction,/pointermove/);
  assert.match(interaction,/requestFullscreen/);
  assert.equal(new URL(shows.links.requestSong).hostname,'t.me');
});

test('Premium mobile navigation, presentation and compatibility',()=>{
 const premium=get('mobile-premium.css');const navigation=get('mobile-premium.js');
 new vm.Script(navigation);
 assert.match(html,/id="mobileBottomNav"/);
 assert.match(html,/id="headerShare"/);
 assert.match(html,/class="mobile-station-intro container"/);
 assert.match(html,/href="\.\/mobile-premium\.css\?v=5"/);
 assert.match(html,/src="\.\/mobile-premium\.js\?v=5"/);
 assert.match(html,/src="\.\/app\.js\?v=7"/);
 assert.equal((html.match(/data-mobile-tab="/g)||[]).length,4);
 assert.match(premium,/@media\(max-width:700px\)/);
 assert.match(premium,/prefers-reduced-motion:reduce/);
 assert.match(premium,/env\(safe-area-inset-bottom\)/);
 assert.match(premium,/.player-dock:not\(.dock-active\)/);
 assert.match(navigation,/IntersectionObserver/);
 assert.match(app,/classList.toggle\('dock-active'/);
 assert.match(get('interaction.js'),/mobile-tab/);
});

test('Only four pictured featured music cards gain sourced photographs',()=>{
 const withArtwork=catalog.tracks.filter(t=>t.artwork);
 assert.deepEqual(withArtwork.map(t=>t.id),['music-1','music-2','music-3','music-4']);
 for(const t of withArtwork){
   assert.match(t.artwork.url,/^https:\/\//);
   assert.ok(t.artwork.alt.length>8);
   assert.match(t.artwork.source,/^https:\/\//);
 }
 assert.match(app,/cover\.classList\.add\('has-image'\)/);
 assert.match(get('polish.css'),/\.music-cover\.has-image>img/);
});

test('Audius Persian catalog includes seven real native-stream entries',()=>{
 const data=JSON.parse(get('audius-catalog.json'));
 const js=get('audius.js'),style=get('audius.css');
 new vm.Script(js);
 assert.equal(data.provider,'Audius');
 assert.equal(data.tracks.length,7);
 const ids=new Set();
 for(const track of data.tracks){
   assert.match(track.id,/^[A-Za-z0-9]{2,24}$/);
   assert.equal(track.publicStream,true);
   assert.equal(new URL(track.source).hostname,'audius.co');
   assert.equal(new URL(track.artwork).protocol,'https:');
   assert.ok(track.title&&track.artist&&track.genre);
   assert.ok(!ids.has(track.id));ids.add(track.id);
 }
 assert.match(html,/id="audiusGrid"/);
 assert.match(html,/id="audiusAudio"/);
 assert.match(html,/id="audiusSeek"/);
 assert.match(html,/id="audiusNext"/);
 assert.match(html,/href="\.\/audius\.css\?v=2"/);
 assert.match(html,/src="\.\/audius\.js\?v=2"/);
 assert.match(app,/radio-audius-started/);
 assert.match(app,/radio-audius-stop/);
 assert.match(js,/\/stream\?app_name=/);
 assert.match(js,/radio-audius-toggle/);
 assert.match(style,/\.audius-grid/);
 assert.match(get('sw.js'),/audius-catalog\.json/);
 assert.ok(!get('sw.js').includes('api.audius.co'));
});
