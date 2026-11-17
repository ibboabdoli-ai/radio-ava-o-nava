/* Radio Ava o Nava v2 — no API keys or Icecast admin credentials in public code. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fa = n => new Intl.NumberFormat('fa-IR').format(n);
  const days = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
  const wk = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const genres = [{id:'all',title:'همه سبک‌ها'},{id:'traditional',title:'سنتی و دستگاهی'},{id:'pop',title:'پاپ ایرانی'},{id:'nostalgic',title:'نوستالژیک'},{id:'instrumental',title:'بی‌کلام'},{id:'modern',title:'پاپ جدید'}];
  const FALLBACK = {schedule:{weekdays:[6,0,1,2,3],hour:22,minute:0},recordings:[],links:{stream:'https://live.ibboabdoli.com/stream',stats:'https://live.ibboabdoli.com/radio-stats.xsl',clubhouse:'https://www.clubhouse.com/',contest:'https://docs.google.com/forms/d/e/1FAIpQLSewM20f3DLbL2yz60VNdestV-9ZJfLAaA8ivepjCWbx88_TzQ/viewform?usp=header',telegram:'https://t.me/+nFR4GhHTc7Y3ZjNk',whatsapp:'https://www.whatsapp.com/channel/0029VbDqKNg5vKA9OxDV4046'},program:{title:'آوا و نوا',subtitle:'موسیقی، شعر و آواز'}};
  const state = {shows:FALLBACK,tracks:[],filter:'all',artist:'all',search:'',favoritesOnly:false,selectedMusic:null,filtered:[],musicWidget:null,musicReady:false,musicPlaying:false,pendingMusicAutoPlay:false,recordingIndex:-1,mode:'idle',liveWanted:false,liveTries:0,liveTimer:null,liveWatchdog:null,liveSequence:0,lastStats:null,lastStatsTime:0,lastStatsStarted:null};
  const liveAudio=$('liveAudio'), recAudio=$('recordingAudio'), musicFrame=$('musicFrame');
  const host = el => document.createElement(el);
  const elText = (name,text,className) => {const n=host(name);n.textContent=String(text ?? '');if(className)n.className=className;return n;};
  const setText=(id,text)=>{const n=$(id);if(n)n.textContent=String(text);};
  const fmtDuration = n => {if(!Number.isFinite(n)||n<0)return '--:--';const sec=Math.floor(n);const h=Math.floor(sec/3600),m=String(Math.floor((sec%3600)/60)).padStart(2,'0'),s=String(sec%60).padStart(2,'0');return h?h+':'+m+':'+s:m+':'+s;};
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  let deferredInstall=null, toastTimeout=null, currentLiveToken=0;
  const safeHttps=(url,hostnames)=>{try{const u=new URL(url);return u.protocol==='https:'&&(!hostnames||hostnames.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))?u.href:null;}catch{return null;}};
  function toast(message){const t=$('toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.hidden=true,5500);}
  function setLink(id,url){const n=$(id),v=safeHttps(url);if(!n)return;if(v)n.href=v;else n.removeAttribute('href');}
  function setDock(title,subtitle,playState,href){setText('dockTitle',title);setText('dockSubtitle',subtitle);setText('dockPlay',playState?'Ⅱ':'▶');$('dockDetail').href=href;let action=state.mode==='recording'?'پخش یا مکث برنامه':state.mode==='music'?'کنترل موسیقی':'پخش یا توقف زنده';$('dockPlay').setAttribute('aria-label',action);}
  function saveFavorites(favs){try{localStorage.setItem('ava-v2-favs',JSON.stringify([...favs].slice(0,100)))}catch{}}
  const favorites=(()=>{try{const v=JSON.parse(localStorage.getItem('ava-v2-favs')||'[]');return new Set(Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,100):[])}catch{return new Set()}})();
  const fmtTime=(date,tz)=>new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
  const dayInTehran=date=>wk[new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short'}).format(date)];
  function showCandidates(){
    const cfg=state.shows.schedule||FALLBACK.schedule,now=new Date(),results=[];
    const utcMidnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
    for(let d=-1;d<10;d++){
      // Tehran currently uses UTC+03:30. Verify both wall-clock and weekday with Intl.
      const candidate=new Date(utcMidnight+d*86400000+(cfg.hour-3)*3600000+(cfg.minute-30)*60000);
      if(candidate.getTime()<=now.getTime())continue;
      if(!cfg.weekdays.includes(dayInTehran(candidate)))continue;
      if(fmtTime(candidate,'Asia/Tehran')!==String(cfg.hour).padStart(2,'0')+':'+String(cfg.minute).padStart(2,'0'))continue;
      results.push({at:candidate,day:dayInTehran(candidate)});
    }
    return results;
  }
  function renderSchedule(){
    const items=showCandidates();const cfg=state.shows.schedule||FALLBACK.schedule,grid=$('scheduleGrid');grid.replaceChildren();
    for(const day of cfg.weekdays){
      const show=items.find(x=>x.day===day);const card=host('article');card.className='schedule-card'+(items[0]?.day===day?' is-next':'');
      card.append(elText('small','برنامه هفتگی'),elText('strong',days[day]),elText('span','۲۲:۰۰ ایران','schedule-time'),elText('span',show?fmtTime(show.at,'Europe/Stockholm')+' سوئد':'—','secondary-time'),elText('span',show?fmtTime(show.at,'Europe/London')+' انگلیس':'—','secondary-time'));grid.append(card);
    }
  }
  function updateClocks(){
    const now=new Date();
    setText('clockIran',fmtTime(now,'Asia/Tehran'));setText('clockSweden',fmtTime(now,'Europe/Stockholm'));setText('clockUk',fmtTime(now,'Europe/London'));
    const next=showCandidates()[0];if(!next){setText('nextShowDay','برنامه بعدی مشخص نیست');setText('nextCountdown','--:--:--');return;}
    setText('nextShowDay',days[next.day]);const left=Math.max(0,Math.floor((next.at.getTime()-Date.now())/1000));setText('nextCountdown',[Math.floor(left/3600),Math.floor(left%3600/60),left%60].map(v=>String(v).padStart(2,'0')).join(':'));
  }
  function updateStatsUI(){
    const old=Date.now()-state.lastStatsTime>30000,stats=state.lastStats;
    if(!stats||old){setText('serverBadge','وضعیت نامشخص');$('serverBadge').className='live-pill';setText('stationState','نامشخص');setText('listenerCount','نامشخص');setText('liveDuration','--:--:--');return;}
    setText('serverBadge',stats.live?'● در حال پخش زنده':'رادیو خاموش است');$('serverBadge').className='live-pill '+(stats.live?'is-on':'is-off');
    setText('stationState',stats.live?'زنده':'خاموش');setText('listenerCount',fa(stats.live?stats.listeners:0));
    setText('liveDuration',stats.live&&state.lastStatsStarted?fmtDuration((Date.now()-state.lastStatsStarted)/1000):stats.live?'--:--:--':'00:00:00');
  }
  let polling=false;
  async function pollStats(){
    if(polling)return;polling=true;
    const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),7000);
    try{
      const url=safeHttps(state.shows.links.stats,['ibboabdoli.com']);if(!url)throw Error('invalid stats URL');
      const r=await fetch(url+'?t='+Date.now(),{cache:'no-store',mode:'cors',signal:ctl.signal});
      if(!r.ok)throw Error('HTTP '+r.status);
      const s=await r.json();if(typeof s.live!=='boolean'||!Number.isSafeInteger(Number(s.listeners))||Number(s.listeners)<0)throw Error('bad stats');
      const started=typeof s.startedAt==='string'?Date.parse(s.startedAt.replace(/([+-]\d{2})(\d{2})$/,'$1:$2')):NaN;
      state.lastStats={live:s.live,listeners:Number(s.listeners)};
      state.lastStatsStarted=Number.isFinite(started)&&started<=Date.now()+15000&&started>0?started:null;
      state.lastStatsTime=Date.now();
    }catch{/* Unknown is not OFFLINE. */}finally{clearTimeout(timeout);polling=false;updateStatsUI();}
  }
  function clearLiveTimers(){clearTimeout(state.liveTimer);clearTimeout(state.liveWatchdog);state.liveTimer=null;state.liveWatchdog=null;}
  function liveUI(label,details,isPlaying){setText('liveAction',label);setText('liveMessage',details);setText('livePlayIcon',isPlaying?'Ⅱ':'▶');$('waveform').classList.toggle('is-active',isPlaying);setDock('رادیو آوا و نوا',details,isPlaying,'#listen');}
  function stopLive(message='پخش متوقف شد.',update=true){state.liveWanted=false;state.liveSequence++;clearLiveTimers();liveAudio.pause();liveAudio.removeAttribute('src');liveAudio.load();state.liveTries=0;if(state.mode==='live')state.mode='idle';if(update)liveUI('پخش زنده','برای شروع، دکمه پخش را بزنید.',false);setText('liveMessage',message);}
  function pauseMusic(){if(state.musicWidget&&state.musicReady)try{state.musicWidget.pause();}catch{} state.musicPlaying=false;}
  function suspendOtherModes(next){
    if(next!=='live'&&state.liveWanted)stopLive('پخش زنده برای شنیدن محتوای دیگر متوقف شد.',false);
    if(next!=='recording'&&!recAudio.paused)recAudio.pause();
    if(next!=='music')pauseMusic();
    state.mode=next;
  }
  async function connectLive(){
    if(!state.liveWanted)return;
    const token=++state.liveSequence;currentLiveToken=token;clearLiveTimers();
    const url=safeHttps(state.shows.links.stream,['ibboabdoli.com']);
    if(!url){stopLive('آدرس پخش معتبر نیست.');return;}
    liveUI('در حال اتصال','در حال دریافت صدای رادیو…',false);
    liveAudio.pause();liveAudio.src=url+(url.includes('?')?'&':'?')+'v='+Date.now();liveAudio.load();
    state.liveWatchdog=setTimeout(()=>{if(state.liveWanted&&token===state.liveSequence&&liveAudio.readyState<3)retryLive();},16000);
    try{await liveAudio.play();}catch{if(state.liveWanted&&token===state.liveSequence)retryLive();}
  }
  function retryLive(){
    if(!state.liveWanted||state.liveTimer)return;
    clearTimeout(state.liveWatchdog);liveAudio.pause();state.liveTries++;
    if(state.liveTries>6){stopLive('پس از چند تلاش، اتصال برقرار نشد. دوباره پخش را بزنید.');toast('اتصال پخش زنده برقرار نشد. وضعیت سرور را بررسی کن.');return;}
    const delay=Math.min(2000*Math.pow(1.6,state.liveTries-1),12000);
    liveUI('اتصال مجدد','تلاش '+fa(state.liveTries)+' از ۶ برای وصل‌شدن رادیو',false);
    state.liveTimer=setTimeout(()=>{state.liveTimer=null;connectLive();},delay);
  }
  function toggleLive(){
    if(state.liveWanted){stopLive();return;}
    suspendOtherModes('live');state.liveWanted=true;state.liveTries=0;connectLive();
  }
  $('livePlay').addEventListener('click',toggleLive);
  liveAudio.addEventListener('playing',()=>{if(!state.liveWanted)return;clearLiveTimers();state.liveTries=0;liveUI('پخش زنده فعال است','شما در حال شنیدن رادیو آوا و نوا هستید.',true);setMediaSession('رادیو آوا و نوا','پخش زنده',()=>{if(!state.liveWanted)toggleLive();else if(liveAudio.paused)connectLive();},()=>stopLive());});
  liveAudio.addEventListener('waiting',()=>{if(state.liveWanted){liveUI('در حال دریافت صدا','منتظر اتصال پایدار به سرور…',false);clearTimeout(state.liveWatchdog);const token=state.liveSequence;state.liveWatchdog=setTimeout(()=>{if(state.liveWanted&&token===state.liveSequence&&liveAudio.readyState<3)retryLive();},12000)}});
  liveAudio.addEventListener('stalled',()=>{if(state.liveWanted&&liveAudio.readyState<3)retryLive()});
  liveAudio.addEventListener('error',()=>{if(state.liveWanted)retryLive()});
  liveAudio.addEventListener('ended',()=>{if(state.liveWanted)retryLive()});
  window.addEventListener('online',()=>{if(state.liveWanted&&liveAudio.paused){clearLiveTimers();connectLive();}});
  if(isIOS){$('liveVolume').disabled=true;setText('liveVolumeValue','با دکمه گوشی');}else{
    liveAudio.volume=.8;$('liveVolume').addEventListener('input',e=>{const val=Number(e.target.value);liveAudio.volume=val/100;setText('liveVolumeValue',fa(val)+'٪');});
  }
  function setMediaSession(title,artist,play,pause){
    if(!('mediaSession' in navigator)||!('MediaMetadata' in window))return;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title,artist,album:'Radio Ava o Nava',artwork:[{src:new URL('../radio-neon-logo.webp',location.href).href,sizes:'512x512',type:'image/webp'}]});
      navigator.mediaSession.setActionHandler('play',play);navigator.mediaSession.setActionHandler('pause',pause);
    }catch{/* Browser does not support requested media controls. */}
  }
  function renderRecordings(){
    const grid=$('recordingGrid');grid.replaceChildren();const tracks=state.shows.recordings||[];
    if(!tracks.length){grid.append(elText('p','در حال حاضر فایل ضبط‌شده‌ای در دسترس نیست.','empty-state'));return;}
    tracks.forEach((track,i)=>{
      const b=host('button');b.type='button';b.className='recording-card'+(state.recordingIndex===i?' active':'');
      const num=elText('span',String(i+1).padStart(2,'0'),'rec-number'),wrapper=host('span');
      wrapper.append(elText('strong',track.title),elText('small',track.time+' · '+track.date));b.append(num,wrapper);b.addEventListener('click',()=>chooseRecording(i,false));grid.append(b);
    });
  }
  function chooseRecording(i,autoplay=false){
    const tracks=state.shows.recordings||[];if(!tracks.length)return;
    const target=(i+tracks.length)%tracks.length,track=tracks[target],url=safeHttps(track.src,['ibboabdoli.com']);
    if(!url){toast('آدرس فایل ضبط‌شده معتبر نیست.');return;}
    suspendOtherModes('recording');recAudio.pause();state.recordingIndex=target;recAudio.src=url;recAudio.load();
    setText('recordingTitle',track.title);setText('recordingMeta',track.time+' · '+track.date);
    $('recordingSeek').value=0;setText('recordingCurrent','00:00');setText('recordingTotal','--:--');setText('recordingMessage','برای شنیدن برنامه دکمه پخش را بزنید.');
    setText('recordingPlay','▶');renderRecordings();setDock(track.title,'آرشیو رادیو',false,'#episodes');
    try{const saved=Number(localStorage.getItem('ava-v2-position-'+track.id));if(Number.isFinite(saved)&&saved>0)recAudio.addEventListener('loadedmetadata',()=>{if(saved<recAudio.duration-10)recAudio.currentTime=saved;},{once:true});}catch{}
    if(autoplay)recAudio.play().catch(()=>setText('recordingMessage','پخش خودکار مجاز نبود؛ دکمه پخش را بزنید.'));
  }
  function toggleRecording(){
    if(state.recordingIndex<0){chooseRecording(0,false);}
    if(recAudio.paused){suspendOtherModes('recording');recAudio.play().catch(()=>setText('recordingMessage','فایل باز نشد. اتصال اینترنت یا دسترسی به آرشیو را بررسی کن.'));}
    else recAudio.pause();
  }
  $('recordingPlay').addEventListener('click',toggleRecording);
  $('recordingPrev').addEventListener('click',()=>chooseRecording(state.recordingIndex-1,false));
  $('recordingNext').addEventListener('click',()=>chooseRecording(state.recordingIndex+1,false));
  $('recordingSeek').addEventListener('input',e=>{if(Number.isFinite(recAudio.duration)&&recAudio.duration>0)recAudio.currentTime=Number(e.target.value)/1000*recAudio.duration;});
  recAudio.addEventListener('play',()=>{suspendOtherModes('recording');setText('recordingPlay','Ⅱ');const item=state.shows.recordings[state.recordingIndex];setDock(item.title,'در حال پخش آرشیو',true,'#episodes');setMediaSession(item.title,'آرشیو آوا و نوا',()=>recAudio.play(),()=>recAudio.pause());});
  recAudio.addEventListener('pause',()=>{setText('recordingPlay','▶');if(state.mode==='recording'){const it=state.shows.recordings[state.recordingIndex];if(it)setDock(it.title,'مکث شده',false,'#episodes');}});
  let saveAt=0;
  recAudio.addEventListener('timeupdate',()=>{
    setText('recordingCurrent',fmtDuration(recAudio.currentTime));if(Number.isFinite(recAudio.duration)&&recAudio.duration>0)$('recordingSeek').value=Math.floor(1000*recAudio.currentTime/recAudio.duration);
    if(Date.now()-saveAt>5000){saveAt=Date.now();const it=state.shows.recordings[state.recordingIndex];if(it)try{localStorage.setItem('ava-v2-position-'+it.id,String(Math.round(recAudio.currentTime)));}catch{}}
  });
  recAudio.addEventListener('loadedmetadata',()=>setText('recordingTotal',fmtDuration(recAudio.duration)));
  recAudio.addEventListener('ended',()=>chooseRecording(state.recordingIndex+1,true));
  recAudio.addEventListener('error',()=>setText('recordingMessage','بارگذاری ضبط ممکن نشد؛ فایل بعدی را امتحان کنید.'));
  function filteredTracks(){
    const q=state.search.toLocaleLowerCase('fa').trim();
    return state.tracks.filter(t=>(state.filter==='all'||t.genres.includes(state.filter))&&(state.artist==='all'||t.artistId===state.artist)&&(!state.favoritesOnly||favorites.has(t.id))&&(!q||(t.title+' '+t.artist).toLocaleLowerCase('fa').includes(q)));
  }
  function updateArtistOptions(){
    const select=$('artistFilter'),previous=state.artist,ids=[...new Map(state.tracks.filter(t=>state.filter==='all'||t.genres.includes(state.filter)).map(t=>[t.artistId,t.artist])).entries()];
    select.replaceChildren();const all=host('option');all.value='all';all.textContent='همه هنرمندان';select.append(all);
    ids.forEach(([id,name])=>{const option=host('option');option.value=id;option.textContent=name;select.append(option)});
    if(ids.some(([id])=>id===previous))select.value=previous;else{select.value='all';state.artist='all';}
  }
  function renderMusic(){
    const grid=$('musicGrid');grid.replaceChildren();const items=state.filtered=filteredTracks();
    setText('musicCount',fa(items.length)+' مورد');$('musicEmpty').hidden=items.length!==0;
    for(const t of items){
      const card=host('article');card.className='music-card';
      const cover=host('div');cover.className='music-cover';cover.append(elText('span','♫'),elText('small','AVA O NAVA'));
      const details=host('div');details.className='music-details';
      details.append(elText('small',t.type==='album'?'آلبوم':'قطعه موسیقی','music-type'),elText('h3',t.title),elText('p',t.artist));
      const actions=host('div');actions.className='music-actions';
      const play=elText('button','▶ شنیدن','music-play');play.type='button';play.addEventListener('click',()=>chooseMusic(t,true));
      const fav=elText('button',favorites.has(t.id)?'♥':'♡','favorite-button'+(favorites.has(t.id)?' is-fav':''));fav.type='button';fav.setAttribute('aria-label',favorites.has(t.id)?'حذف از علاقه‌مندی‌ها':'افزودن به علاقه‌مندی‌ها');
      fav.addEventListener('click',()=>{if(favorites.has(t.id))favorites.delete(t.id);else favorites.add(t.id);saveFavorites(favorites);renderMusic();});
      actions.append(play,fav);details.append(actions);card.append(cover,details);grid.append(card);
    }
  }
  function renderFilters(){const filters=$('genreFilters');filters.replaceChildren();for(const g of genres){const button=elText('button',g.title);button.type='button';button.className=state.filter===g.id?'active':'';button.setAttribute('aria-pressed',String(state.filter===g.id));button.addEventListener('click',()=>{state.filter=g.id;state.artist='all';renderFilters();updateArtistOptions();renderMusic();});filters.append(button);}}
  $('musicSearch').addEventListener('input',e=>{state.search=e.target.value;renderMusic();});
  $('artistFilter').addEventListener('change',e=>{state.artist=e.target.value;renderMusic();});
  $('favoritesOnly').addEventListener('click',()=>{state.favoritesOnly=!state.favoritesOnly;$('favoritesOnly').classList.toggle('active',state.favoritesOnly);$('favoritesOnly').setAttribute('aria-pressed',String(state.favoritesOnly));renderMusic();});
  function chooseMusic(t,autoplay=false){
    const url=safeHttps(t.url,['soundcloud.com']);if(!url){toast('منبع موسیقی معتبر نیست.');return;}
    suspendOtherModes('music');state.selectedMusic=t;state.musicReady=false;state.musicPlaying=false;
    $('soundcloudPanel').hidden=false;setText('selectedMusicTitle',t.title);setText('selectedMusicArtist',t.artist);setText('musicStatus','پلیر رسمی در حال بارگذاری است…');setLink('musicOfficialUrl',url);
    if(window.SC&&window.SC.Widget){
      if(!state.musicWidget){musicFrame.src='https://w.soundcloud.com/player/?url='+encodeURIComponent(url)+'&auto_play=false&show_artwork=false';state.musicWidget=window.SC.Widget(musicFrame);
        const ev=window.SC.Widget.Events;
        state.musicWidget.bind(ev.READY,()=>{state.musicReady=true;setText('musicStatus','برای شنیدن، داخل پلیر یا دکمه پخش را بزنید.');if(state.pendingMusicAutoPlay){state.pendingMusicAutoPlay=false;try{state.musicWidget.play();}catch{setText('musicStatus','پخش خودکار مجاز نبود؛ دکمه پخش را بزنید.');}}});
        state.musicWidget.bind(ev.PLAY,()=>{suspendOtherModes('music');state.musicPlaying=true;setText('musicStatus','در حال پخش از منبع رسمی');setDock(state.selectedMusic?.title||'آرشیو موسیقی',state.selectedMusic?.artist||'رادیو آوا و نوا',true,'#music');});
        state.musicWidget.bind(ev.PAUSE,()=>{state.musicPlaying=false;if(state.mode==='music')setDock(state.selectedMusic?.title||'موسیقی','مکث شده',false,'#music');});
        state.musicWidget.bind(ev.FINISH,()=>{state.musicPlaying=false;playAdjacent(1,true);});
        if(ev.ERROR)state.musicWidget.bind(ev.ERROR,()=>{state.musicReady=false;setText('musicStatus','این منبع پخش نشد؛ لینک رسمی آهنگ را باز کن.');});
      }else state.musicWidget.load(url,{auto_play:false,show_artwork:false,show_user:true,sharing:true});
    }else{
      musicFrame.src='https://w.soundcloud.com/player/?url='+encodeURIComponent(url)+'&auto_play=false&show_artwork=false';
      setText('musicStatus','از دکمه پخش داخل پلیر رسمی استفاده کن.');
    }
    setDock(t.title,t.artist,false,'#music');
    $('soundcloudPanel').scrollIntoView({behavior:'smooth',block:'center'});
    if(autoplay){setText('musicStatus','بعد از آماده‌شدن پلیر، پخش را بزنید.');}
  }
  function playAdjacent(dir,auto=false){
    if(!state.selectedMusic)return;const items=state.filtered.length?state.filtered:state.tracks;const pos=items.findIndex(t=>t.id===state.selectedMusic.id);
    if(pos<0||!items[pos+dir]){setText('musicStatus','در این فهرست آهنگ دیگری وجود ندارد.');return;}
    state.pendingMusicAutoPlay=auto;chooseMusic(items[pos+dir],false);
  }
  $('musicPrev').addEventListener('click',()=>playAdjacent(-1));
  $('musicNext').addEventListener('click',()=>playAdjacent(1));
  function toggleMusic(){
    if(!state.selectedMusic){toast('اول یک آهنگ را انتخاب کن.');return;}
    if(!state.musicWidget||!state.musicReady){toast('برای پخش، دکمه داخل پلیر رسمی را بزن.');return;}
    try{if(state.musicPlaying)state.musicWidget.pause();else state.musicWidget.play();}catch{toast('پلیر رسمی پاسخ نداد؛ از لینک منبع استفاده کن.');}
  }
  $('musicToggle').addEventListener('click',toggleMusic);
  $('dockPlay').addEventListener('click',()=>{if(state.mode==='live'||state.mode==='idle')toggleLive();else if(state.mode==='recording')toggleRecording();else toggleMusic();});
  function wireNavigation(){const nav=$('navigation'),menu=$('menuButton');
    menu.addEventListener('click',()=>{const open=!nav.classList.contains('open');nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));});
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');nav.querySelectorAll('a').forEach(n=>n.classList.toggle('current',n===a));}));
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('installButton').hidden=false;});
  $('installButton').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice.catch(()=>{});deferredInstall=null;$('installButton').hidden=true;});
  async function init(){
    wireNavigation();setDock('رادیو آوا و نوا','آماده پخش',false,'#listen');
    try{
      const [shows,catalog]=await Promise.all([fetch('./shows.json',{cache:'no-store'}),fetch('./catalog.json',{cache:'no-store'})]);
      if(!shows.ok||!catalog.ok)throw Error('Content unavailable');
      const [a,b]=await Promise.all([shows.json(),catalog.json()]);
      if(!a.links||!Array.isArray(a.recordings)||!a.schedule||!Array.isArray(b.tracks))throw Error('Invalid content');
      state.shows=a;state.tracks=b.tracks.filter(t=>safeHttps(t.url,['soundcloud.com'])&&typeof t.title==='string'&&Array.isArray(t.genres));
    }catch{toast('بارگذاری برخی اطلاعات ممکن نشد؛ اتصال اینترنت را بررسی کن.');}
    setLink('clubhouseLink',state.shows.program.roomUrl||state.shows.links.clubhouse);
    setLink('houseLink',state.shows.program.roomUrl||state.shows.links.clubhouse);
    setLink('contestLink',state.shows.links.contest);setLink('telegramLink',state.shows.links.telegram);setLink('whatsappLink',state.shows.links.whatsapp);
    setText('liveProgram',state.shows.program.title||'آوا و نوا');setText('liveHost',state.shows.program.subtitle||'موسیقی، شعر و آواز');
    renderSchedule();updateClocks();renderFilters();updateArtistOptions();renderMusic();renderRecordings();if(state.shows.recordings.length)chooseRecording(0,false);
    // Initial selection must not force the dock into recordings mode.
    state.mode='idle';setDock('رادیو آوا و نوا','آماده پخش',false,'#listen');
    pollStats();
    setInterval(updateClocks,1000);setInterval(updateStatsUI,1000);setInterval(pollStats,12000);
    setInterval(renderSchedule,60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateClocks();renderSchedule();pollStats();}});
    window.addEventListener('online',pollStats);
    if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
  }
  init();
})();
