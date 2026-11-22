const byId = id => document.getElementById(id);
const audio = byId('audio');
const live = { title: 'رادیو آوا و نوا', subtitle: 'پخش زنده', src: 'https://live.ibboabdoli.com/stream', image: 'gallery/player-tar.jpg' };
let selected = live;
let recordings = [];
let tracks = [];
let genre = 'همه';
let playRequest = 0;

function updatePlayer(status) {
  byId('now').textContent = selected.title;
  byId('state').textContent = status;
  setCover(byId('cover'), selected);
  const playing = !audio.paused;
  byId('toggle').setAttribute('aria-label', playing ? 'مکث' : 'پخش');
  byId('toggle').querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  const livePlaying = playing && selected === live;
  byId('liveButton').querySelector('span').textContent = livePlaying ? 'مکث رادیو' : 'شنیدن رادیو';
  byId('liveButton').querySelector('use').setAttribute('href', livePlaying ? '#i-pause' : '#i-play');
}

async function play(item) {
  const request = ++playRequest;
  if (item === selected && !audio.paused) {
    audio.pause();
    return;
  }
  if (selected !== item || !audio.src || audio.error) audio.src = item.src;
  selected = item;
  updatePlayer('در حال اتصال…');
  try {
    await audio.play();
  } catch {
    if (request === playRequest) updatePlayer('پخش در دسترس نیست · تلاش دوباره');
  }
}
audio.addEventListener('playing', () => updatePlayer(selected.subtitle));
audio.addEventListener('pause', () => { if (audio.paused && !audio.error) updatePlayer('متوقف'); });
audio.addEventListener('error', () => updatePlayer('پخش در دسترس نیست · تلاش دوباره'));
byId('liveButton').onclick = () => play(live);
byId('toggle').onclick = () => play(selected);

function setCover(img, item) {
  if (img.dataset.source === item.image) return;
  img.dataset.source = item.image;
  img.onerror = () => { img.onerror = null; img.src = 'gallery/genre-traditional.webp'; };
  img.src = item.image;
}
function card(item, tile = false) {
  const button = document.createElement('button');
  button.className = tile ? 'tile' : 'row';
  button.innerHTML = '<img alt="" loading="lazy"><span><b></b><small></small></span>' +
    (tile ? '' : '<svg aria-hidden="true"><use href="#i-play"/></svg>');
  button.querySelector('b').textContent = item.title;
  button.querySelector('small').textContent = item.subtitle;
  setCover(button.querySelector('img'), item);
  button.onclick = () => play(item);
  return button;
}
function notice(parent, message) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = message;
  parent.replaceChildren(p);
}
function normalize(value) {
  return value.replaceAll('ي','ی').replaceAll('ك','ک').replaceAll('‌',' ').trim().toLowerCase();
}
function renderArchive() {
  const parent = byId('groups');
  const query = normalize(byId('archiveQuery').value);
  parent.replaceChildren();
  const groups = new Map();
  for (const item of recordings) {
    if (!normalize(item.title + ' ' + item.subtitle).includes(query)) continue;
    if (!groups.has(item.date)) {
      const group = document.createElement('details');
      group.open = Boolean(query);
      const title = document.createElement('summary');
      title.textContent = item.date;
      group.append(title);
      groups.set(item.date, group);
      parent.append(group);
    }
    groups.get(item.date).append(card(item));
  }
  if (!groups.size) notice(parent, 'برنامه‌ای پیدا نشد.');
}
function renderMusic() {
  const query = normalize(byId('query').value);
  const matches = tracks.filter(t => (genre === 'همه' || t.genre === genre) && normalize(t.title + ' ' + t.subtitle).includes(query));
  byId('music').replaceChildren(...matches.map(t => card(t, true)));
  if (!matches.length) notice(byId('music'), 'آهنگی پیدا نشد.');
}
function showTab() {
  const target = ['discover','archive'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  document.querySelectorAll('main section').forEach(s => { s.hidden = s.id !== target; });
  document.querySelectorAll('nav a').forEach(a => {
    if (a.hash === '#' + target) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', showTab);
showTab();
async function loadJson(file) {
  const response = await fetch(file);
  if (!response.ok) throw new Error(response.statusText);
  return response.json();
}
loadJson('shows.json').then(data => {
  live.src = data.links.stream;
  recordings = data.recordings.map((r,i) => ({ ...r, subtitle: 'ساعت ' + r.time, image: 'gallery/recording-' + (i%5+1) + '.webp' }));
  byId('recent').replaceChildren(...recordings.slice(0,2).map(r => card(r)));
  renderArchive();
  byId('archiveQuery').oninput = renderArchive;
}).catch(() => {
  for (const id of ['recent','groups']) notice(byId(id), 'آرشیو بارگذاری نشد.');
});
loadJson('audius-catalog.json').then(data => {
  tracks = data.tracks.filter(t => t.publicStream).map(t => ({
    ...t, subtitle: t.artist, image: t.artwork || 'gallery/genre-traditional.webp',
    src: data.apiBase + '/tracks/' + encodeURIComponent(t.id) + '/stream?app_name=' + encodeURIComponent(data.appName)
  }));
  for (const name of ['همه', ...new Set(tracks.map(t => t.genre))]) {
    const filter = document.createElement('button');
    filter.textContent = name;
    filter.setAttribute('aria-pressed', String(genre === name));
    filter.onclick = () => {
      genre = name;
      for (const b of byId('filters').children) b.setAttribute('aria-pressed', String(b === filter));
      renderMusic();
    };
    byId('filters').append(filter);
  }
  byId('query').oninput = renderMusic;
  renderMusic();
}).catch(() => notice(byId('music'), 'فهرست موسیقی بارگذاری نشد.'));
