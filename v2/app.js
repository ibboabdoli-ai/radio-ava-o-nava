/* Radio Ava o Nava v2 — no API keys or Icecast admin credentials in public code. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fa = n => new Intl.NumberFormat('fa-IR').format(n);
  const days = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
  const wk = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const FALLBACK = {schedule:{weekdays:[6,0,1,2,3],hour:22,minute:0},recordings:[],links:{stream:'https://live.ibboabdoli.com/stream',stats:'https://live.ibboabdoli.com/radio-stats.xsl',clubhouse:'https://www.clubhouse.com/',contest:'https://docs.google.com/forms/d/e/1FAIpQLSewM20f3DLbL2yz60VNdestV-9ZJfLAaA8ivepjCWbx88_TzQ/viewform?usp=header',telegram:'https://t.me/+nFR4GhHTc7Y3ZjNk',whatsapp:'https://www.whatsapp.com/channel/0029VbDqKNg5vKA9OxDV4046'},program:{title:'آوا و نوا',subtitle:'موسیقی، شعر و آواز'}};
  const state = {shows:FALLBACK,recordingIndex:-1,mode:'idle',liveWanted:false,liveTries:0,liveTimer:null,liveWatchdog:null,liveSequence:0,lastStats:null,lastStatsTime:0,lastStatsStarted:null};
  const liveAudio=$('liveAudio'), recAudio=$('recordingAudio');
  const host = el => document.createElement(el);
  const elText = (name,text,className) => {const n=host(name);n.textContent=String(text ?? '');if(className)n.className=className;return n;};
  const setText=(id,text)=>{const n=$(id);if(n)n.textContent=String(text);};
  const fmtDuration = n => {if(!Number.isFinite(n)||n<0)return '--:--';const sec=Math.floor(n);const h=Math.floor(sec/3600),m=String(Math.floor((sec%3600)/60)).padStart(2,'0'),s=String(sec%60).padStart(2,'0');return h?h+':'+m+':'+s:m+':'+s;};
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  let deferredInstall=null, toastTimeout=null, currentLiveToken=0;
  const safeHttps=(url,hostnames)=>{try{const u=new URL(url);return u.protocol==='https:'&&(!hostnames||hostnames.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))?u.href:null;}catch{return null;}};
  function toast(message){const t=$('toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.hidden=true,5500);}
  function setLink(id,url){const n=$(id),v=safeHttps(url);if(!n)return;if(v)n.href=v;else n.removeAttribute('href');}
  function setDock(title,subtitle,playState,href){setText('dockTitle',title);setText('dockSubtitle',subtitle);setText('dockPlay',playState?'Ⅱ':'▶');$('dockPlay').classList.toggle('is-playing',!!playState);$('dockPlay').setAttribute('aria-pressed',String(!!playState));$('dockDetail').href=href;$('playerDock').classList.toggle('dock-active',state.mode!=='idle');let action=state.mode==='recording'?'پخش یا مکث برنامه':state.mode==='audius'?'کنترل موسیقی آدیوس':'پخش یا توقف زنده';$('dockPlay').setAttribute('aria-label',action);}
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
      card.append(elText('small','برنامه هفتگی'),elText('strong',days[day]),elText('span',String(cfg.hour).padStart(2,'0')+':'+String(cfg.minute).padStart(2,'0')+' ایران','schedule-time'),elText('span',show?fmtTime(show.at,'Europe/Stockholm')+' سوئد':'—','secondary-time'),elText('span',show?fmtTime(show.at,'Europe/London')+' انگلیس':'—','secondary-time'));grid.append(card);
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
  function liveUI(label,details,isPlaying){setText('liveAction',label);setText('liveMessage',details);setText('livePlayIcon',isPlaying?'Ⅱ':'▶');$('livePlay').classList.toggle('is-playing',!!isPlaying);$('livePlay').setAttribute('aria-label',isPlaying?'توقف پخش زنده':'شروع پخش زنده');$('livePlay').setAttribute('aria-pressed',String(!!isPlaying));$('waveform').classList.toggle('is-active',isPlaying);setDock('رادیو آوا و نوا',details,isPlaying,'#listen');}
  function stopLive(message='پخش متوقف شد.',update=true){state.liveWanted=false;state.liveSequence++;clearLiveTimers();liveAudio.pause();liveAudio.removeAttribute('src');liveAudio.load();state.liveTries=0;if(state.mode==='live')state.mode='idle';if(update)liveUI('پخش زنده','برای شروع، دکمه پخش را بزنید.',false);setText('liveMessage',message);}
  function suspendOtherModes(next){
    if(next!=='live'&&state.liveWanted)stopLive('پخش زنده برای شنیدن محتوای دیگر متوقف شد.',false);
    if(next!=='recording'&&!recAudio.paused)recAudio.pause();
    if(next!=='audius')window.dispatchEvent(new Event('radio-audius-stop'));
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
    setText('recordingPlay','▶');$('recordingPlay').classList.remove('is-playing');renderRecordings();setDock(track.title,'آرشیو رادیو',false,'#episodes');
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
  recAudio.addEventListener('play',()=>{suspendOtherModes('recording');setText('recordingPlay','Ⅱ');$('recordingPlay').classList.add('is-playing');const item=state.shows.recordings[state.recordingIndex];setDock(item.title,'در حال پخش آرشیو',true,'#episodes');setMediaSession(item.title,'آرشیو آوا و نوا',()=>recAudio.play(),()=>recAudio.pause());});
  recAudio.addEventListener('pause',()=>{setText('recordingPlay','▶');$('recordingPlay').classList.remove('is-playing');if(state.mode==='recording'){const it=state.shows.recordings[state.recordingIndex];if(it)setDock(it.title,'مکث شده',false,'#episodes');}});
  let saveAt=0;
  recAudio.addEventListener('timeupdate',()=>{
    setText('recordingCurrent',fmtDuration(recAudio.currentTime));if(Number.isFinite(recAudio.duration)&&recAudio.duration>0)$('recordingSeek').value=Math.floor(1000*recAudio.currentTime/recAudio.duration);
    if(Date.now()-saveAt>5000){saveAt=Date.now();const it=state.shows.recordings[state.recordingIndex];if(it)try{localStorage.setItem('ava-v2-position-'+it.id,String(Math.round(recAudio.currentTime)));}catch{}}
  });
  recAudio.addEventListener('loadedmetadata',()=>setText('recordingTotal',fmtDuration(recAudio.duration)));
  recAudio.addEventListener('ended',()=>chooseRecording(state.recordingIndex+1,true));
  recAudio.addEventListener('error',()=>setText('recordingMessage','بارگذاری ضبط ممکن نشد؛ فایل بعدی را امتحان کنید.'));
  window.addEventListener('radio-audius-started',event=>{
    const detail=event.detail||{};
    suspendOtherModes('audius');
    setDock(detail.title||'موسیقی ایرانی',detail.artist||'Audius',true,'#audius');
  });
  window.addEventListener('radio-audius-paused',event=>{
    if(state.mode!=='audius')return;
    const detail=event.detail||{};
    setDock(detail.title||'موسیقی ایرانی','مکث شده',false,'#audius');
  });
  $('dockPlay').addEventListener('click',()=>{
    if(state.mode==='live'||state.mode==='idle')toggleLive();
    else if(state.mode==='recording')toggleRecording();
    else if(state.mode==='audius')window.dispatchEvent(new Event('radio-audius-toggle'));
    else toggleLive();
  });
  function wireNavigation(){const nav=$('navigation'),menu=$('menuButton');
    menu.addEventListener('click',()=>{const open=!nav.classList.contains('open');nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));});
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');nav.querySelectorAll('a').forEach(n=>n.classList.toggle('current',n===a));}));
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('installButton').hidden=false;});
  $('installButton').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice.catch(()=>{});deferredInstall=null;$('installButton').hidden=true;});
  async function init(){
    wireNavigation();setDock('رادیو آوا و نوا','آماده پخش',false,'#listen');
    try{
      const response=await fetch('./shows.json',{cache:'no-store'});
      if(!response.ok)throw new Error('Program content unavailable');
      const content=await response.json();
      if(!content.links||!Array.isArray(content.recordings)||!content.schedule)throw new Error('Invalid program content');
      state.shows=content;
    }catch{toast('برخی اطلاعات برنامه‌ها بارگذاری نشد؛ اتصال اینترنت را بررسی کن.');}
    setLink('clubhouseLink',state.shows.program.roomUrl||state.shows.links.clubhouse);
    setLink('houseLink',state.shows.program.roomUrl||state.shows.links.clubhouse);
    setLink('contestLink',state.shows.links.contest);setLink('telegramLink',state.shows.links.telegram);setLink('whatsappLink',state.shows.links.whatsapp);setLink('requestSongLink',state.shows.links.requestSong||'https://t.me/+bSKXuElY13I3NWY0');
    setText('liveProgram',state.shows.program.title||'آوا و نوا');setText('liveHost',state.shows.program.subtitle||'موسیقی، شعر و آواز');
    renderSchedule();updateClocks();renderRecordings();if(state.shows.recordings.length)chooseRecording(0,false);
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
