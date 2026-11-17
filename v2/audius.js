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
  const discovery={mode:'tracks',query:'',page:0,limit:24,pending:false,requestId:0,results:[],albums:[],initial:[]};
  const API='https://api.audius.co/v1';
  const discoveryGrid=$('audiusAlbumGrid'),more=$('audiusLoadMore'),empty=$('audiusEmpty');
  const tcount=n=>new Intl.NumberFormat('fa-IR').format(n);

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

  function normalizeTrack(value){
    if(!value||!validTrack(value.id)||value.is_streamable===false||value.access?.stream===false)return null;
    const permalink=typeof value.permalink==='string'?value.permalink:'';
    const source=permalink.startsWith('/')?'https://audius.co'+permalink:permalink;
    if(!sourceUrl(source))return null;
    const title=typeof value.title==='string'?value.title.trim():'';
    if(!title)return null;
    const artist=(value.user?.name||value.user?.handle||'هنرمند آدیوس').trim();
    return {id:value.id,title,artist,genre:value.genre||'موسیقی',duration:Number(value.duration)||0,
      artwork:artUrl(value.artwork?.['480x480']||value.artwork?.['150x150'])||fallback,source,
      publicStream:true};
  }
  function normalizeAlbum(value){
    if(!value||!validTrack(value.id)||value.access?.stream===false)return null;
    const source=value.permalink?.startsWith('/')?'https://audius.co'+value.permalink:'';
    if(!sourceUrl(source))return null;
    const name=String(value.playlist_name||value.title||'').trim();
    if(!name)return null;
    return {id:value.id,title:name,artist:value.user?.name||'کاربر آدیوس',artwork:artUrl(value.artwork?.['480x480'])||fallback,
      trackCount:Number(value.track_count)||0,source,isAlbum:!!value.is_album};
  }
  const unique=(items)=>[...new Map(items.map(v=>[v.id,v])).values()];
  function updateDiscoveryStatus(message){
    set('audiusContext',message);
    const count=discovery.mode==='albums'?discovery.albums.length:discovery.results.length;
    set('audiusCount',tcount(count)+(discovery.mode==='albums'?' آلبوم / پلی‌لیست':' قطعه'));
  }
  function setBusy(busy){
    discovery.pending=busy;
    const search=$('audiusSearchButton');
    if(search)search.disabled=busy;
    more.disabled=busy;
    more.textContent=busy?'در حال دریافت…':'نمایش نتایج بیشتر';
  }
  function resetPlayerForQueue(){
    audio.pause();audio.removeAttribute('src');audio.load();
    player.index=-1;player.tracks=[];player.playing=false;player.serial++;
    panel.hidden=true;
  }
  function renderAlbums(){
    discoveryGrid.replaceChildren();
    discovery.albums.forEach(album=>{
      const card=element('article','audius-track audius-album');
      const img=makeCover(element('img','audius-track-photo'),album.artwork,'کاور '+album.title);
      img.width=360;img.height=300;
      const body=element('div','audius-track-body');
      body.append(element('small','',album.isAlbum?'آلبوم':'آلبوم / پلی‌لیست'),
        element('h3','',album.title),element('p','',album.artist+' · '+tcount(album.trackCount)+' قطعه'));
      const actions=element('div','audius-track-actions');
      const choose=element('button','audius-choose','♫ نمایش قطعات');
      choose.type='button';choose.addEventListener('click',()=>loadAlbumTracks(album));
      const link=element('a','audius-source','↗');link.href=album.source;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','باز کردن '+album.title+' در آدیوس');
      actions.append(choose,link);body.append(actions);card.append(img,body);discoveryGrid.append(card);
    });
  }
  async function apiGet(path,params,signal){
    const url=new URL(API+path);
    for(const [key,val] of Object.entries(params))url.searchParams.set(key,String(val));
    const response=await fetch(url.toString(),{cache:'no-store',mode:'cors',signal});
    if(!response.ok)throw new Error('Audius API HTTP '+response.status);
    const payload=await response.json();
    if(!Array.isArray(payload.data))throw new Error('Audius returned an invalid catalog');
    return payload.data;
  }
  async function browse(query,mode=discovery.mode,append=false){
    const normalized=String(query||'').trim().slice(0,70);
    discovery.mode=mode;
    discovery.query=normalized;
    const request=++discovery.requestId;
    const offset=append?discovery.page*discovery.limit:0;
    setBusy(true);empty.hidden=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    const term=normalized||'persian';
    try{
      if(!append){discovery.page=0;more.hidden=true;}
      const incoming=await apiGet(mode==='albums'?'/playlists/search':'/tracks/search',
          {query:term,limit:discovery.limit,offset},controller.signal);
      if(request!==discovery.requestId)return;
      if(mode==='albums'){
        const mapped=incoming.map(normalizeAlbum).filter(Boolean);
        discovery.albums=unique(append?[...discovery.albums,...mapped]:mapped);
        renderAlbums();
      }else{
        const mapped=incoming.map(normalizeTrack).filter(Boolean);
        discovery.results=unique(append?[...discovery.results,...mapped]:mapped);
        // Loading more must not interrupt music already playing.
        if(!append)resetPlayerForQueue();
        player.tracks=discovery.results;
        renderCards();
      }
      discovery.page=Math.floor(offset/discovery.limit)+1;
      more.hidden=incoming.length<discovery.limit;
      const count=mode==='albums'?discovery.albums.length:discovery.results.length;
      empty.hidden=count!==0;
      updateDiscoveryStatus('نتایج جست‌وجوی «'+term+'» در آدیوس — فقط موارد قابل دریافت');
    }catch{
      if(request!==discovery.requestId)return;
      more.hidden=true;
      if(!append){
        if(mode==='albums'){discovery.albums=[];renderAlbums();}
        else{discovery.results=[];resetPlayerForQueue();renderCards();}
        empty.hidden=false;
      }
      updateDiscoveryStatus('دریافت آرشیو آدیوس ممکن نشد؛ دوباره تلاش کن یا عبارت دیگری جست‌وجو کن.');
    }finally{
      clearTimeout(timeout);
      if(request===discovery.requestId)setBusy(false);
    }
  }
  async function loadAlbumTracks(album){
    if(!validTrack(album.id)||discovery.pending)return;
    const request=++discovery.requestId;setBusy(true);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const data=await apiGet('/playlists/'+encodeURIComponent(album.id)+'/tracks',{limit:100,offset:0},controller.signal);
      if(request!==discovery.requestId)return;
      const tracks=unique(data.map(normalizeTrack).filter(Boolean));
      if(!tracks.length){updateDiscoveryStatus('این آلبوم قطعه قابل پخش عمومی ندارد.');return;}
      discovery.mode='tracks';discovery.results=tracks;discovery.page=0;
      resetPlayerForQueue();player.tracks=tracks;
      $('audiusTracksTab').classList.add('active');$('audiusTracksTab').setAttribute('aria-pressed','true');
      $('audiusAlbumsTab').classList.remove('active');$('audiusAlbumsTab').setAttribute('aria-pressed','false');
      grid.hidden=false;discoveryGrid.hidden=true;
      more.hidden=true;empty.hidden=true;renderCards();
      updateDiscoveryStatus('قطعات آلبوم «'+album.title+'»');
      grid.scrollIntoView({behavior:'smooth',block:'start'});
    }catch{if(request===discovery.requestId)updateDiscoveryStatus('باز کردن قطعات آلبوم ممکن نشد؛ منبع رسمی آدیوس را باز کن.');}
    finally{clearTimeout(timeout);if(request===discovery.requestId)setBusy(false);}
  }
  function switchMode(mode){
    if(discovery.mode===mode)return;
    discovery.mode=mode;
    const albums=mode==='albums';
    grid.hidden=albums;discoveryGrid.hidden=!albums;
    $('audiusTracksTab').classList.toggle('active',!albums);
    $('audiusAlbumsTab').classList.toggle('active',albums);
    $('audiusTracksTab').setAttribute('aria-pressed',String(!albums));
    $('audiusAlbumsTab').setAttribute('aria-pressed',String(albums));
    const search=$('audiusSearch').value.trim();
    if(albums)browse(search||discovery.query||'persian','albums',false);
    else if(search)browse(search,'tracks',false);
    else showFeatured();
  }
  function showFeatured(){
    discovery.requestId++;
    discovery.mode='tracks';discovery.query='';discovery.page=0;
    discovery.results=[...discovery.initial];discovery.albums=[];
    grid.hidden=false;discoveryGrid.hidden=true;
    $('audiusTracksTab').classList.add('active');
    $('audiusTracksTab').setAttribute('aria-pressed','true');
    $('audiusAlbumsTab').classList.remove('active');
    $('audiusAlbumsTab').setAttribute('aria-pressed','false');
    resetPlayerForQueue();player.tracks=discovery.results;
    renderCards();more.hidden=true;empty.hidden=player.tracks.length>0;
    updateDiscoveryStatus('منتخب موسیقی ایرانی آوا و نوا');
  }
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
  audio.addEventListener('playing',()=>{
    player.loading=false;updateButtons();
    const track=selected();
    if(track){
      announce('در حال پخش: '+track.title);
      window.dispatchEvent(new CustomEvent('radio-audius-started',{detail:{title:track.title,artist:track.artist}}));
    }
  });
  audio.addEventListener('pause',()=>{
    // Ignore a stale pause event from the previous track after a new stream starts.
    if(!audio.paused)return;
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
  audio.addEventListener('error',()=>{
    player.loading=false;updateButtons();
    const track=selected();
    if(track)window.dispatchEvent(new CustomEvent('radio-audius-paused',{detail:{title:track.title,artist:track.artist}}));
    announce('این فایل اکنون پخش نمی‌شود؛ از لینک منبع رسمی استفاده کن یا قطعه بعدی را بزن.');
  });
  audio.addEventListener('ended',()=>{updateButtons();adjacent(1,true);});
  window.addEventListener('radio-audius-stop',()=>{if(!audio.paused)audio.pause();});
  window.addEventListener('radio-audius-toggle',toggle);
  let searchDelay=null;
  const searchForm=$('audiusSearchForm');
  searchForm.addEventListener('submit',event=>{
    event.preventDefault();
    clearTimeout(searchDelay);
    const q=$('audiusSearch').value.trim();
    if(!q){
      if(discovery.mode==='albums')return browse('persian','albums',false);
      return showFeatured();
    }
    browse(q,discovery.mode,false);
  });
  $('audiusSearch').addEventListener('input',()=>{
    clearTimeout(searchDelay);
    const q=$('audiusSearch').value.trim();
    if(!q)return;
    if(q.length<2)return;
    searchDelay=setTimeout(()=>browse(q,discovery.mode,false),550);
  });
  $('audiusGenres').querySelectorAll('[data-audius-query]').forEach(button=>button.addEventListener('click',()=>{
    $('audiusGenres').querySelectorAll('button').forEach(b=>{
      const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
    });
    $('audiusSearch').value='';
    const q=button.dataset.audiusQuery||'';
    if(!q&&! (discovery.mode==='albums'))showFeatured();
    else browse(q||'persian',discovery.mode,false);
  }));
  $('audiusTracksTab').addEventListener('click',()=>switchMode('tracks'));
  $('audiusAlbumsTab').addEventListener('click',()=>switchMode('albums'));
  more.addEventListener('click',()=>{if(!discovery.pending)browse(discovery.query||'persian',discovery.mode,true);});
  async function init(){
    try{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
      let response;
      try{response=await fetch('./audius-catalog.json',{signal:controller.signal,cache:'no-store'});}
      finally{clearTimeout(timeout);}
      if(!response.ok)throw Error('Audius catalog response '+response.status);
      const payload=await response.json();
      if(!Array.isArray(payload.tracks))throw Error('Invalid Audius catalog');
      discovery.initial=payload.tracks.filter(t=>validTrack(t.id)&&sourceUrl(t.source)&&t.publicStream===true);
      if(!discovery.initial.length)throw Error('Empty Audius catalog');
      showFeatured();
    }catch{
      empty.hidden=false;
      set('audiusCount','در دسترس نیست');
      updateDiscoveryStatus('فهرست منتخب بارگذاری نشد. جست‌وجوی مستقیم آدیوس همچنان در دسترس است.');
    }
  }
  init();
})();
