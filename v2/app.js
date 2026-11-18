/* Radio Ava o Nava v2 — no API keys or Icecast admin credentials in public code. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fa = n => new Intl.NumberFormat('fa-IR').format(n);
  const days = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
  const wk = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const FALLBACK = {schedule:{weekdays:[6,0,1,2,3],hour:22,minute:0},recordings:[],links:{stream:'https://live.ibboabdoli.com/stream',stats:'https://live.ibboabdoli.com/radio-stats.xsl',clubhouse:'https://www.clubhouse.com/',contest:'https://docs.google.com/forms/d/e/1FAIpQLSewM20f3DLbL2yz60VNdestV-9ZJfLAaA8ivepjCWbx88_TzQ/viewform?usp=header',telegram:'https://t.me/+nFR4GhHTc7Y3ZjNk',whatsapp:'https://www.whatsapp.com/channel/0029VbDqKNg5vKA9OxDV4046'},program:{title:'آوا و نوا',subtitle:'موسیقی، شعر و آواز'}};
  const state = {shows:FALLBACK,recordingIndex:-1,mode:'idle',liveWanted:false,liveTries:0,liveTimer:null,liveWatchdog:null,liveSequence:0,lastStats:null,lastStatsTime:0,lastStatsStarted:null,statsError:false};
  const liveAudio=$('liveAudio'), recAudio=$('recordingAudio');
  const recordingDurations=new Map();
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
  const timeFormatters=new Map();
  const fmtTime=(date,tz)=>{
    if(!timeFormatters.has(tz))timeFormatters.set(tz,new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
    return timeFormatters.get(tz).format(date);
  };
  const iranParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const iranDay=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short'});
  const dayInTehran=date=>wk[iranDay.format(date)];
  function tehranOffset(timestamp){
    const parts=Object.fromEntries(iranParts.formatToParts(new Date(timestamp)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
    return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute)-Math.floor(timestamp/60000)*60000;
  }
  function showCandidates(now=new Date()){
    const cfg=state.shows.schedule||FALLBACK.schedule,results=[];
    if(!Array.isArray(cfg.weekdays)||!Number.isInteger(cfg.hour)||cfg.hour<0||cfg.hour>23||!Number.isInteger(cfg.minute)||cfg.minute<0||cfg.minute>59)return results;
    const base=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
    for(let d=-2;d<12;d++){
      const requested=base+d*86400000+cfg.hour*3600000+cfg.minute*60000;
      let timestamp=requested-tehranOffset(requested);
      timestamp=requested-tehranOffset(timestamp);
      const candidate=new Date(timestamp),day=dayInTehran(candidate);
      if(timestamp<=now.getTime()||!cfg.weekdays.includes(day))continue;
      if(fmtTime(candidate,'Asia/Tehran')!==String(cfg.hour).padStart(2,'0')+':'+String(cfg.minute).padStart(2,'0'))continue;
      results.push({at:candidate,day});
    }
    return results.sort((a,b)=>a.at-b.at);
  }
  const iranDate=new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'});
  const titleForDay=day=>{
    const candidate=state.shows.schedule?.dayPrograms?.[String(day)];
    return typeof candidate==='string'&&candidate.trim()?candidate.trim().slice(0,90):state.shows.program?.title||'آوا و نوا';
  };
  function renderSchedule(){
    const items=showCandidates();const cfg=state.shows.schedule||FALLBACK.schedule,grid=$('scheduleGrid');grid.replaceChildren();
    for(const day of cfg.weekdays){
      const show=items.find(x=>x.day===day);const card=host('article');card.className='schedule-card'+(items[0]?.day===day?' is-next':'');
      card.append(elText('small',titleForDay(day)),elText('strong',days[day]),elText('span',String(cfg.hour).padStart(2,'0')+':'+String(cfg.minute).padStart(2,'0')+' ایران','schedule-time'),elText('span',show?fmtTime(show.at,'Europe/Stockholm')+' سوئد':'—','secondary-time'),elText('span',show?fmtTime(show.at,'Europe/London')+' انگلیس':'—','secondary-time'));grid.append(card);
    }
  }
  function updateClocks(){
    const now=new Date();
    setText('clockIran',fmtTime(now,'Asia/Tehran'));setText('clockSweden',fmtTime(now,'Europe/Stockholm'));setText('clockUk',fmtTime(now,'Europe/London'));
    const next=showCandidates(now)[0];if(!next){setText('nextShowDay','برنامه بعدی مشخص نیست');setText('nextCountdown','--:--:--');setText('nextShowTime','اطلاعات برنامه موجود نیست');setText('nextShowTitle','برنامه بعدی نامشخص');setText('nextShowDetails','');return;}
    setText('nextShowDay',days[next.day]+' · '+iranDate.format(next.at));setText('nextShowTitle',titleForDay(next.day));setText('nextShowDetails',state.shows.schedule?.description||state.shows.program?.subtitle||'');setText('nextShowTime','شروع '+fmtTime(next.at,'Asia/Tehran')+' ایران · '+fmtTime(next.at,'Europe/Stockholm')+' سوئد · '+fmtTime(next.at,'Europe/London')+' انگلیس');
    const left=Math.max(0,Math.ceil((next.at.getTime()-now.getTime())/1000));setText('nextCountdown',[Math.floor(left/3600),Math.floor(left%3600/60),left%60].map(v=>String(v).padStart(2,'0')).join(':'));
  }
  function updateStatsUI(){
    const stale=Date.now()-state.lastStatsTime>95000,stats=state.lastStats;
    const localPlaying=state.liveWanted&&!liveAudio.paused&&liveAudio.readyState>=2;
    if(!stats||stale||(localPlaying&&!stats.live)){
      setText('serverBadge',localPlaying?'● صدا در حال پخش است':'آمار پخش در دسترس نیست');
      $('serverBadge').className='live-pill '+(localPlaying?'is-on':'');
      setText('stationState',localPlaying?'پخش در دستگاه':'نامشخص');
      setText('listenerCount','نامشخص');setText('liveDuration','--:--:--');
      setText('serverHint',localPlaying?'صدا روی دستگاه شما برقرار است؛ آمار سرور تأیید نشده است.':'آمار سرور دریافت نشد؛ این به معنی خاموش بودن رادیو نیست.');
      return;
    }
    setText('serverBadge',stats.live?'● پخش زنده فعال':'پخش زنده فعال نیست');
    $('serverBadge').className='live-pill '+(stats.live?'is-on':'is-off');
    setText('stationState',stats.live?'زنده':'خارج از پخش');
    setText('listenerCount',fa(stats.live?stats.listeners:0));
    setText('liveDuration',stats.live&&state.lastStatsStarted?fmtDuration((Date.now()-state.lastStatsStarted)/1000):stats.live?'--:--:--':'00:00:00');
    setText('serverHint',stats.live?'وضعیت از سرور رادیو دریافت شده است.':'در حال حاضر سرور هیچ پخش فعالی گزارش نمی‌کند.');
  }
  function normalizeStats(s){
    if(typeof s?.live==='boolean'&&Number.isSafeInteger(Number(s.listeners))&&Number(s.listeners)>=0){
      return {live:s.live,listeners:Number(s.listeners),startedAt:s.startedAt};
    }
    if(s?.icestats&&typeof s.icestats==='object'){
      const all=s.icestats.source?Array.isArray(s.icestats.source)?s.icestats.source:[s.icestats.source]:[];
      const source=all.find(item=>String(item.listenurl||item.mount||'').includes('/stream'))||all[0];
      return {live:!!source,listeners:Math.max(0,Number(source?.listeners)||0),
        startedAt:source?.stream_start_iso8601||source?.stream_start||null};
    }
    throw new Error('Unknown stats format');
  }
  let polling=false,lastPollAttempt=0,statsFailures=0;
  async function pollStats(force=false){
    const interval=statsFailures?Math.min(180000,45000*Math.pow(2,statsFailures-1)):45000;
    if(polling||document.hidden||(!force&&Date.now()-lastPollAttempt<interval))return;
    lastPollAttempt=Date.now();polling=true;
    const primary=safeHttps(state.shows.links.stats,['ibboabdoli.com']);
    const fallback=safeHttps('https://live.ibboabdoli.com/status-json.xsl',['ibboabdoli.com']);
    try{
      if(!primary)throw new Error('No stats endpoint');
      let lastError;
      for(const url of [...new Set([primary,fallback].filter(Boolean))]){
        const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),4500);
        try{
          const r=await fetch(url+(url.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store',mode:'cors',signal:ctl.signal});
          if(!r.ok)throw new Error('HTTP '+r.status);
          const stats=normalizeStats(await r.json());
          const started=typeof stats.startedAt==='string'?Date.parse(stats.startedAt.replace(/([+-]\d{2})(\d{2})$/,'$1:$2')):NaN;
          state.lastStats={live:stats.live,listeners:stats.listeners};
          state.lastStatsStarted=Number.isFinite(started)&&started<=Date.now()+15000&&started>0?started:null;
          state.lastStatsTime=Date.now();state.statsError=false;statsFailures=0;return;
        }catch(error){lastError=error;}finally{clearTimeout(timeout);}
      }
      throw lastError||new Error('No response');
    }catch{state.statsError=true;statsFailures=Math.min(statsFailures+1,4);/* Unknown is not OFFLINE. */}
    finally{polling=false;updateStatsUI();}
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
    try{await liveAudio.play();}catch(error){
      if(!state.liveWanted||token!==state.liveSequence)return;
      if(error?.name==='NotAllowedError'){stopLive('مرورگر اجازه پخش نداده است. دوباره روی دکمه پخش بزنید.');return;}
      retryLive();
    }
  }
  function retryLive(){
    if(!state.liveWanted||state.liveTimer)return;
    if(navigator.onLine===false){clearLiveTimers();liveUI('منتظر اینترنت','پس از وصل شدن اینترنت دوباره تلاش می‌کنیم.',false);return;}
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
  function durationFor(track){
    const cached=recordingDurations.get(track.id);
    if(Number.isFinite(cached)&&cached>0)return cached;
    try{
      const saved=Number(localStorage.getItem('ava-v2-duration-'+track.id));
      if(Number.isFinite(saved)&&saved>0){recordingDurations.set(track.id,saved);return saved;}
    }catch{}
    return null;
  }
  function renderRecordings(){
    const grid=$('recordingGrid');grid.replaceChildren();const tracks=state.shows.recordings||[];
    if(!tracks.length){grid.append(elText('p','در حال حاضر فایل ضبط‌شده‌ای در دسترس نیست.','empty-state'));$('recordingPrev').disabled=true;$('recordingNext').disabled=true;return;}
    if(state.recordingIndex<0){$('recordingPrev').disabled=true;$('recordingNext').disabled=true;}
    tracks.forEach((track,i)=>{
      const b=host('button');b.type='button';b.className='recording-card'+(state.recordingIndex===i?' active':'');
      const num=elText('span',String(i+1).padStart(2,'0'),'rec-number'),wrapper=host('span');
      const duration=durationFor(track);
      wrapper.append(elText('strong',track.title),elText('small','ساعت '+track.time),
        elText('small',duration?'مدت: '+fmtDuration(duration):'مدت: پس از انتخاب','recording-duration'));
      b.append(num,wrapper);
      b.setAttribute('aria-pressed',String(state.recordingIndex===i));
      b.setAttribute('aria-label',track.title+'، ساعت '+track.time+(duration?'، مدت '+fmtDuration(duration):''));
      b.addEventListener('click',()=>chooseRecording(i,false));grid.append(b);
    });
  }
  function saveRecordingDuration(){
    const item=state.shows.recordings?.[state.recordingIndex];
    const duration=recAudio.duration;
    setText('recordingTotal',fmtDuration(duration));
    $('recordingSeek').disabled=!(Number.isFinite(duration)&&duration>0);
    if(!item||!Number.isFinite(duration)||duration<=0)return;
    const seconds=Math.round(duration);
    if(recordingDurations.get(item.id)===seconds)return;
    recordingDurations.set(item.id,seconds);
    try{localStorage.setItem('ava-v2-duration-'+item.id,String(seconds));}catch{}
    renderRecordings();
  }
  function chooseRecording(i,autoplay=false){
    const tracks=state.shows.recordings||[];if(!tracks.length||i<0||i>=tracks.length)return;
    const target=i,track=tracks[target],url=safeHttps(track.src,['ibboabdoli.com']);
    if(!url){toast('آدرس فایل ضبط‌شده معتبر نیست.');return;}
    if(autoplay)suspendOtherModes('recording');recAudio.pause();state.recordingIndex=target;recAudio.src=url;recAudio.load();
    setText('recordingTitle',track.title);setText('recordingMeta',track.time+' · '+track.date);
    $('recordingSeek').value=0;$('recordingSeek').disabled=true;setText('recordingCurrent','00:00');setText('recordingTotal','--:--');
    setText('recordingMessage',autoplay?'در حال دریافت برنامه…':'برای شنیدن برنامه دکمه پخش را بزنید.');
    $('recordingRetry').hidden=true;
    $('recordingPrev').disabled=target===0;$('recordingNext').disabled=target===tracks.length-1;
    setText('recordingPlay','▶');$('recordingPlay').classList.remove('is-playing');renderRecordings();if(state.mode==='recording'||state.mode==='idle')setDock(track.title,'آرشیو رادیو',false,'#episodes');
    try{const saved=Number(localStorage.getItem('ava-v2-position-'+track.id));
      if(Number.isFinite(saved)&&saved>0)recAudio.addEventListener('loadedmetadata',()=>{
        if(state.shows.recordings[state.recordingIndex]?.id===track.id&&Number.isFinite(recAudio.duration)&&saved<recAudio.duration-10)recAudio.currentTime=saved;
      },{once:true});
    }catch{}
    if(autoplay)recAudio.play().catch(()=>{setText('recordingMessage','پخش آغاز نشد؛ دکمه پخش را دوباره بزنید.');$('recordingRetry').hidden=false;});
  }
  function toggleRecording(){
    if(state.recordingIndex<0){chooseRecording(0,false);}
    if(recAudio.paused){suspendOtherModes('recording');recAudio.play().catch(()=>setText('recordingMessage','فایل باز نشد. اتصال اینترنت یا دسترسی به آرشیو را بررسی کن.'));}
    else recAudio.pause();
  }
  $('recordingPlay').addEventListener('click',toggleRecording);
  $('recordingPrev').addEventListener('click',()=>chooseRecording(state.recordingIndex-1,!recAudio.paused));
  $('recordingNext').addEventListener('click',()=>chooseRecording(state.recordingIndex+1,!recAudio.paused));
  $('recordingRetry').addEventListener('click',()=>{if(state.recordingIndex>=0)chooseRecording(state.recordingIndex,true);});
  $('recordingSeek').addEventListener('input',e=>{if(Number.isFinite(recAudio.duration)&&recAudio.duration>0)recAudio.currentTime=Number(e.target.value)/1000*recAudio.duration;});
  recAudio.addEventListener('play',()=>{suspendOtherModes('recording');setText('recordingPlay','Ⅱ');$('recordingPlay').classList.add('is-playing');const item=state.shows.recordings[state.recordingIndex];setDock(item.title,'در حال پخش آرشیو',true,'#episodes');setMediaSession(item.title,'آرشیو آوا و نوا',()=>recAudio.play(),()=>recAudio.pause());});
  recAudio.addEventListener('pause',()=>{setText('recordingPlay','▶');$('recordingPlay').classList.remove('is-playing');if(state.mode==='recording'){const it=state.shows.recordings[state.recordingIndex];if(it)setDock(it.title,'مکث شده',false,'#episodes');}});
  let saveAt=0;
  recAudio.addEventListener('timeupdate',()=>{
    setText('recordingCurrent',fmtDuration(recAudio.currentTime));if(Number.isFinite(recAudio.duration)&&recAudio.duration>0){$('recordingSeek').disabled=false;$('recordingSeek').value=Math.floor(1000*recAudio.currentTime/recAudio.duration);}
    if(Date.now()-saveAt>5000){saveAt=Date.now();const it=state.shows.recordings[state.recordingIndex];if(it)try{localStorage.setItem('ava-v2-position-'+it.id,String(Math.round(recAudio.currentTime)));}catch{}}
  });
  recAudio.addEventListener('loadedmetadata',saveRecordingDuration);
  recAudio.addEventListener('durationchange',saveRecordingDuration);
  recAudio.addEventListener('playing',()=>{setText('recordingMessage','در حال پخش برنامه');$('recordingRetry').hidden=true;});
  recAudio.addEventListener('waiting',()=>{if(!recAudio.paused)setText('recordingMessage','در حال دریافت صدا…');});
  recAudio.addEventListener('ended',()=>{
    if(state.recordingIndex+1<state.shows.recordings.length)chooseRecording(state.recordingIndex+1,true);
    else setText('recordingMessage','به پایان آرشیو رسیدی.');
  });
  recAudio.addEventListener('error',()=>{
    setText('recordingMessage','دریافت فایل ممکن نشد؛ اتصال آرشیو را بررسی کن یا دوباره تلاش کن.');
    $('recordingRetry').hidden=false;
  });
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
  function wireNavigation(){
    const nav=$('navigation'),menu=$('menuButton');
    const close=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');};
    menu.addEventListener('click',()=>{const open=!nav.classList.contains('open');nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));});
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
      close();nav.querySelectorAll('a').forEach(n=>n.classList.toggle('current',n===a));
    }));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('open')){close();menu.focus();}});
    document.addEventListener('click',event=>{if(nav.classList.contains('open')&&!nav.contains(event.target)&&!menu.contains(event.target))close();});
    window.addEventListener('hashchange',()=>{
      const active=nav.querySelector('a[href="'+location.hash+'"]');
      if(active)nav.querySelectorAll('a').forEach(n=>n.classList.toggle('current',n===active));
    });
  }
  function renderCompetition(){
    const info=state.shows.competition||{};
    setText('contestTitle',info.title||'مسابقه آوا و نوا');
    const deadline=typeof info.registrationDeadline==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(info.registrationDeadline)?info.registrationDeadline:null;
    setText('contestDeadline',deadline?deadline:'هنوز اعلام نشده');
    const list=$('contestRules');
    list.replaceChildren();
    const rules=Array.isArray(info.rules)?info.rules.filter(rule=>typeof rule==='string'&&rule.trim()).slice(0,8):[];
    for(const rule of rules)list.append(elText('li',rule));
    if(!rules.length)list.append(elText('li','قوانین مسابقه هنوز اعلام نشده است. برای اطلاع از شرایط نهایی، همین صفحه را بررسی کن.'));
    const count=info.publicParticipantsCount;
    setText('contestParticipants',Number.isSafeInteger(count)&&count>=0?fa(count)+' نفر':'آمار عمومی اعلام نشده');
    const winners=$('contestWinners');winners.replaceChildren();
    const names=Array.isArray(info.winners)?info.winners.filter(name=>typeof name==='string'&&name.trim()).slice(0,8):[];
    if(names.length){for(const name of names)winners.append(elText('li',name));}
    else winners.append(elText('li','نتایج و برندگان هنوز اعلام نشده‌اند.'));
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
    renderSchedule();updateClocks();renderCompetition();renderRecordings();
    // Do not download archived audio metadata until the visitor chooses a recording.
    state.mode='idle';setDock('رادیو آوا و نوا','آماده پخش',false,'#listen');
    pollStats();
    setInterval(updateClocks,1000);setInterval(updateStatsUI,1000);setInterval(pollStats,15000);
    setInterval(renderSchedule,60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateClocks();renderSchedule();pollStats(true);}});
    window.addEventListener('online',()=>pollStats(true));
    if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
  }
  init();
})();
