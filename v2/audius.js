/* Radio Ava o Nava — native Audius player, no third-party embedded controls or audio hosting. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const audio=$('audiusAudio'),grid=$('audiusGrid'),panel=$('audiusPlayer');
  if(!audio||!grid||!panel)return;
  const BASE='https://api.audius.co/v1/tracks/';
  const APP_NAME='RadioAvaONava';
  const fallback=new URL('../radio-neon-logo.webp',location.href).href;
  const player={tracks:[],index:-1,playing:false,loading:false,serial:0};
  const validTrack=id=>typeof id==='string'&&/^[A-Za-z0-9]{2,24}$/.test(id);
  const sourceUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='audius.co'?u.href:null}catch{return null}};
  const artUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:null}catch{return null}};
  const fmt=sec=>{if(!Number.isFinite(sec)||sec<0)return '--:--';const n=Math.floor(sec);return Math.floor(n/3600)?[Math.floor(n/3600),String(Math.floor(n%3600/60)).padStart(2,'0'),String(n%60).padStart(2,'0')].join(':'):[Math.floor(n/60),String(n%60).padStart(2,'0')].join(':')};
  const set=(id,val)=>{const el=$(id);if(el)el.textContent=String(val)};
  const announce=message=>set('audiusStatus',message);
  const element=(name,cls,text)=>{const el=document.createElement(name);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
  const selected=()=>player.tracks[player.index]||null;
  const urlFor=id=>BASE+encodeURIComponent(id)+'/stream?app_name='+APP_NAME;
  const makeCover=(image,src,alt)=>{
    image.src=artUrl(src)||fallback;
    image.alt=alt||'کاور موسیقی';
    image.decoding='async';image.loading='lazy';
    image.referrerPolicy='no-referrer';
    image.addEventListener('error',()=>{if(image.src!==fallback){image.src=fallback;image.alt='لوگوی رادیو آوا و نوا';}},{once:true});
    return image;
  };
  function updateButtons(){
    const isPlaying=!audio.paused&&!audio.ended;
    player.playing=isPlaying;
    $('audiusToggle').textContent=isPlaying?'Ⅱ':'▶';
    $('audiusToggle').setAttribute('aria-label',isPlaying?'مکث موسیقی':'پخش موسیقی');
    grid.querySelectorAll('[data-audius-id]').forEach(button=>{
      const track=selected();
      const isCurrent=track?.id===button.dataset.audiusId;
      button.textContent=isCurrent&&isPlaying?'Ⅱ مکث':isCurrent?'▶ ادامه':'▶ شنیدن';
      button.setAttribute('aria-pressed',String(!!isCurrent&&isPlaying));
      button.closest('.audius-track')?.classList.toggle('selected',!!isCurrent);
    });
  }
  function renderCards(){
    grid.replaceChildren();
    player.tracks.forEach((track,i)=>{
      const card=element('article','audius-track');
      const img=makeCover(element('img','audius-track-photo'),track.artwork,'کاور '+track.title);
      img.width=360;img.height=300;
      const body=element('div','audius-track-body');
      body.append(element('small','',track.genre||'موسیقی ایرانی'),element('h3','',track.title),element('p','',track.artist));
      const actions=element('div','audius-track-actions');
      const choose=element('button','audius-choose','▶ شنیدن');
      choose.type='button';choose.dataset.audiusId=track.id;choose.setAttribute('aria-label','پخش '+track.title);choose.setAttribute('aria-pressed','false');
      choose.addEventListener('click',()=>{
        if(player.index===i&&player.playing)pause();
        else if(player.index===i)playCurrent();
        else chooseTrack(i,true);
      });
      const source=element('a','audius-source','↗');source.href=track.source;source.rel='noopener noreferrer';source.target='_blank';source.title='منبع رسمی: '+track.title;source.setAttribute('aria-label','مشاهده '+track.title+' در آدیوس');
      actions.append(choose,source);body.append(actions);card.append(img,body);grid.append(card);
    });
    updateButtons();
  }
  function chooseTrack(i,autoplay=false){
    if(i<0||i>=player.tracks.length)return;
    const track=player.tracks[i];
    if(!validTrack(track.id)||!sourceUrl(track.source)){announce('این قطعه آدرس معتبر ندارد.');return;}
    player.serial++;
    player.loading=true;
    audio.pause();
    audio.src=urlFor(track.id);
    audio.load();
    player.index=i;
    const cover=$('audiusCover');makeCover(cover,track.artwork,'کاور '+track.title);
    set('audiusTitleNow',track.title);set('audiusArtistNow',track.artist);
    $('audiusSourceLink').href=track.source;
    $('audiusSeek').value=0;$('audiusSeek').disabled=true;
    set('audiusElapsed','0:00');set('audiusTotal',fmt(track.duration));
    panel.hidden=false;
    announce('قطعه آماده دریافت از آدیوس است.');
    updateButtons();
    if(autoplay)playCurrent();
  }
  function mediaSession(track){
    if(!('mediaSession' in navigator)||!('MediaMetadata' in window))return;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist,album:'آوا و نوا | Audius',artwork:[{src:artUrl(track.artwork)||fallback,sizes:'480x480',type:'image/jpeg'}]});
      navigator.mediaSession.setActionHandler('play',()=>playCurrent());
      navigator.mediaSession.setActionHandler('pause',()=>pause());
      navigator.mediaSession.setActionHandler('nexttrack',()=>adjacent(1,true));
      navigator.mediaSession.setActionHandler('previoustrack',()=>adjacent(-1,true));
    }catch{/* Unsupported mobile media controls do not prevent playback. */}
  }
  function playCurrent(){
    if(player.index<0){chooseTrack(0,false);if(player.index<0)return;}
    const track=selected();if(!track)return;
    window.dispatchEvent(new CustomEvent('radio-audius-started',{detail:{title:track.title,artist:track.artist}}));
    announce('در حال اتصال به موسیقی آدیوس…');
    const serial=player.serial;
    audio.play().then(()=>{
      if(serial===player.serial)mediaSession(track);
    }).catch(()=>{
      if(serial!==player.serial)return;
      player.loading=false;updateButtons();
      window.dispatchEvent(new CustomEvent('radio-audius-paused',{detail:{title:track.title,artist:track.artist}}));
      announce('پخش مستقیم ممکن نشد؛ لینک «منبع رسمی» را امتحان کن.');
    });
  }
  function pause(){audio.pause();updateButtons();}
  function adjacent(delta,autoplay){
    if(!player.tracks.length)return;
    const index=player.index;
    if(delta<0&&index>=0&&audio.currentTime>3){audio.currentTime=0;return;}
    const next=index+delta;
    if(next<0||next>=player.tracks.length){
      if(index<0)chooseTrack(0,autoplay);
      else announce(delta>0?'به پایان فهرست رسیده‌ای.':'این اولین قطعه فهرست است.');
      return;
    }
    chooseTrack(next,autoplay);
  }
  function toggle(){
    if(player.index<0)return chooseTrack(0,true);
    if(audio.paused)playCurrent();else pause();
  }
  $('audiusToggle').addEventListener('click',toggle);
  $('audiusPrevious').addEventListener('click',()=>adjacent(-1,true));
  $('audiusNext').addEventListener('click',()=>adjacent(1,true));
  $('audiusSeek').addEventListener('input',event=>{
    if(Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=Number(event.target.value)/1000*audio.duration;}
  });
  const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isiOS){$('audiusVolume').disabled=true;$('audiusVolume').title='تنظیم صدا با دکمه‌های آیفون';}
  else{audio.volume=.8;$('audiusVolume').addEventListener('input',event=>{audio.volume=Number(event.target.value)/100;});}
  audio.addEventListener('playing',()=>{player.loading=false;updateButtons();const track=selected();if(track)announce('در حال پخش: '+track.title);});
  audio.addEventListener('pause',()=>{
    updateButtons();const t=selected();
    if(t)window.dispatchEvent(new CustomEvent('radio-audius-paused',{detail:{title:t.title,artist:t.artist}}));
  });
  audio.addEventListener('loadedmetadata',()=>{
    if(Number.isFinite(audio.duration)&&audio.duration>0){set('audiusTotal',fmt(audio.duration));$('audiusSeek').disabled=false;}
  });
  audio.addEventListener('timeupdate',()=>{
    set('audiusElapsed',fmt(audio.currentTime));
    if(Number.isFinite(audio.duration)&&audio.duration>0){
      $('audiusSeek').disabled=false;$('audiusSeek').value=Math.round(1000*audio.currentTime/audio.duration);
    }
  });
  audio.addEventListener('waiting',()=>{if(!audio.paused)announce('در حال دریافت صدا از آدیوس…');});
  audio.addEventListener('error',()=>{player.loading=false;updateButtons();announce('این فایل اکنون پخش نمی‌شود؛ از لینک منبع رسمی استفاده کن یا قطعه بعدی را بزن.');});
  audio.addEventListener('ended',()=>{updateButtons();adjacent(1,true);});
  window.addEventListener('radio-audius-stop',()=>{if(!audio.paused)audio.pause();});
  window.addEventListener('radio-audius-toggle',toggle);
  async function init(){
    try{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
      let response;
      try{response=await fetch('./audius-catalog.json',{signal:controller.signal,cache:'no-store'});}
      finally{clearTimeout(timeout);}
      if(!response.ok)throw Error('Audius catalog response '+response.status);
      const payload=await response.json();
      if(!Array.isArray(payload.tracks))throw Error('Invalid Audius catalog');
      player.tracks=payload.tracks.filter(t=>validTrack(t.id)&&sourceUrl(t.source)&&t.publicStream===true);
      if(!player.tracks.length)throw Error('Empty Audius catalog');
      set('audiusCount',new Intl.NumberFormat('fa-IR').format(player.tracks.length)+' قطعه');
      renderCards();
    }catch{
      $('audiusEmpty').hidden=false;
      set('audiusCount','در دسترس نیست');
    }
  }
  init();
})();
