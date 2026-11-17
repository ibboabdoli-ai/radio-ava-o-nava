import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const get=name=>readFileSync(join(root,name),'utf8');
const html=get('index.html'),app=get('app.js'),sw=get('sw.js');
const css=get('site.css'),audiusJs=get('audius.js');
const audius=JSON.parse(get('audius-catalog.json'));
const shows=JSON.parse(get('shows.json')),manifest=JSON.parse(get('manifest.webmanifest'));

test('All radio assets exist and executable JS parses',()=>{
 for(const f of ['index.html','app.js','site.css','interaction.js','audius.js','mobile-premium.js','audius-catalog.json','shows.json','sw.js','manifest.webmanifest','manage.html'])
   assert.ok(existsSync(join(root,f)),f);
 for(const j of [app,audiusJs,get('interaction.js'),get('mobile-premium.js'),sw])new vm.Script(j);
 assert.match(html,/<html lang="fa" dir="rtl">/);
});

test('Every JS referenced HTML ID exists and is unique',()=>{
 const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 const refs=[...app.matchAll(/\$\('([^']+)'\)|setText\('([^']+)'/g)].map(m=>m[1]||m[2]);
 assert.deepEqual([...new Set(refs.filter(id=>!ids.includes(id)))],[]);
 const playerIds=[...audiusJs.matchAll(/\$\('([^']+)'\)|set\('([^']+)'/g)].map(m=>m[1]||m[2]);
 assert.deepEqual([...new Set(playerIds.filter(id=>!ids.includes(id)))],[]);
});

test('No legacy music provider is loaded on v2',()=>{
 for(const source of [html,app,audiusJs,sw,css]){
   assert.equal(/soundcloud/i.test(source),false);
   assert.equal(/(?:\.\/|\/)catalog\.json(?=['"])/i.test(source),false);
 }
 assert.ok(!existsSync(join(root,'catalog.json')));
 assert.ok(!html.includes('id="musicFrame"'));
});

test('Audius curated tracks and native player are intact',()=>{
 assert.equal(audius.provider,'Audius');
 assert.equal(audius.tracks.length,7);
 const ids=new Set();
 for(const track of audius.tracks){
   assert.match(track.id,/^[A-Za-z0-9]{2,24}$/);
   assert.equal(track.publicStream,true);
   assert.equal(new URL(track.source).hostname,'audius.co');
   assert.equal(new URL(track.artwork).protocol,'https:');
   assert.ok(track.title&&track.artist&&track.genre);
   assert.ok(!ids.has(track.id));ids.add(track.id);
 }
 for(const id of ['music','audiusGrid','audiusAlbumGrid','audiusAudio','audiusSeek','audiusNext','audiusLoadMore','audiusSearch','audiusTracksTab','audiusAlbumsTab'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(audiusJs,/\/tracks\/search/);
 assert.match(audiusJs,/\/playlists\/search/);
 assert.match(audiusJs,/\/playlists\/.*\/tracks/);
 assert.match(audiusJs,/\/stream\?app_name=/);
 assert.match(audiusJs,/offset/);
 assert.match(audiusJs,/radio-audius-toggle/);
 assert.match(app,/radio-audius-started/);
 assert.match(app,/radio-audius-stop/);
});

test('Program and recordings are preserved',()=>{
 assert.deepEqual(shows.schedule.weekdays,[6,0,1,2,3]);
 assert.equal(shows.schedule.hour,22);
 assert.equal(shows.timezone,'Asia/Tehran');
 assert.equal(shows.recordings.length,4);
 for(const r of shows.recordings)assert.equal(new URL(r.src).hostname,'archive.ibboabdoli.com');
 assert.equal(new URL(shows.links.stream).hostname,'live.ibboabdoli.com');
 assert.equal(new URL(shows.links.contest).hostname,'docs.google.com');
});

test('Timezone conversion in November 2026',()=>{
 const date=new Date('2026-11-17T18:30:00Z');
 for(const [tz,expectation] of [['Asia/Tehran','22:00'],['Europe/Stockholm','19:30'],['Europe/London','18:30']]){
   const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
   assert.equal(fmt.format(date),expectation);
 }
});

test('One unified accessible responsive design, no obsolete style layers',()=>{
  for(const oldFile of ['mobile.css','polish.css','mobile-premium.css','audius.css'])
    assert.equal(existsSync(join(root,oldFile)),false,oldFile);
  assert.match(html,/href="\.\/site\.css\?v=14"/);
  assert.equal((html.match(/<link rel="stylesheet" href="\.\//g)||[]).length,1);
  for(const oldFile of ['mobile.css','polish.css','mobile-premium.css','audius.css'])
    assert.equal(sw.includes(oldFile),false,oldFile);
  for(const text of ['.main-play::before','.rec-play::before','.audius-primary::before','.mobile-bottom-nav','@media(max-width:700px)','prefers-reduced-motion:reduce','.up-next','.audius-grid','.recording-grid','.install-step-card'])
    assert.ok(css.includes(text),text);
  assert.match(css,/\.up-next\{padding:/);
  assert.equal(css.includes("radial-gradient(360px circle"),false);
  for(const id of ['mobileBottomNav','headerShare','liveFullscreen','liveShare','liveCopy','requestSongLink','install','about','contact','recordingPlay','audiusToggle'])
    assert.ok(html.includes('id="'+id+'"'),id);
  for(const system of ['ios','android'])for(let i=1;i<=4;i++)assert.ok(html.includes(system+'-install-'+i+'.svg'));
  assert.match(app,/\.classList\.toggle\('is-playing'/);
  assert.match(audiusJs,/\.classList\.toggle\('is-playing'/);
  assert.match(audiusJs,/function matchesSearch/);
  assert.match(html,/src="\.\/audius\.js/);
});

test('PWA cache excludes external media endpoints and survives isolated install',()=>{
 assert.equal(manifest.id,'/v2/');
 assert.equal(manifest.scope,'/v2/');
 assert.match(sw,/req\.method!=='GET'/);
 assert.match(sw,/new URL\(req\.url\)\.origin!==self\.location\.origin/);
 assert.match(sw,/audius-catalog\.json/);
 for(const domain of ['api.audius.co','live.ibboabdoli.com','archive.ibboabdoli.com'])assert.ok(!sw.includes(domain));
});

test('No hardcoded authentication secret or invented live claims',()=>{
 assert.ok(!/icecast.*password\s*[:=]/i.test(app+get('shows.json')));
 assert.match(app,/Unknown is not OFFLINE/);
 assert.match(app,/navigator\.mediaSession/);
});

test('iOS and Android install guide is compact and accessible',()=>{
  const guide=get('install-guide.js');
  new vm.Script(guide);
  assert.match(html,/id="installImageDialog"/);
  assert.match(html,/id="installDialogImage"/);
  assert.match(html,/id="installDialogClose"/);
  assert.equal((html.match(/class="install-preview"/g)||[]).length,8);
  assert.match(html,/src="\.\/install-guide\.js\?v=2"/);
  assert.match(css,/\.install-preview img\{/);
  assert.match(css,/scroll-snap-type:x mandatory/);
  assert.match(css,/\.install-image-dialog::backdrop/);
  assert.match(css,/\.install-preview img\{[^}]*background:#12101b/);
  assert.match(sw,/ava-v2-static-14/);
  assert.match(sw,/install-guide\.js\?v=1/);
  for(const platform of ['ios','android']){
    for(let i=1;i<=4;i++){
      const svg=get('../assets/'+platform+'-install-'+i+'.svg');
      assert.match(svg,/<svg /);
      assert.match(svg,/fill="#171425" aria-hidden="true"/);
      assert.ok(html.includes('../assets/'+platform+'-install-'+i+'.svg'));
    }
  }
});

test('Install slides show exactly one of four steps at once per platform',()=>{
 const guide=get('install-guide.js');
 for(const platform of ['ios','android'])
   assert.ok(html.includes('data-install-slider="'+platform+'"'),platform);
 assert.equal((html.match(/class="install-step-grid" aria-live="off"/g)||[]).length,2);
 assert.equal((html.match(/class="install-slider-arrow install-prev"/g)||[]).length,2);
 assert.equal((html.match(/class="install-slider-arrow install-next"/g)||[]).length,2);
 assert.equal((html.match(/data-slide="[0-3]"/g)||[]).length,8);
 assert.equal((html.match(/class="install-slider-status"/g)||[]).length,2);
 assert.match(guide,/cards\.forEach/);
 assert.match(guide,/card\.hidden=i!==current/);
 assert.match(guide,/touchstart/);
 assert.match(guide,/touchend/);
 assert.match(guide,/ArrowLeft/);
 assert.match(guide,/ArrowRight/);
 assert.match(css,/\.install-slider \.install-step-grid\{/);
 assert.match(css,/\.install-slider \.install-step-card\[hidden\]/);
 assert.match(css,/\.install-slider-dot\.active span/);
 assert.match(css,/\.install-slider \.install-preview img\{[^}]*object-fit:contain/);
});
