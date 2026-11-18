/* Approved Radio Ava o Nava studio UI — orchestration only.
   Reuses original player buttons and audio nodes. No new player, accounts, storage or media endpoints. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const recordingAudio=$('recordingAudio'),musicAudio=$('audiusAudio'),liveAudio=$('liveAudio');
  const dock=$('playerDock'),detail=$('dockDetail'),prev=$('studioDockPrev'),next=$('studioDockNext');
  const seek=$('studioDockSeek'),now=$('studioDockCurrent'),total=$('studioDockTotal'),volume=$('studioDockVolume');
  if(!dock||!recordingAudio||!musicAudio||!liveAudio||!seek)return;
  const fmt=seconds=>{
    if(!Number.isFinite(seconds)||seconds<0)return '--:--';
    const n=Math.floor(seconds),s=String(n%60).padStart(2,'0');
    return n>=3600?Math.floor(n/3600)+':'+String(Math.floor(n%3600/60)).padStart(2,'0')+':'+s:Math.floor(n/60)+':'+s;
  };
  const mode=()=>{
    const href=detail?.getAttribute('href')||'';
    if(href==='#episodes')return 'recording';
    if(href==='#audius'||href==='#music')return 'audius';
    return 'live';
  };
  const activeAudio=()=>mode()==='recording'?recordingAudio:mode()==='audius'?musicAudio:liveAudio;
  function refreshDock(){
    const type=mode(),audio=activeAudio(),duration=audio.duration;
    const canSeek=type!=='live'&&Number.isFinite(duration)&&duration>0;
    seek.disabled=!canSeek;
    seek.value=canSeek?String(Math.min(1000,Math.round(audio.currentTime/duration*1000))):'0';
    now.textContent=type==='live'?'زنده':fmt(audio.currentTime||0);
    total.textContent=type==='live'?'●':canSeek?fmt(duration):'--:--';
    if(type==='recording'){
      prev.disabled=$('recordingPrev')?.disabled??true;
      next.disabled=$('recordingNext')?.disabled??true;
    }else if(type==='audius'){
      prev.disabled=$('audiusPrevious')?.disabled??false;
      next.disabled=$('audiusNext')?.disabled??false;
    }else{prev.disabled=true;next.disabled=true;}
    const cover=$('studioDockCover');
    if(cover){
      const activeTitle=$('dockTitle')?.textContent||'';
      let image='../radio-neon-logo.webp';
      if(type==='recording'){
        const selected=[...document.querySelectorAll('#recordingGrid button')].findIndex(button=>button.getAttribute('aria-pressed')==='true');
        const pics=['studio-violin.svg','studio-sunset.svg','studio-poetry.svg','studio-vinyl.svg','studio-retro.svg'];
        if(selected>=0&&selected<pics.length)image='./'+pics[selected];
      }else if(type==='audius'){
        const selected=document.querySelector('.audius-track.selected .audius-track-photo');
        const pic=selected?.getAttribute('src');
        if(pic && /^https:\/\//.test(pic))image=pic;
      }
      if(cover.getAttribute('src')!==image)cover.src=image;
      cover.alt='کاور '+activeTitle;
    }
    if(!volume.disabled && Number.isFinite(audio.volume))volume.value=String(Math.round(audio.volume*100));
  }
  prev.addEventListener('click',()=>{const target=mode()==='recording'?'recordingPrev':'audiusPrevious';$(target)?.click();});
  next.addEventListener('click',()=>{const target=mode()==='recording'?'recordingNext':'audiusNext';$(target)?.click();});
  seek.addEventListener('input',()=>{
    const audio=activeAudio();
    if(seek.disabled||!Number.isFinite(audio.duration)||audio.duration<=0)return;
    const pos=Number(seek.value)/1000*audio.duration;
    if(Number.isFinite(pos))audio.currentTime=pos;
  });
  const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isiOS){volume.disabled=true;volume.title='صدای رادیو با دکمه‌های گوشی کنترل می‌شود';}
  else volume.addEventListener('input',()=>{
    const audio=activeAudio(),value=Math.min(1,Math.max(0,Number(volume.value)/100));
    audio.volume=value;
  });
  for(const a of [recordingAudio,musicAudio,liveAudio]){
    for(const event of ['timeupdate','durationchange','loadedmetadata','play','pause','ended','volumechange'])
      a.addEventListener(event,refreshDock);
  }
  if(detail)new MutationObserver(refreshDock).observe(detail,{attributes:true,attributeFilter:['href']});
  if($('dockTitle'))new MutationObserver(refreshDock).observe($('dockTitle'),{childList:true,characterData:true,subtree:true});
  $('studioDockCover')?.addEventListener('error',event=>{
    if(event.target.getAttribute('src')!=='../radio-neon-logo.webp')event.target.src='../radio-neon-logo.webp';
  });
  const recordingButtons=document.querySelectorAll('[data-studio-recording]');
  for(const button of recordingButtons)button.addEventListener('click',()=>{
    const i=Number(button.dataset.studioRecording);
    const card=document.querySelectorAll('#recordingGrid .recording-card')[i];
    if(card){
      card.click();
      const play=$('recordingPlay');
      if(play&&!play.disabled)play.click();
      else $('episodes')?.scrollIntoView({behavior:'smooth'});
    }else $('episodes')?.scrollIntoView({behavior:'smooth'});
  });
  const musicSearch=query=>{
    const input=$('audiusSearch');
    if(!input){$('music')?.scrollIntoView({behavior:'smooth'});return;}
    input.value=query;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    $('music')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  for(const button of document.querySelectorAll('[data-studio-genre]'))
    button.addEventListener('click',()=>musicSearch(button.dataset.studioGenre||''));
  $('studioSearchForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    const query=$('studioSearch')?.value?.trim()||'';
    if(!query){$('music')?.scrollIntoView({behavior:'smooth'});return;}
    musicSearch(query);
  });
  $('studioHeaderSearch')?.addEventListener('click',()=>{
    $('music')?.scrollIntoView({behavior:'smooth'});
    setTimeout(()=>$('audiusSearch')?.focus({preventScroll:true}),300);
  });
  for(const item of document.querySelectorAll('.studio-feature-play,.studio-feature-mobile-play')){
    item.addEventListener('click',event=>{
      event.preventDefault();
      const playing=!liveAudio.paused && liveAudio.readyState>=2;
      if(!playing)$('livePlay')?.click();
      else $('listen')?.scrollIntoView({behavior:'smooth'});
      refreshDock();
    });
  }
  document.querySelectorAll('.studio-side-link').forEach(a=>a.addEventListener('click',()=>{
    document.querySelectorAll('.studio-side-link').forEach(n=>n.classList.toggle('active',n===a));
  }));
  const observable=['home','listen','episodes','music','community','about'];
  if('IntersectionObserver' in window){
    const obs=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const a=document.querySelector('.studio-side-link[href="#'+entry.target.id+'"]');
        if(a){document.querySelectorAll('.studio-side-link').forEach(n=>n.classList.toggle('active',n===a));}
      }
    },{rootMargin:'-18% 0px -62% 0px',threshold:0});
    observable.map($).filter(Boolean).forEach(element=>obs.observe(element));
  }
  // The approved player stays visible as an application bar, even before first playback.
  dock.classList.add('dock-active');
  setInterval(refreshDock,1000);
  refreshDock();
})();
