const get=id=>document.getElementById(id);
const query=get('query'),results=get('results'),status=get('catalog-status');
const player=get('player'),audio=get('audio'),previous=get('previous'),next=get('next');
const mini=get('mini-player'),miniToggle=get('mini-toggle'),playerStatus=get('player-status');
const archivePath='/v2/music-library/';
const libraryApi='https://api-radio.ibboabdoli.com';
const historyKey='ava-nava.archive.recent.v1';
const unknown='بدون سبک';
const count=new Intl.NumberFormat('fa-IR');
const collator=new Intl.Collator('fa',{sensitivity:'base',numeric:true});
const portraitFiles=new Map();
const genreArtwork=new Map([['پاپ','pop'],['سنتی','traditional'],['هیپ هاپ','hiphop'],['کلاسیک','classical'],['بلوز','blues']]);
const moodLists=new Map([
  ['calm',{title:'آرامش',art:'chill',songs:[['هایده','ساغر هستی'],['حمیرا','دل خونه'],['مهستی','هزار بونه'],['داریوش','شام مهتاب'],['معین','بهانه']]}],
  ['drive',{title:'در مسیر',art:'drive',songs:[['گوگوش','همسفر'],['ابی','پوست شیر'],['فرهاد','بوی عیدی'],['فرامرز آصف','کمر باریک'],['بیژن مرتضوی','برقص']]}],
]);
const albumOrder=(a,b)=>(a.discNo??1)-(b.discNo??1)||(a.trackNo??1000)-(b.trackNo??1000)||collator.compare(a.title,b.title);
const recentOrder=(a,b)=>(b.addedAt??0)-(a.addedAt??0)||collator.compare(a.title,b.title)||a.id.localeCompare(b.id);
const styles=new Map(),artists=new Map(),allAlbums=[],byId=new Map();
let tracks=[],view={},loaded=false,playQueue=[],playIndex=-1,queueName='';
const genreOf=track=>track.genre?.trim()||unknown;
const artistOf=track=>track.artist?.trim()||'هنرمند نامشخص';
const archiveUrl=(args={})=>archivePath+(Object.keys(args).length?'?'+new URLSearchParams(args):'');
const artistUrl=(artist,options={})=>archiveUrl({artist,...options});
const termsOf=text=>normalize(text).split(' ').filter(Boolean);
const matches=(text,terms)=>terms.every(term=>normalize(text).includes(term));
const searchable=track=>[track.title,artistOf(track),track.album].filter(Boolean).join(' ');
const numberOf=(n,what)=>count.format(n)+' '+what;

function normalize(text){
  return String(text??'').normalize('NFKC').toLowerCase().replace(/[يى]/g,'ی').replaceAll('ك','ک')
    .replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[\s\u200c]+/g,' ').trim();
}
function node(tag,value='',className=''){
  const item=document.createElement(tag);
  item.textContent=value;
  if(className)item.className=className;
  return item;
}
function link(label,href,className=''){
  const item=node('a',label,className);
  item.href=href;
  return item;
}
function listOf(items,className){
  const list=node('ul','',className);
  for(const item of items){const row=node('li');row.append(item);list.append(row);}
  return list;
}
function section(title,body,more){
  const result=node('section','','section');
  const heading=node('div','','section-head');
  heading.append(node('h2',title));
  if(more)heading.append(more);
  result.append(heading,body);
  return result;
}
function art(name,base=''){
  const item=node('span','',[base,'has-art','art-'+name].filter(Boolean).join(' '));
  item.setAttribute('aria-hidden','true');
  return item;
}
function trackArt(track){
  return genreArtwork.get(normalize(genreOf(track)))||'radio';
}
function portrait(artist){
  const photos=portraitFiles.get(normalize(artist.name))??[];
  const avatar=node('span','','avatar is-art');
  avatar.setAttribute('aria-hidden','true');
  avatar.append(art(trackArt(artist.songs[0])));
  if(photos.length===2)avatar.classList.add('is-duo');
  for(const photo of photos){
    const img=node('img');
    img.src=photo.image;
    img.alt='';
    img.loading='lazy';
    img.decoding='async';
    img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>{
      img.remove();
      avatar.classList.remove('is-duo');
    },{once:true});
    avatar.append(img);
  }
  return avatar;
}
function setPhotoCredit(artist){
  const credit=get('photo-source');
  credit.replaceChildren();
  credit.hidden=!artist;
  if(!artist)return;
  const photos=portraitFiles.get(normalize(artist.name))??[];
  if(!photos.length){
    credit.textContent='تصویر آرشیو';
    return;
  }
  for(const [index,photo] of photos.entries()){
    if(index)credit.append(document.createTextNode(' · '));
    const label=photo.artwork?'منبع تصویر اثر':photos.length>1?'عکس '+count.format(index+1):'منبع عکس';
    credit.append(link(photo.credit?label+' · '+photo.credit:label,photo.source));
    if(photo.license)credit.append(document.createTextNode(' · '),link('مجوز عکس',photo.license));
  }
}
function latestPlayed(){
  try{
    const entries=JSON.parse(localStorage.getItem(historyKey)||'[]');
    return Array.isArray(entries)?entries.map(id=>byId.get(id)).filter(Boolean).slice(0,8):[];
  }catch{return [];}
}
function rememberPlayback(track){
  if(!track)return;
  try{
    const ids=[track.id,...latestPlayed().filter(item=>item.id!==track.id).map(item=>item.id)].slice(0,8);
    localStorage.setItem(historyKey,JSON.stringify(ids));
  }catch{/* The archive still plays when browser storage is unavailable. */}
}
function syncPlayer(){
  const current=playQueue[playIndex];
  for(const button of results.querySelectorAll('[data-track]')){
    button.setAttribute('aria-pressed',String(button.dataset.track===current?.id));
  }
  previous.disabled=playIndex<=0;
  next.disabled=playIndex<0 || playIndex===playQueue.length-1;
  miniToggle.textContent=audio.paused?'▶':'Ⅱ';
  miniToggle.setAttribute('aria-label',audio.paused?'ادامهٔ پخش':'توقف موقت پخش');
}
function play(name,queue,track){
  const index=track?queue.indexOf(track):0;
  if(index<0||!queue.length)return;
  queueName=name;
  playQueue=queue;
  startTrack(index);
  if(!player.open)player.showModal();
}
function trackButton(track,playSelected,byline=artistOf(track)){
  const button=node('button','','track');
  button.type='button';
  button.dataset.track=track.id;
  button.setAttribute('aria-label','پخش '+track.title+'، '+artistOf(track));
  const details=node('span','','track-info');
  details.append(node('strong',track.title),node('small',byline,'track-artist'));
  const symbol=node('span','▶','track-icon');
  symbol.setAttribute('aria-hidden','true');
  button.append(art(trackArt(track),'track-art'),details,symbol);
  button.addEventListener('click',()=>playSelected(track));
  return button;
}
function trackGroup(title,shown,queue=shown,byline){
  const group=node('section','','genre-group');
  const heading=node('div','','genre-head');
  const playAll=node('button','▶  پخش فهرست','button');
  playAll.type='button';
  playAll.setAttribute('aria-label','پخش فهرست '+title);
  playAll.addEventListener('click',()=>play(title,queue));
  heading.append(node('h2',title),node('small',numberOf(shown.length,'قطعه')),playAll);
  group.append(heading,listOf(shown.map(track=>trackButton(track,item=>play(title,queue,item),byline?.(track))), 'track-list'));
  return group;
}
function artistCard([key,artist]){
  const item=link('',artistUrl(key),'artist-card');
  item.append(portrait(artist),node('strong',artist.name),node('small',numberOf(artist.songs.length,'قطعه')));
  return item;
}
function categoryCard(title,href,image){
  const card=link('',href,'category');
  if(image)card.append(art(image));
  card.append(node('strong',title));
  return card;
}
function categorySections(){
  const available=[...styles.keys()].filter(style=>style!==unknown&&style!=='آزمایشی');
  const tiles=available.map(style=>categoryCard(style,archiveUrl({view:'search',genre:style}),genreArtwork.get(normalize(style))));
  const moods=[...moodLists].filter(([,mood])=>mood.tracks?.length)
    .map(([slug,mood])=>categoryCard(mood.title,archiveUrl({view:'search',mood:slug}),mood.art));
  const groups=[];
  if(tiles.length)groups.push(section('سبک‌ها',listOf(tiles,'category-grid')));
  if(moods.length)groups.push(section('حال‌وهوا',listOf(moods,'category-grid')));
  return groups;
}
function albumCards(items){
  return listOf(items.map(album=>{
    const card=categoryCard(album.name,artistUrl(album.artistKey,{tab:'albums',album:album.key}),trackArt(album.songs[0]));
    card.setAttribute('aria-label',album.name+'، '+album.artistName);
    return card;
  }),'category-grid');
}
function renderDiscover(){
  const sections=[];
  const recent=latestPlayed();
  if(recent.length)sections.push(section('آخرین پخش‌ها در این مرورگر',
    listOf(recent.map(track=>trackButton(track,item=>play('آخرین پخش‌ها',recent,item))),'track-grid')));
  const latest=tracks.filter(track=>artistOf(track)!=='هنرمند نامشخص'&&genreOf(track)!=='آزمایشی').slice(0,6);
  if(latest.length)sections.push(section('تازه‌های آرشیو',
    listOf(latest.map(track=>trackButton(track,item=>play('تازه‌های آرشیو',latest,item))),'track-grid'),
    link('همهٔ آهنگ‌ها ←',archiveUrl({view:'search',all:'1'}))));
  const featured=[...artists].sort((a,b)=>
    Number(portraitFiles.has(b[0]))-Number(portraitFiles.has(a[0])) ||
    b[1].songs.length-a[1].songs.length || collator.compare(a[1].name,b[1].name)).slice(0,6);
  if(featured.length)sections.push(section('خواننده‌ها',listOf(featured.map(artistCard),'artist-grid'),
    link('همهٔ خواننده‌ها ←',archiveUrl({view:'artists'}))));
  if(allAlbums.length)sections.push(section('آلبوم‌ها',albumCards(allAlbums.slice(0,4)),
    link('همهٔ آلبوم‌ها ←',archiveUrl({view:'albums'}))));
  sections.push(...categorySections());
  if(!sections.length)status.textContent='آرشیو هنوز آهنگی ندارد.';
  return sections;
}
function renderArtist(terms){
  const artist=artists.get(view.artist);
  if(!artist){status.textContent='خواننده‌ای پیدا نشد.';return [];}
  if(view.tab!=='albums'){
    const shown=artist.songs.filter(track=>matches(searchable(track),terms));
    if(shown.length)return [trackGroup('آهنگ‌ها',shown,artist.songs,track=>track.album||artist.name)];
    status.textContent='آهنگی با این جست‌وجو پیدا نشد.';
    return [];
  }
  const albums=artist.albums.filter(album=>!view.album||album.key===view.album);
  const groups=[];
  for(const album of albums){
    const found=album.songs.filter(track=>matches(searchable(track),terms));
    if(found.length)groups.push(trackGroup(album.name,found,album.songs,()=>artist.name));
  }
  if(!groups.length)status.textContent=terms.length?'آلبومی با این جست‌وجو پیدا نشد.':'برای این خواننده آلبومی در این بخش ثبت نشده است.';
  return groups;
}
function renderSearch(terms){
  const style=styles.get(view.genre),mood=moodLists.get(view.mood);
  if(!terms.length&&!style&&!mood&&!view.all)return categorySections();
  const pool=style||mood?.tracks||tracks;
  const shown=pool.filter(track=>matches(searchable(track),terms));
  const result=[];
  if(terms.length&&!style&&!mood){
    const matchingArtists=[...artists].filter(([,artist])=>matches(artist.name,terms)).slice(0,12);
    if(matchingArtists.length)result.push(section('خواننده‌ها',listOf(matchingArtists.map(artistCard),'artist-grid')));
    const matchingAlbums=allAlbums.filter(album=>matches(album.name+' '+album.artistName,terms)).slice(0,12);
    if(matchingAlbums.length)result.push(section('آلبوم‌ها',albumCards(matchingAlbums)));
  }
  if(shown.length)result.push(trackGroup(style?view.genre:mood?.title||'آهنگ‌ها',shown,terms.length?shown:pool));
  if(!result.length)status.textContent='آهنگی با این جست‌وجو پیدا نشد.';
  return result;
}
function render(){
  if(!loaded)return;
  const terms=termsOf(query.value);
  status.textContent='';
  let content;
  if(view.artist)content=renderArtist(terms);
  else if(view.page==='artists'){
    const displayed=[...artists].filter(([,artist])=>matches(artist.name,terms))
      .sort((a,b)=>collator.compare(a[1].name,b[1].name));
    content=displayed.length?[listOf(displayed.map(artistCard),'artist-grid')]:[];
    if(!content.length)status.textContent='خواننده‌ای پیدا نشد.';
  }else if(view.page==='albums'){
    const displayed=allAlbums.filter(album=>matches(album.name+' '+album.artistName,terms));
    content=displayed.length?[albumCards(displayed)]:[];
    if(!content.length)status.textContent='آلبومی پیدا نشد.';
  }else if(view.page==='search')content=renderSearch(terms);
  else content=renderDiscover();
  results.replaceChildren(...content);
  get('credits').hidden=Boolean(view.artist)||!results.querySelector('.avatar img');
  syncPlayer();
}
function setView({restoreQuery=false}={}){
  const params=new URLSearchParams(location.search);
  const artist=normalize(params.get('artist'));
  const requested=params.get('view');
  const page=artist?'artists':['artists','albums','search'].includes(requested)?requested:'discover';
  view={page,artist,tab:params.get('tab'),album:normalize(params.get('album')),genre:params.get('genre'),mood:params.get('mood'),all:params.get('all')==='1'};
  if(restoreQuery)query.value=(params.get('q')||'').slice(0,100);
  const details=artists.get(artist);
  const title=artist?(details?.name||'خواننده'):
    page==='search'?(view.genre||moodLists.get(view.mood)?.title||(view.all?'همهٔ آهنگ‌ها':'جست‌وجو')):
      page==='artists'?'خواننده‌ها':page==='albums'?'آلبوم‌ها':'آرشیو آهنگ‌ها';
  const desc=artist&&details?numberOf(details.songs.length,'قطعه')+' · '+numberOf(details.albums.length,'آلبوم'):
    page==='discover'?'آهنگ‌ها، خواننده‌ها و آلبوم‌های آوا و نوا':
      view.mood&&page==='search'?'گزیده‌ای از آرشیو آوا و نوا':'';
  get('archive-title').textContent=title;
  document.title=title+' | رادیو آوا و نوا';
  get('archive-description').textContent=desc;
  get('archive-description').hidden=!desc;
  get('archive-head').dataset.view=page;
  get('search-bar').hidden=page==='discover';
  get('hero-portrait').hidden=!details;
  get('hero-portrait').replaceChildren(...(details?[portrait(details)]:[]));
  setPhotoCredit(details);
  query.placeholder=page==='artists'&&!artist?'نام خواننده':page==='albums'?'نام آلبوم یا خواننده':'نام آهنگ، خواننده یا آلبوم';
  const activeSection=page==='search'&&!view.genre&&!view.mood&&!view.all?'search':'discover';
  for(const tab of document.querySelectorAll('.radio-nav [data-page]')){
    if(tab.dataset.page===activeSection)tab.setAttribute('aria-current','page');
    else tab.removeAttribute('aria-current');
  }
  const artistsLink=get('library-artists');
  if(page==='artists'&&!artist)artistsLink.setAttribute('aria-current','page');
  else artistsLink.removeAttribute('aria-current');
  const songsTab=get('songs-link'),albumsTab=get('albums-link');
  get('artist-nav').hidden=!details;
  if(details){
    songsTab.href=artistUrl(artist);
    albumsTab.href=artistUrl(artist,{tab:'albums'});
    for(const [tab,on] of [[songsTab,view.tab!=='albums'],[albumsTab,view.tab==='albums']]){
      if(on)tab.setAttribute('aria-current','page');
      else tab.removeAttribute('aria-current');
    }
  }
  render();
}
function setPlayerStatus(message){
  playerStatus.textContent=message;
  playerStatus.hidden=!message;
}
function startTrack(index){
  const track=playQueue[index];
  if(!track)return;
  playIndex=index;
  mini.hidden=false;
  get('mini-title').textContent=get('now-title').textContent=track.title;
  get('mini-artist').textContent=get('now-artist').textContent=artistOf(track);
  get('player-art').className='player-art has-art art-'+trackArt(track);
  get('queue-progress').textContent=queueName+' · '+count.format(index+1)+' از '+count.format(playQueue.length);
  const remaining=playQueue.slice(index+1);
  get('upcoming').hidden=!remaining.length;
  const list=get('upcoming-tracks');
  list.start=index+2;
  list.replaceChildren(...remaining.map(item=>node('li',item.title+' — '+artistOf(item))));
  setPlayerStatus('');
  audio.src=libraryApi+'/api/library/audio/'+encodeURIComponent(track.id);
  void audio.play().catch(error=>{
    if(playQueue[playIndex]===track&&error.name!=='AbortError')setPlayerStatus('پخش باز نشد. دوباره تلاش کن.');
  });
  syncPlayer();
}
previous.addEventListener('click',()=>startTrack(playIndex-1));
next.addEventListener('click',()=>startTrack(playIndex+1));
get('open-player').addEventListener('click',()=>{if(!player.open)player.showModal();});
get('close-player').addEventListener('click',()=>player.close());
player.addEventListener('close',()=>{if(view.page==='discover')render();});
miniToggle.addEventListener('click',()=>{
  if(audio.paused)void audio.play().catch(()=>{setPlayerStatus('پخش باز نشد. دوباره تلاش کن.');if(!player.open)player.showModal();});
  else audio.pause();
});
audio.addEventListener('ended',()=>{
  if(playIndex+1<playQueue.length)startTrack(playIndex+1);
  else setPlayerStatus('پایان فهرست پخش');
  syncPlayer();
});
audio.addEventListener('playing',()=>{
  setPlayerStatus('');
  rememberPlayback(playQueue[playIndex]);
  syncPlayer();
});
audio.addEventListener('pause',syncPlayer);
audio.addEventListener('error',()=>setPlayerStatus('فایل این آهنگ در دسترس نیست.'));
query.addEventListener('input',()=>{
  const url=new URL(location.href);
  if(query.value.trim())url.searchParams.set('q',query.value);
  else url.searchParams.delete('q');
  history.replaceState(null,'',url);
  render();
});
document.addEventListener('click',event=>{
  const item=event.target.closest('a[href]');
  if(!loaded||!item||event.button||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.defaultPrevented)return;
  const url=new URL(item.href);
  if(url.origin!==location.origin||url.pathname!==archivePath||url.hash)return;
  event.preventDefault();
  history.pushState(null,'',url);
  setView({restoreQuery:true});
  window.scrollTo(0,0);
});
addEventListener('popstate',()=>setView({restoreQuery:true}));

async function load(){
  const imageData=fetch('./club-artist-portraits.json').then(response=>response.ok?response.json():{}).catch(()=>({}));
  const [response,portraits]=await Promise.all([fetch(libraryApi+'/api/library/tracks'),imageData]);
  for(const [name,value] of Object.entries(portraits))portraitFiles.set(normalize(name),Array.isArray(value)?value:[value]);
  if(!response.ok)throw new Error('Archive unavailable');
  const {tracks:items}=await response.json();
  tracks=items.sort(recentOrder);
  for(const track of tracks){
    const style=genreOf(track);
    byId.set(track.id,track);
    if(!styles.has(style))styles.set(style,[]);
    styles.get(style).push(track);
    if(artistOf(track)==='هنرمند نامشخص'||style==='آزمایشی'||!track.indexed)continue;
    const key=normalize(artistOf(track));
    if(!artists.has(key))artists.set(key,{name:artistOf(track),songs:[],albums:[]});
    artists.get(key).songs.push(track);
  }
  for(const [artistKey,artist] of artists){
    const collections=new Map();
    for(const song of artist.songs){
      if(!song.album)continue;
      const key=normalize(song.album);
      if(!collections.has(key))collections.set(key,{key,name:song.album,artistKey,artistName:artist.name,songs:[],updated:song.addedAt});
      collections.get(key).songs.push(song);
    }
    artist.albums=[...collections.values()];
    for(const album of artist.albums)album.songs.sort(albumOrder);
    allAlbums.push(...artist.albums);
  }
  allAlbums.sort((a,b)=>(b.updated??0)-(a.updated??0)||collator.compare(a.name,b.name));
  for(const mood of moodLists.values()){
    mood.tracks=mood.songs.map(([artist,title])=>
      tracks.find(t=>normalize(artistOf(t))===normalize(artist)&&normalize(t.title)===normalize(title))).filter(Boolean);
  }
  loaded=true;
  setView({restoreQuery:true});
}
setView({restoreQuery:true});
load().catch(()=>{status.textContent='آرشیو باز نشد. صفحه را دوباره بارگذاری کن.';});
