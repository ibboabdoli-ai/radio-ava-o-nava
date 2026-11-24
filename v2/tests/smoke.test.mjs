import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const get=name=>readFileSync(join(root,name),'utf8');
const html=get('studio.html'),app=get('app.js'),sw=get('sw.js');
const css=get('site.css'),audiusJs=get('audius.js');
const audius=JSON.parse(get('audius-catalog.json'));
const shows=JSON.parse(get('shows.json')),manifest=JSON.parse(get('manifest.webmanifest'));

test('Public homepage serves the compact RTL radio with inline station menu and shared player',()=>{
 const page=get('index.html'), js=get('radio-preview.js');
 new vm.Script(js);
 assert.match(page,/<html lang="fa" dir="rtl">/);
 assert.doesNotMatch(page,/noindex/);
 for(const id of ['home','discover','archive','toggle','liveButton','audio']) assert.ok(page.includes('id="'+id+'"'),id);
 for(const id of ['home','discover','archive']) assert.ok(page.includes('href="#'+id+'"'));
 for(const file of ['radio-preview.js','radio-preview.css','gallery/player-tar.jpg','radio-menu.js','more-preview.css']){
   assert.ok(page.includes(file) && sw.includes(file) && existsSync(join(root,file)),file);
 }
 for(const [,id] of js.matchAll(/byId\('([^']+)'\)/g)) assert.ok(page.includes('id="'+id+'"'),id);
 assert.doesNotMatch(page,/href="studio\.html/);
 assert.equal((page.match(/<audio\b/g)||[]).length,1);
 assert.equal((page.match(/name="radio-menu"/g)||[]).length,4);
 new vm.Script(get('radio-menu.js'));
});

test('The public music library is reachable directly from Home and from both browsing tabs',()=>{
 const page=get('index.html');
 for(const id of ['home','discover','archive']){
   const section=page.match(new RegExp('<section id="'+id+'"[^>]*>([\\s\\S]*?)</section>'))?.[1];
   assert.ok(section?.includes('href="./music-library/"'),id);
 }
 assert.ok(existsSync(join(root,'music-library','index.html')));
});

test('Install shortcut falls back to the guide, consumes each native prompt once, and hides after installation',async()=>{
 const elements=new Map(), listeners={}, location={hash:''};
 const getElementById=id=>{
   if(!elements.has(id)) elements.set(id,{addEventListener(type,fn){this[type]=fn;}});
   return elements.get(id);
 };
 const window={matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(get('phone-install.js'),{window,document:{getElementById},navigator:{},location});
 const event={preventDefault(){}};
 const shortcut=getElementById('installShortcut'),button=getElementById('nativeInstall');
 await shortcut.click(event);
 assert.equal(location.hash,'install');
 let calls=0;
 listeners.beforeinstallprompt({...event,prompt:async()=>{calls++;},userChoice:Promise.resolve({outcome:'dismissed'})});
 assert.equal(button.hidden,false);
 await Promise.all([button.click(event),shortcut.click(event)]);
 assert.equal(calls,1);
 assert.equal(getElementById('manualInstall').hidden,false);
 listeners.appinstalled();
 assert.equal(shortcut.hidden,true);
 assert.equal(button.hidden,true);
 for(const size of [192,512]) assert.ok(manifest.icons.some(i=>i.sizes===size+'x'+size && i.type==='image/png'));
});

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
 assert.equal(shows.recordings.length,12);
 assert.equal(shows.recordings[0].id,'recording-20261120-180647');
 assert.equal(shows.recordings[0].src,'https://archive.ibboabdoli.com/recordings/rec_20261120-180647.mp3');
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
  assert.match(html,/href="\.\/site\.css\?v=25"/);
  assert.equal((html.match(/<link rel="stylesheet" href="\.\//g)||[]).length,3);
  assert.ok(html.includes('href="./studio.css?v=6"'));
  for(const oldFile of ['mobile.css','polish.css','mobile-premium.css','audius.css'])
    assert.equal(sw.includes(oldFile),false,oldFile);
  for(const text of ['.main-play::before','.rec-play::before','.audius-primary::before','.mobile-bottom-nav','@media(max-width:700px)','prefers-reduced-motion:reduce','.up-next','.audius-grid','.recording-grid','.install-step-card'])
    assert.ok(css.includes(text),text);
  assert.match(css,/\.up-next\{padding:/);
  assert.equal(css.includes("radial-gradient(360px circle"),false);
  for(const id of ['mobileBottomNav','headerShare','liveFullscreen','liveShare','liveCopy','requestSongLink','install','about','contact','recordingPlay','audiusToggle'])
    assert.ok(html.includes('id="'+id+'"'),id);
  for(const system of ['ios','android'])for(let i=1;i<=4;i++)assert.ok(html.includes(system+'-install-'+i+'.jpg'));
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
  assert.match(html,/src="\.\/install-guide\.js\?v=7"/);
  assert.match(css,/\.install-preview img\{/);
  assert.match(css,/scroll-snap-type:x mandatory/);
  assert.match(css,/\.install-image-dialog::backdrop/);
  assert.match(css,/\.install-preview img\{[^}]*background:#12101b/);
  assert.match(sw,/ava-v2-static-38/);
  assert.match(sw,/install-guide\.js\?v=7/);
  for(const platform of ['ios','android']){
    for(let i=1;i<=4;i++){
      const svg=get('../assets/'+platform+'-install-'+i+'.svg');
      assert.match(svg,/<svg /);
      // Illustrations must match the eight user-approved separate slide images.
      const originals={
        ios:['1f31e4fe2c9997a09a254b60b2c0694b22479507','f877f839b5649f0ac522602e1b184cceaa241b08','d6ec8273797f5b439ccfcc36a04ddf12be2a5af3','409f764fc7a7c6145b0dc1a6bd4e3b7dba1a9394'],
        android:['99a2a173091d0d7d3ca6600e9f60c3c066904be9','ccf75b45fd080938f44896737d52121c66542d46','37fb5fe31f493428b3c8132a91242d7a6f1184c4','07c3a7c430c1164950c3f01d7f45ec5d2e662540']
      };
      assert.match(svg,/data:image\/jpeg;base64,/);
      const blobHash=createHash('sha1').update('blob '+Buffer.byteLength(svg)+'\0'+svg).digest('hex');
      assert.equal(blobHash,originals[platform][i-1]);
      assert.ok(html.includes('../assets/'+platform+'-install-'+i+'.jpg'));
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
 assert.match(guide,/card\.hidden=!active/);
 assert.match(guide,/touchstart/);
 assert.match(guide,/touchend/);
 assert.match(guide,/ArrowLeft/);
 assert.match(guide,/ArrowRight/);
 assert.match(css,/\.install-slider \.install-step-grid\{/);
 assert.match(css,/\.install-slider \.install-step-card\[hidden\]/);
 assert.match(css,/\.install-slider-dot\.active span/);
 assert.match(css,/\.install-slider \.install-preview img\{[^}]*object-fit:contain/);
});

test('Approved image pixels are preserved as native iOS-compatible JPEGs',()=>{
 const guide=get('install-guide.js');
 assert.match(guide,/const slideImage=\(platform,index\)=>/);
 assert.match(guide,/card\.dataset\.stepActive=String\(active\)/);
 assert.match(guide,/const src=\(platform==='ios'/);
 assert.ok(!html.includes('install-images.js'),'No inline base64 image bundle');
 assert.ok(!sw.includes('install-images.js'),'No embedded bundle cached in SW');
 let initial=0,hidden=0;
 for(const platform of ['ios','android']){
   for(let i=1;i<=4;i++){
     const name='../assets/'+platform+'-install-'+i;
     const svg=get(name+'.svg');
     const encoded=svg.match(/href="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/)?.[1];
     assert.ok(encoded,'Original approved SVG has embedded JPEG '+name);
     const approved=Buffer.from(encoded,'base64');
     const jpg=readFileSync(join(root,name+'.jpg'));
     assert.ok(jpg.length>10000,'JPG image data exists '+name);
     assert.equal(jpg[0],0xff);
     assert.equal(jpg[1],0xd8);
     assert.deepEqual(jpg,approved,'Identical approved image data for '+name);
     assert.ok(html.includes('src="'+name+'.jpg"'),'Browser-native image source '+name);
     assert.ok(html.includes('data-install-image="'+name+'.jpg"'));
     assert.ok(!sw.includes(name+'.jpg'),'Hidden images should not be pre-cached');
     if(i===1)initial++;else hidden++;
   }
 }
 assert.equal(initial,2);
 assert.equal(hidden,6);
 assert.equal((html.match(/class="install-step-card" data-step-active="true"/g)||[]).length,2);
 assert.equal((html.match(/class="install-step-card" data-step-active="false" hidden/g)||[]).length,6);
 assert.match(css,/\.install-slider \.install-step-card\[data-step-active="false"\]/);
 assert.match(css,/Real iPhone screenshots/);
});

test('Replay controls, live status and contest registration are safely connected',()=>{
 assert.match(html,/id="serverHint"/);
 assert.match(html,/id="nextShowTime"/);
 assert.match(html,/id="recordingRetry"/);
 assert.match(html,/id="recordingSeek"[^>]*disabled/);
 assert.match(app,/normalizeStats/);
 assert.match(app,/status-json\.xsl/);
 assert.match(app,/Unknown is not OFFLINE/);
 assert.match(app,/!recAudio\.paused/);
 assert.match(app,/state\.recordingIndex\+1<state\.shows\.recordings\.length/);
 assert.match(html,/href="\.\/privacy\.html"/);
 assert.ok(!html.includes('docs.google.com/spreadsheets/d/'),'Do not expose private registration sheet on the public site');
 assert.equal(shows.recordings.length,12);
 assert.equal(new Set(shows.recordings.map(recording=>recording.id)).size,12);
 for(const item of shows.recordings)assert.match(item.src,/^https:\/\/archive\.ibboabdoli\.com\/recordings\/[^/]+\.mp3$/);
});
test('Installation guide HTML has two matching platform containers',()=>{
 const install=html.slice(html.indexOf('<section class="container install-detail'),html.indexOf('<section class="container about-section'));
 assert.ok(install.includes('data-install-slider="ios"'));
 assert.ok(install.includes('data-install-slider="android"'));
 assert.equal((install.match(/class="install-platform-title"/g)||[]).length,2);
 assert.equal((install.match(/<details class="radio-disclosure"><summary><h3 class="install-platform-title">/g)||[]).length,2);
 assert.match(css,/max-height:65dvh/);
});
test('Music searches do not destroy an active playback queue',()=>{
 assert.match(audiusJs,/discovery\.results\.forEach/);
 assert.match(audiusJs,/player\.tracks=\[\.\.\.discovery\.results\];chooseTrack\(i,true\)/);
 assert.equal((audiusJs.match(/resetPlayerForQueue\(\)/g)||[]).length,1);
 assert.match(audiusJs,/aria-busy/);
 assert.match(html,/audiusSearch/);
});
test('Live stat normalization distinguishes current stream and no source',()=>{
 const snippet=app.slice(app.indexOf('  function normalizeStats(s){'),app.indexOf('  let polling=false,'));
 assert.ok(snippet.startsWith('  function normalizeStats(s){'));
 const convert=value=>JSON.parse(JSON.stringify(value));
 const live=vm.runInNewContext(snippet+'\nnormalizeStats({icestats:{source:{listenurl:"https://live.ibboabdoli.com/stream",listeners:4}}})');
 const quiet=vm.runInNewContext(snippet+'\nnormalizeStats({icestats:{}})');
 assert.deepEqual(convert(live),{live:true,listeners:4,startedAt:null});
 assert.deepEqual(convert(quiet),{live:false,listeners:0,startedAt:null});
});
test('Next broadcast is computed by Tehran clock and honors daylight savings elsewhere',()=>{
 const begin=app.indexOf('  const timeFormatters='),end=app.indexOf('  function renderSchedule(){');
 assert.ok(begin>0&&end>begin);
 const prefix='const state={shows:{schedule:{weekdays:[6,0,1,2,3],hour:22,minute:0}}};const FALLBACK={schedule:state.shows.schedule};const wk={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};\n';
 const source=prefix+app.slice(begin,end);
 const first=vm.runInNewContext(source+'\nshowCandidates(new Date("2026-11-18T08:00:00Z"))[0].at.toISOString()');
 assert.equal(first,'2026-11-18T18:30:00.000Z');
 const later=vm.runInNewContext(source+'\nshowCandidates(new Date("2026-11-18T19:00:00Z"))[0].at.toISOString()');
 assert.equal(later,'2026-11-21T18:30:00.000Z');
 const summer=vm.runInNewContext(source+'\nshowCandidates(new Date("2026-07-18T08:00:00Z"))[0].at.toISOString()');
 assert.equal(summer,'2026-07-18T18:30:00.000Z');
});


test('Public competition information is configurable without leaking registrations',()=>{
 assert.ok(shows.competition,'Competition metadata is present');
 assert.ok(Array.isArray(shows.competition.rules));
 assert.ok(Array.isArray(shows.competition.winners));
 assert.ok(shows.competition.registrationDeadline===null||/^\d{4}-\d{2}-\d{2}$/.test(shows.competition.registrationDeadline));
 assert.ok(shows.competition.publicParticipantsCount===null||(Number.isSafeInteger(shows.competition.publicParticipantsCount)&&shows.competition.publicParticipantsCount>=0));
 assert.match(html,/id="contestTitle"/);
 assert.match(html,/id="contestLink"/);
 for(const removed of ['contestDeadline','contestParticipants','contestRules','contestWinners']){
   assert.ok(!html.includes('id="'+removed+'"'),'Private or unannounced contest details must not be visible');
 }
 assert.match(app,/function renderCompetition\(\)/);
 assert.ok(!html.includes('docs.google.com/spreadsheets/d/'));
});
test('Artist discovery has a separate accessible view, and playback remains isolated',()=>{
 assert.match(html,/id="audiusArtistsTab" aria-pressed="false"/);
 assert.match(html,/id="audiusArtistGrid"/);
 assert.match(html,/سبک‌های موسیقی/);
 assert.match(audiusJs,/function artistsFromTracks\(tracks\)/);
 assert.match(audiusJs,/function renderArtists\(\)/);
 assert.match(audiusJs,/function setBrowseView\(mode\)/);
 assert.match(audiusJs,/selected\(\)\?\.id===track\.id/);
 assert.match(audiusJs,/artistGrid\.setAttribute\('aria-busy'/);
 const start=audiusJs.indexOf('  function artistsFromTracks(tracks){');
 const end=audiusJs.indexOf('  function renderArtists(){',start);
 const code=audiusJs.slice(start,end);
 assert.ok(start>0&&end>start);
 const actual=JSON.parse(vm.runInNewContext(code+'\nJSON.stringify(artistsFromTracks([{artist:"شجریان",artwork:"x"},{artist:"شجریان",artwork:"y"},{artist:"گوگوش",artwork:"z"}]))'));
 assert.equal(actual.length,2);
 assert.equal(actual[0].name,'شجریان');
 assert.equal(actual[0].tracks,2);
});
test('Recordings reveal durations only after metadata is received',()=>{
 assert.match(app,/function durationFor\(track\)/);
 assert.match(app,/function saveRecordingDuration\(\)/);
 assert.match(app,/localStorage\.setItem\('ava-v2-duration-'/);
 assert.match(app,/recAudio\.addEventListener\('loadedmetadata',saveRecordingDuration\)/);
 assert.match(app,/مدت: پس از انتخاب/);
 assert.match(html,/id="recordingSeek"[^>]*disabled/);
});
test('Program title, day and details are grounded in published schedule metadata',()=>{
 assert.ok(shows.schedule.dayPrograms && typeof shows.schedule.dayPrograms==='object');
 for(const day of Object.keys(shows.schedule.dayPrograms))assert.ok(/^[0-6]$/.test(day));
 assert.match(html,/id="nextShowTitle"/);
 assert.match(html,/id="nextShowDetails"/);
 assert.match(app,/function renderSchedule\(\)/);
 assert.match(app,/titleForDay/);
 assert.match(app,/iranDate\.format\(next\.at\)/);
 assert.match(app,/event\.key==='Escape'/);
 assert.match(html,/class="footer-copyright"/);
});


test('Public page has canonical and social card metadata',()=>{
 assert.match(html,/rel="canonical" href="https:\/\/radio\.ibboabdoli\.com\/v2\/"/);
 assert.match(html,/property="og:url" content="https:\/\/radio\.ibboabdoli\.com\/v2\/"/);
 assert.match(html,/name="twitter:card" content="summary_large_image"/);
 const sitemap=get('../sitemap.xml');
 assert.match(sitemap,/https:\/\/radio\.ibboabdoli\.com\/v2\//);
 assert.match(sitemap,/https:\/\/radio\.ibboabdoli\.com\/v2\/privacy\.html/);
 assert.match(get('../robots.txt'),/Sitemap: https:\/\/radio\.ibboabdoli\.com\/sitemap\.xml/);
 const privacy=get('privacy.html');
 assert.match(privacy,/اطلاعات ثبت‌نام و حریم خصوصی/);
 assert.match(html,/href="\.\/privacy\.html"/);
 assert.match(get('manage.html'),/noindex,nofollow/);
});
test('No eager archive media requests or unnecessary polling',()=>{
 assert.match(html,/id="recordingAudio" preload="none"/);
 assert.ok(!app.includes('chooseRecording(0,false);\\n    // Initial selection'),'No eager default archive selection');
 assert.match(app,/Do not download archived audio metadata/);
 assert.match(app,/statsFailures/);
 assert.match(app,/Math\.min\(180000,45000/);
 assert.match(app,/document\.hidden/);
});
test('Telegram request opens directly, with no copy form or data transmission',()=>{
 const interaction=get('interaction.js');
 assert.match(html,/id="requestSongLink"/);
 assert.match(html,/نوشتن پیام در تلگرام/);
 assert.ok(!html.includes('id="songRequestForm"'));
 assert.ok(!html.includes('id="songRequestCopy"'));
 assert.ok(!interaction.includes("const requestForm=$('songRequestForm')"));
 const telegram=new URL(shows.links.requestSong);
 assert.equal(telegram.hostname,'t.me');
});
test('Arash live heading, compact dock and archive selection lock',()=>{
 assert.match(html,/id="listenTitle">پخش زنده رادیو آوا و نوا با آرش/);
 assert.ok(!html.includes('مجری همیشگی'));
 assert.match(html,/id="recordingPlay"[^>]*disabled/);
 assert.match(app,/if\(state\.recordingIndex<0\)\{setText\('recordingMessage'/);
 assert.match(css,/--radio-mobile-nav-height/);
 assert.match(css,/\.player-dock\{bottom:var\(--radio-mobile-nav-height\)/);
});
test('Approved iOS and Android images and steps show without JS fallback',()=>{
 for(const platform of ['ios','android']){
   assert.match(html,new RegExp('src="../assets/'+platform+'-install-1\\.jpg"'));
   assert.match(html,new RegExp('data-install-src="../assets/'+platform+'-install-4\\.jpg"'));
 }
 assert.equal((html.match(/class="install-step-card" data-step-active="false" hidden/g)||[]).length,6);
 assert.match(css,/\.install-slider \.install-step-card\[hidden\]\{display:none!important\}/);
 assert.ok(!get('install-guide.js').includes('picture.src=src'),'Use the statically supplied approved JPEGs');
 assert.equal((html.match(/class="install-slider-dot(?: active)?"/g)||[]).length,8);
});


test('Radio live panel is compact and community card actions are identical',()=>{
 const contest=html.slice(html.indexOf('<section class="container section-block" id="community"'),html.indexOf('<section class="container install-detail'));
 assert.equal((contest.match(/class="community-card(?: feature-card)?"/g)||[]).length,4);
 assert.ok(!contest.includes('contest-facts'));
 assert.ok(!contest.includes('contest-info'));
 assert.ok(!contest.includes('contest-privacy'));
 assert.equal((contest.match(/class="(?:btn btn-gold )?community-action(?: telegram-request-link)?"/g)||[]).length,5);
 assert.match(css,/\.live-layout\{align-items:start\}/);
 assert.match(css,/\.community-grid\{align-items:stretch;grid-auto-rows:1fr\}/);
 assert.match(css,/\.recording-player \.rec-play\{/);
 assert.match(css,/\.live-panel \.waveform\{/);
 assert.match(html,/class="visually-hidden">پخش برنامه ضبط‌شده/);
 assert.match(app,/function renderCompetition\(\)/);
 assert.ok(!app.includes("$('contestRules')"),'No removed contest UI fields referenced at runtime');
});


test('Install step navigation synchronizes the counter, buttons and visible image',()=>{
 const guide=get('install-guide.js');
 const begin=guide.indexOf('    const show=index=>{');
 const end=guide.indexOf("    previous.addEventListener('click'",begin);
 assert.ok(begin>=0 && end>begin);
 const run=step=>{
   const cards=Array.from({length:4},(_,i)=>({hidden:i!==0,dataset:{stepActive:String(i===0)},setAttribute(name,value){this[name]=value;}}));
   const dots=Array.from({length:4},()=>({classList:{toggle(name,value){this[name]=value;}},setAttribute(name,value){this[name]=value;}}));
   const previous={disabled:true},next={disabled:false},count={textContent:''};
   const scope={cards,dots,previous,next,count,persianNumber:n=>String(n)};
   vm.runInNewContext('let current=0;\n'+guide.slice(begin,end)+'\nshow('+step+');',scope);
   return {cards,dots,previous,next,count};
 };
 for(let step=0;step<4;step++){
   const state=run(step);
   assert.equal(state.count.textContent,'مرحله '+(step+1)+' از 4');
   assert.equal(state.previous.disabled,step===0);
   assert.equal(state.next.disabled,step===3);
   assert.deepEqual(state.cards.map(x=>x.hidden),[0,1,2,3].map(i=>i!==step));
   assert.deepEqual(state.cards.map(x=>x.dataset.stepActive),[0,1,2,3].map(i=>String(i===step)));
   assert.deepEqual(state.dots.map(x=>x['aria-current']),[0,1,2,3].map(i=>i===step?'step':'false'));
 }
});

test('Archive play and pause icons remain visible with explicit solid borders',()=>{
 const play=css.match(/\.recording-player \.rec-play::before\{([^}]+)\}/);
 assert.ok(play,'Recording play icon selector must exist');
 assert.match(play[1],/border-left:13px solid #f1ca95/,'Play arrow must have a solid border, not default none');
 assert.match(play[1],/border-top:8px solid transparent/);
 assert.match(play[1],/border-bottom:8px solid transparent/);
 assert.match(css,/\.recording-player \.rec-play\.is-playing::before\{[^}]*background:linear-gradient/);
 assert.match(html,/class="rec-play" disabled/);
});

test('Both tutorial platform cards are siblings inside the desktop grid',()=>{
 const from=html.indexOf('<div class="install-detail-grid">');
 const to=html.indexOf('<dialog id="installImageDialog"',from);
 assert.ok(from>0 && to>from,'Guide content must have its own grid');
 const block=html.slice(from,to);
 const tags=block.match(/<\/?div\b[^>]*>|<p class="install-tip">/g)||[];
 const direct=[],tips=[];
 let depth=0;
 for(const tag of tags){
   if(tag.startsWith('</div')){depth--;assert.ok(depth>=0,'No stray closing div');}
   else if(tag.startsWith('<p ')){tips.push(depth);}
   else {
     if(depth===1)direct.push(tag.match(/class="([^"]+)"/)?.[1]||'');
     depth++;
   }
 }
 assert.equal(depth,0,'Guide grid must close before the bottom notes');
 assert.deepEqual(direct,['install-slider','install-slider'],'iOS and Android cards must be grid siblings');
 assert.deepEqual(tips,[2,2],'Platform notes must be inside their respective cards');
});



test('Approved responsive studio updates the original website without removing services',()=>{
 const studio=get('studio.js'),design=get('studio.css');
 new vm.Script(studio);
 const requiredIDs=['studioSidebar','studioSearchForm','studioSearch','studioArchive','studioGenres','studioDockSeek',
  'studioDockPrev','studioDockNext','studioDockCurrent','studioDockTotal','studioDockVolume','studioDockCover',
  'studioHeaderSearch','dockTitle','dockSubtitle','dockPlay','livePlay','recordingGrid','audiusGrid',
  'scheduleGrid','contestLink','requestSongLink','install','installImageDialog','mobileBottomNav'];
 for(const id of requiredIDs)assert.ok(html.includes('id="'+id+'"'),id);
 for(const item of ['class="hero studio-home container" id="home"','id="heroTitle">رادیو آوا و نوا',
  'موسیقی زنده، شعر و آواز با آرش','id="listenTitle">پخش زنده رادیو آوا و نوا با آرش',
  'class="studio-feature-logo" src="../radio-neon-logo.webp"','src="./studio.js?v=4"'])
  assert.ok(html.includes(item),item);
 for(const id of ['listen','schedule','music','episodes','community','install','about'])
  assert.ok(html.includes('id="'+id+'"'),'Preserved original section '+id);
 for(const token of ["$('audiusSearch')",
  "mode()==='recording'","setInterval(refreshDock,1000)"])
  assert.ok(studio.includes(token),'Studio controller maintains functional flow: '+token);
 assert.ok(app.includes("$('playerDock').classList.add('dock-active')"));
});

test('Ten gallery covers match the exact user-approved photographic art',()=>{
 const expected={
  'recording-1':'248c79b2901b23061399bda5c0b60501c64afa59',
  'recording-2':'89c0fed8278765ba3e284011f1b941f7dc9377e8',
  'recording-3':'87ba9d5826a990a4f8ad03b397b885a7b7007781',
  'recording-4':'5837909cc072b575806333aa024ba321f9fcc28b',
  'recording-5':'40603eee22cc3bb629f40d181e02a0746b847dad',
  'genre-traditional':'8c2fe10e4deee4089f59ca34899c9fecdcd822ed',
  'genre-pop':'cde773c36e0ec60bf4b5704bdf0f8cd1f6e4cd02',
  'genre-jazz':'eb9b291c280d9c0b294c76abe7684d0c7bc5084f',
  'genre-instrumental':'db47fcf26550e55326a6bf7747133ebce965a78e',
  'genre-electronic':'d2468c9731e5eb20e228622ae6d4ee1898ac3db1'
 };
 for(const [name,sha] of Object.entries(expected)){
   const path='gallery/'+name+'.webp';
   const binary=readFileSync(join(root,path));
   assert.ok(binary.length>10000,'Full cover present: '+name);
   assert.equal(binary.subarray(0,4).toString('ascii'),'RIFF');
   assert.equal(binary.subarray(8,12).toString('ascii'),'WEBP');
   const hash=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+binary.length),Buffer.from([0]),binary])).digest('hex');
   assert.equal(hash,sha,'Pixel-authenticated approved crop: '+name);
   if(name.startsWith('genre-')) assert.ok(html.includes('src="./'+path+'"'),name);
   assert.ok(sw.includes('./'+path),'PWA keeps correct artwork: '+name);
 }
 assert.ok(app.includes('state.shows.recordings.slice(0, 3)'));
 assert.equal((html.match(/data-studio-genre="/g)||[]).length,5);
 assert.equal((html.match(/class="studio-cover-card studio-genre-tile"/g)||[]).length,5);
});
test('Desktop tablet and mobile reproduce the approved responsive navigation',()=>{
 const design=get('studio.css');
 for(const rule of ['@media(min-width:1181px)','@media(max-width:1180px)',
 '@media(max-width:880px)','@media(max-width:700px)',
 '.studio-home.hero{display:flex!important;', '.studio-sidebar{display:flex;position:fixed;',
 '.studio-mobile-bottom','.studio-player-dock'])
  assert.ok(design.includes(rule),'Expected responsive design rule: '+rule);
 assert.equal((html.match(/data-mobile-tab="/g)||[]).length,4);
 for(const id of ['home','episodes','music','more'])assert.ok(html.includes('data-mobile-tab="'+id+'"'));
 assert.ok(sw.includes('ava-v2-static-38'));
 assert.ok(sw.includes('studio.css?v=6'));
 assert.ok(sw.includes('studio.js?v=4'));
 assert.ok(!sw.includes('archive.ibboabdoli.com'),'No recorded audio pre-cache');
});

test('Approved player, equalizer, iPhone volume and section order are integrated',()=>{
 const studio=get('studio.css');
 assert.ok(html.includes('class="studio-feature-logo" src="../radio-neon-logo.webp"'));
 assert.ok(!html.includes('class="studio-feature-background"'));
 assert.ok(studio.includes('.studio-feature-art'));
 const start=html.indexOf('<section class="container live-section" id="listen"');
 const episodes=html.indexOf('<section class="container section-block" id="episodes"');
 const music=html.indexOf('id="music"');
 const schedule=html.indexOf('<section class="container section-block" id="schedule"');
 const community=html.indexOf('<section class="container section-block" id="community"');
 assert.ok(start>=0 && start<episodes && episodes<music && music<schedule && schedule<community);
 const sidebar=html.slice(html.indexOf('<nav class="studio-side-nav"'),html.indexOf('</nav>',html.indexOf('<nav class="studio-side-nav"')));
 const positions=['#home','#episodes','#music','#schedule','#community','#install','#about'].map(x=>sidebar.indexOf('href="'+x+'"'));
 assert.ok(positions.every(x=>x>=0),'All navigation targets exist');
 assert.deepEqual([...positions].sort((a,b)=>a-b),positions,'Menu matches site order');
 assert.ok(html.includes('id="recordingShuffle"') && html.includes('id="recordingRepeat"'));
 assert.ok(app.includes("recAudio.loop=!recAudio.loop"));
 assert.ok(app.includes("chooseRecording(index,true)"));
 assert.ok(studio.includes('.approved-recording-controls'));
 assert.ok(studio.includes('.studio-dock-controls #dockPlay'));
 assert.ok(studio.includes('#waveform.is-active span'));
 assert.ok(studio.includes('@keyframes studioRadioEQ'));
 assert.equal((html.match(/--eq-h:/g)||[]).length,62);
 assert.ok(studio.includes('@media(prefers-reduced-motion:reduce)'));
 assert.ok(app.includes("classList.add('ios-volume-native')"));
 assert.ok(studio.includes('.ios-volume-native .live-panel .volume-control'));
 assert.ok(studio.includes('.ios-volume-native #studioDockVolume'));
 assert.ok(html.includes('id="liveVolume"'),'Desktop slider remains');
});


test('Approved full-screen music and live player uses existing audio sources without duplicates',()=>{
 const js=get('expanded-player.js'),styles=get('expanded-player.css');
 new vm.Script(js);
 assert.match(html,/id="expandedPlayerDialog"[^>]*aria-modal="true"/);
 assert.match(html,/id="studioDockExpand"[^>]*aria-haspopup="dialog"/);
 for(const id of ['expandedPlayerClose','expandedPlayerKind','expandedPlayerCover','expandedPlayerTitle',
 'expandedPlayerArtist','expandedLiveBadge','expandedLiveWave','expandedProgress','expandedSeek',
 'expandedElapsed','expandedTotal','expandedPrev','expandedPlay','expandedNext',
 'expandedShuffle','expandedRepeat','expandedDetails','expandedShare','expandedPlayerStatus']){
   assert.ok(html.includes('id="'+id+'"'),id);
 }
 for(const tag of ['liveAudio','recordingAudio','audiusAudio']){
   assert.equal((html.match(new RegExp('id="'+tag+'"','g'))||[]).length,1,'Single original audio element: '+tag);
 }
 assert.match(html,/expanded-player\.js\?v=4/);
 assert.match(html,/expanded-player\.css\?v=3/);
 assert.ok(sw.includes("./expanded-player.js?v=4"));
 assert.ok(sw.includes("./expanded-player.css?v=3"));
 assert.ok(!js.includes("createElement('audio')"),'No duplicated audio engine');
 assert.ok(!js.includes("new Audio("),'No duplicated playback source');
 assert.ok(!js.includes("audio.load()"),'Opening full player must not reload media');
 assert.match(js,/dialog\.showModal\(\)/);
 assert.match(js,/dialog\.close\(\)/);
 assert.match(js,/document\.body\.classList\.remove\('expanded-player-open'\)/);
 assert.match(js,/lastFocused\?\.isConnected/);
 assert.match(js,/\$\('livePlay'\)/);
 assert.ok(js.includes("mode==='recording'?'recordingPlay'"));
 assert.ok(js.includes("mode==='recording'?'recordingPlay':'audiusToggle'"));
 assert.match(js,/\$\('recordingShuffle'\)/);
 assert.match(js,/\$\('recordingRepeat'\)/);
 assert.match(styles,/\.expanded-player-dialog\[data-expanded-mode="live"\] #expandedPrev/);
 assert.match(styles,/\.expanded-player-progress\[hidden\]/);
 assert.match(styles,/\.expanded-live-wave\.is-active span/);
 assert.match(styles,/@media\(max-width:700px\)/);
 assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
});
test('Full player cover uses real selected Audius artwork, recorded images or station logo',()=>{
 const js=get('expanded-player.js');
 assert.match(js,/const coverIds=\['gallery\/recording-1\.webp'/);
 assert.match(js,/\$\('audiusCover'\)/);
 assert.match(js,/const currentCover=mode=>/);
 assert.match(js,/if\(mode==='live'\)return fallback/);
 assert.match(js,/const selectedRecording=/);
 assert.match(js,/cover\.alt='کاور '\+title/);
 assert.match(js,/navigator\.share/);
 assert.match(js,/navigator\.clipboard\.writeText\(url\)/);
});

test('Full-screen controls are unambiguous and fit the approved mobile design',()=>{
 const js=get('expanded-player.js'),css=get('expanded-player.css');
 const prev=html.match(/<button id="expandedPrev"[^>]*>([\s\S]*?)<\/button>/)?.[1];
 const next=html.match(/<button id="expandedNext"[^>]*>([\s\S]*?)<\/button>/)?.[1];
 assert.match(prev||'',/<svg viewBox="0 0 24 24"/);
 assert.match(next||'',/<svg viewBox="0 0 24 24"/);
 assert.ok(!prev.includes('⏮')&&!next.includes('⏭'),'Avoid platform-dependent blue emoji');
 assert.ok(html.includes('id="expandedDetailsLabel"'));
 assert.ok(js.includes("'بازگشت به موسیقی'"));
 assert.ok(js.includes("'فهرست برنامه‌ها'"));
 assert.ok(js.includes("'قطعه بدون عنوان'"));
 assert.ok(!js.includes('safeProvider'));
 assert.ok(js.includes('liveListening&&audio.readyState')===false,'No redundant live state check');
 assert.ok(js.includes('audio.readyState>=2'));
 assert.ok(js.includes("badge.classList.toggle('is-listening',liveListening)"));
 assert.ok(css.includes('.expanded-player-dialog[data-expanded-mode="live"] .expanded-cover-frame'));
 assert.ok(css.includes('height:100dvh;max-height:100dvh;overflow:hidden'));
 assert.ok(css.includes('width:min(100%,31dvh,315px)'));
 assert.ok(css.includes('width:min(100%,34dvh,345px)'));
 assert.ok(css.includes('.expanded-transport .expanded-transport-skip svg'));
 assert.ok(css.includes('@media(max-width:700px) and (max-height:560px)'));
 assert.ok(css.includes('.expanded-live-badge:not(.is-listening)'));
});

test('Share control always distributes our own radio website',()=>{
 const js=get('expanded-player.js');
 assert.ok(js.includes("const url='https://radio.ibboabdoli.com/v2/'"));
 assert.ok(js.includes("const title='رادیو آوا و نوا'"));
 assert.ok(!js.includes('const mode=getMode(),url=new URL(source.href,location.href).href'));
 assert.match(js,/navigator\.share\(\{title,url\}\)/);
 assert.match(js,/navigator\.clipboard\.writeText\(url\)/);
});
test('Music cards stay in-site and the external Audius arrow controls are gone',()=>{
 const provider=get('audius.js');
 assert.ok(!provider.includes("element('a','audius-source'"));
 assert.ok(!html.includes('class="audius-provider-link"'));
 assert.ok(!html.includes('id="audiusSourceLink"'));
 assert.ok(!html.includes('href="https://audius.co/"'));
 assert.ok(html.includes('audius-provider-name'));
 assert.ok(html.includes('audius-source-attribution'));
 assert.match(provider,/choose\.addEventListener\('click'/);
 assert.match(provider,/audio\.src=urlFor\(track\.id\)/);
 assert.ok(get('expanded-player.js').includes("source.href=isLive?'#listen':mode==='recording'?'#episodes':'#music'"));
 assert.ok(!get('expanded-player.js').includes("url.hostname==='audius.co'"));
 assert.match(css,/\.audius-track-actions\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('Expanded desktop player uses the complete width without touching the approved mobile layout',()=>{
 const css=get('expanded-player.css');
 assert.ok(css.includes('@media(min-width:901px)'));
 assert.ok(css.includes('width:min(1260px,calc(100% - 70px))'));
 assert.ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(0,.95fr)'));
 assert.ok(css.includes('grid-column:1;grid-row:1 / -1'));
 assert.ok(css.includes('.expanded-track-details{grid-column:2;grid-row:2'));
 assert.ok(css.includes('grid-column:2;grid-row:3'));
 assert.ok(css.includes('grid-column:2;grid-row:4'));
 assert.ok(css.includes('grid-column:2;grid-row:5'));
 assert.ok(css.includes('overflow:hidden'));
 assert.ok(css.includes('@media(min-width:701px) and (max-width:900px)'));
 assert.ok(css.includes('@media(max-width:700px)'));
 assert.ok(css.includes('width:min(100%,31dvh,315px)'));
 assert.ok(html.includes('expanded-player.css?v=3'));
 assert.ok(sw.includes('expanded-player.css?v=3'));
});

test('The public music library links to packaged assets and opts into cross-origin audio',()=>{
 const page=get('music-library/index.html');
 assert.match(get('index.html'),/href="\.\/music-library\/"/);
 for(const name of ['club-archive.css','club-archive.js']){
   assert.ok(page.includes('./'+name),name);
   assert.ok(existsSync(join(root,'music-library',name)),name);
 }
 assert.match(page,/<audio[^>]*crossorigin="anonymous"/);
 assert.ok(existsSync(join(root,'music-library','club-artist-portraits.json')));
});
