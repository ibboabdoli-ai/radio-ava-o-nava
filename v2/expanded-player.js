/* One expanded view for radio, recordings and Audius — existing audio nodes only. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const dialog=$('expandedPlayerDialog'),dock=$('playerDock'),dockOpen=$('studioDockExpand');
 if(!dialog||!dock||!dockOpen)return;
 const live=$('liveAudio'),recording=$('recordingAudio'),music=$('audiusAudio'),detail=$('dockDetail');
 const cover=$('expandedPlayerCover'),play=$('expandedPlay'),previous=$('expandedPrev'),next=$('expandedNext');
 const seek=$('expandedSeek'),elapsed=$('expandedElapsed'),total=$('expandedTotal'),progress=$('expandedProgress');
 const badge=$('expandedLiveBadge'),wave=$('expandedLiveWave'),status=$('expandedPlayerStatus');
 const shuffle=$('expandedShuffle'),repeat=$('expandedRepeat'),source=$('expandedDetails');
 let lastFocused=null,enteredFrom=null;
 const fallback='../radio-neon-logo.webp';
 const coverIds=['gallery/recording-1.webp','gallery/recording-2.webp','gallery/recording-3.webp','gallery/recording-4.webp','gallery/recording-5.webp'];
 const fmt=seconds=>{
   if(!Number.isFinite(seconds)||seconds<0)return '--:--';
   const n=Math.floor(seconds);
   return n>=3600?Math.floor(n/3600)+':'+String(Math.floor((n%3600)/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):
     Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
 };
 const getMode=()=>{
   const href=detail?.getAttribute('href')||'#listen';
   if(href==='#episodes')return 'recording';
   if(href==='#music'||href==='#audius')return 'audius';
   return 'live';
 };
 const audioFor=mode=>mode==='recording'?recording:mode==='audius'?music:live;
 const validCover=src=>{
   try{
     const url=new URL(src,location.href);
     if(url.protocol!=='https:'&&url.protocol!=='http:')return fallback;
     return url.href;
   }catch{return fallback;}
 };
 const selectedRecording=()=>[...document.querySelectorAll('#recordingGrid .recording-card')].findIndex(card=>card.getAttribute('aria-pressed')==='true');
 const currentCover=mode=>{
   if(mode==='live')return fallback;
   if(mode==='recording'){
     const index=selectedRecording();
     return index>=0&&index<coverIds.length?'./'+coverIds[index]:fallback;
   }
   const musicCover=$('audiusCover');
   const url=musicCover?.getAttribute('src')||'';
   return url?validCover(url):fallback;
 };
 const setImage=src=>{
   const image=validCover(src);
   if(cover.src!==image)cover.src=image;
 };
 const visible=()=>dialog.open||dialog.hasAttribute('open');
 function sync(){
   if(!visible())return;
   const mode=getMode(),audio=audioFor(mode),isLive=mode==='live',playing=!audio.paused&&!audio.ended;
   if(dialog.dataset.expandedMode!==mode)dialog.dataset.expandedMode=mode;
   $('expandedPlayerKind').textContent=isLive?'پخش زنده':mode==='recording'?'برنامه ضبط‌شده':'در حال پخش موسیقی';
   const title=isLive?'پخش زنده رادیو آوا و نوا با آرش':
      mode==='audius'?($('audiusTitleNow')?.textContent||$('dockTitle')?.textContent||'موسیقی آوا و نوا'):
      ($('recordingTitle')?.textContent||$('dockTitle')?.textContent||'برنامه ضبط‌شده');
   const artist=isLive?'موسیقی زنده، شعر و آواز با آرش':
      mode==='audius'?($('audiusArtistNow')?.textContent||'موسیقی ایرانی'):
      ($('recordingMeta')?.textContent||'آرشیو رادیو آوا و نوا');
   // File-like placeholders are not meaningful song names. Never invent an artist or title.
   const cleanTitle=mode==='audius'&&/^untitled(?:[\s_-]|$)/i.test(title)?'قطعه بدون عنوان':title;
   $('expandedPlayerTitle').textContent=cleanTitle;
   $('expandedPlayerArtist').textContent=artist;
   setImage(currentCover(mode));
   cover.alt='کاور '+title;
   const liveListening=isLive&&playing&&audio.readyState>=2;
   const liveConnecting=isLive&&!liveListening&&!!audio.currentSrc;
   badge.hidden=!isLive;
   if(isLive){
     badge.lastChild.textContent=liveListening?' در حال شنیدن':liveConnecting?' در حال اتصال':' آماده پخش';
     badge.classList.toggle('is-listening',liveListening);
   }
   wave.hidden=!isLive;
   wave.classList.toggle('is-active',liveListening&&!matchMedia('(prefers-reduced-motion: reduce)').matches);
   progress.hidden=isLive;
   const duration=audio.duration,validDuration=!isLive&&Number.isFinite(duration)&&duration>0;
   seek.disabled=!validDuration;
   seek.value=validDuration?String(Math.max(0,Math.min(1000,Math.round(audio.currentTime/duration*1000)))):'0';
   elapsed.textContent=fmt(audio.currentTime||0);
   total.textContent=validDuration?fmt(duration):'--:--';
   previous.disabled=isLive||(mode==='recording'?($('recordingPrev')?.disabled??true):($('audiusPrevious')?.disabled??true));
   next.disabled=isLive||(mode==='recording'?($('recordingNext')?.disabled??true):($('audiusNext')?.disabled??true));
   shuffle.hidden=mode!=='recording';
   repeat.hidden=mode!=='recording';
   repeat.setAttribute('aria-pressed',$('recordingRepeat')?.getAttribute('aria-pressed')||'false');
   const provider=$('audiusSourceLink')?.href||'';
   let safeProvider=null;
   try{const url=new URL(provider);if(url.protocol==='https:'&&(url.hostname==='audius.co'||url.hostname.endsWith('.audius.co')))safeProvider=url.href;}catch{}
   source.href=isLive?'#listen':mode==='recording'?'#episodes':safeProvider||'#music';
   source.target=!isLive&&mode==='audius'&&safeProvider?'_blank':'_self';
   source.rel=source.target==='_blank'?'noopener noreferrer':'';
   $('expandedDetailsLabel').textContent=isLive?'پخش زنده':mode==='recording'?'فهرست برنامه‌ها':safeProvider?'منبع موسیقی':'آرشیو موسیقی';
   play.classList.toggle('is-playing',playing);
   play.setAttribute('aria-label',playing?'مکث پخش':'شروع پخش');
   play.setAttribute('aria-pressed',String(playing));
   const label=isLive?liveListening?'در حال شنیدن رادیو':liveConnecting?'در حال اتصال به رادیو':'آماده پخش زنده':
     playing?'در حال پخش':'آماده پخش';
   status.textContent=label;
 }
 function open(sourceMode){
   if(!visible()){
     lastFocused=document.activeElement;
     enteredFrom=sourceMode||null;
     if(typeof dialog.showModal==='function')dialog.showModal();
     else dialog.setAttribute('open','');
     document.body.classList.add('expanded-player-open');
   }
   sync();
   $('expandedPlayerClose').focus({preventScroll:true});
 }
 function close(){
   if(!visible())return;
   if(typeof dialog.close==='function')dialog.close();
   else dialog.removeAttribute('open');
   document.body.classList.remove('expanded-player-open');
   if(lastFocused?.isConnected)lastFocused.focus({preventScroll:true});
 }
 window.RadioExpandedPlayer=Object.freeze({open,close});
 dockOpen.addEventListener('click',()=>open());
 dock.addEventListener('click',event=>{
   if(event.target.closest('button,a,input,label'))return;
   if(event.target.closest('.studio-dock-center,.studio-dock-meta,.dock-inner'))open();
 });
 $('expandedPlayerClose').addEventListener('click',close);
 dialog.addEventListener('cancel',()=>document.body.classList.remove('expanded-player-open'));
 dialog.addEventListener('close',()=>{
   document.body.classList.remove('expanded-player-open');
   if(lastFocused?.isConnected)lastFocused.focus({preventScroll:true});
 });
 cover.addEventListener('error',()=>{if(cover.getAttribute('src')!==fallback)cover.src=fallback;});
 play.addEventListener('click',()=>{
   const mode=getMode(),button=mode==='live'?'livePlay':mode==='recording'?'recordingPlay':'audiusToggle';
   const target=$(button);
   if(target&&!target.disabled)target.click();
   sync();
 });
 previous.addEventListener('click',()=>{
   if(previous.disabled)return;
   const target=getMode()==='recording'?'recordingPrev':'audiusPrevious';
   $(target)?.click();
   sync();
 });
 next.addEventListener('click',()=>{
   if(next.disabled)return;
   const target=getMode()==='recording'?'recordingNext':'audiusNext';
   $(target)?.click();
   sync();
 });
 shuffle.addEventListener('click',()=>{
   if(getMode()==='recording')$('recordingShuffle')?.click();
   sync();
 });
 repeat.addEventListener('click',()=>{
   if(getMode()==='recording')$('recordingRepeat')?.click();
   sync();
 });
 seek.addEventListener('input',()=>{
   const mode=getMode(),audio=audioFor(mode);
   if(mode==='live'||seek.disabled||!Number.isFinite(audio.duration)||audio.duration<=0)return;
   const seconds=audio.duration*Number(seek.value)/1000;
   if(Number.isFinite(seconds))audio.currentTime=seconds;
   sync();
 });
 async function share(){
   const mode=getMode(),url=new URL(source.href,location.href).href;
   const title=$('expandedPlayerTitle')?.textContent||'رادیو آوا و نوا';
   if(navigator.share){
     try{await navigator.share({title,url});return;}
     catch(error){if(error?.name==='AbortError')return;}
   }
   try{await navigator.clipboard.writeText(url);status.textContent='لینک کپی شد';}
   catch{status.textContent='برای اشتراک‌گذاری از گزینه مرورگر استفاده کنید';}
 }
 $('expandedShare').addEventListener('click',share);
 $('expandedPlayerMore').addEventListener('click',share);
 source.addEventListener('click',()=>close());
 const liveTrigger=$('livePlay');
 if(liveTrigger)liveTrigger.addEventListener('click',()=>open('live'));
 for(const link of document.querySelectorAll('.studio-feature-play,.studio-feature-mobile-play'))
   link.addEventListener('click',()=>open('live'));
 for(const audio of [live,recording,music]){
   for(const event of ['timeupdate','durationchange','loadedmetadata','play','pause','playing','waiting','ended','error'])
     audio.addEventListener(event,sync);
 }
 for(const id of ['dockDetail','dockTitle','recordingTitle','audiusTitleNow','audiusArtistNow']){
   const element=$(id);
   if(element)new MutationObserver(sync).observe(element,{attributes:id==='dockDetail',attributeFilter:id==='dockDetail'?['href']:undefined,childList:true,characterData:true,subtree:true});
 }
 for(const id of ['recordingGrid','audiusGrid']){
   const element=$(id);if(element)new MutationObserver(sync).observe(element,{childList:true,attributes:true,attributeFilter:['aria-pressed','class'],subtree:true});
 }
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 [...wave.children].forEach((bar,i)=>{
   bar.style.setProperty('--expanded-wave-height',(12+Math.round(Math.abs(Math.sin(i*.71)+Math.cos(i*.37))*40))+'px');
   bar.style.setProperty('--expanded-wave-duration',(0.76+(i%7)*0.16).toFixed(2)+'s');
   bar.style.setProperty('--expanded-wave-delay',(-i*0.083).toFixed(2)+'s');
 });
 if(reduce)wave.classList.remove('is-active');
 // Keep the dialog in sync with the same player, without opening it spontaneously.
 setInterval(()=>{if(visible())sync();},1100);
})();
