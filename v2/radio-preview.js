const byId = id => document.getElementById(id);
const audio = byId('audio');
const live = { title: 'رادیو آوا و نوا', subtitle: 'پخش زنده', src: 'https://live.ibboabdoli.com/stream', stats: 'https://live.ibboabdoli.com/radio-stats.xsl', image: 'gallery/player-tar.jpg' };
let selected = live;
let recordings = [];
let tracks = [];
let genre = 'همه';
let playRequest = 0;
const playerSheet = byId('player');

if (playerSheet) {
  document.querySelector('.open-player').onclick = () => playerSheet.showModal();
  playerSheet.addEventListener('click', event => {
    if (event.target === playerSheet && event.clientY < playerSheet.getBoundingClientRect().top) playerSheet.close();
  });
  byId('fullToggle').onclick = () => play(selected);
}

function updatePlayer(status) {
  byId('now').textContent = selected.title;
  byId('state').textContent = status;
  setCover(byId('cover'), selected);
  const playing = !audio.paused;
  if (playerSheet) {
    byId('playerTitle').textContent = selected.title;
    byId('fullStatus').textContent = status;
    setCover(byId('fullCover'), selected);
  }
  for (const button of document.querySelectorAll('#toggle, #fullToggle')) {
    button.setAttribute('aria-label', playing ? 'مکث' : 'پخش');
    button.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  }
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
  const hash = location.hash.slice(1);
  const menuTargets = { schedule: 'schedule', community: 'more', more: 'more', install: 'install', competition: 'competition', 'song-request': 'song-request', about: 'about' };
  const detail = Object.hasOwn(menuTargets, hash) && byId(menuTargets[hash]);
  if (!detail && ['schedule','community','contact','install','about','more'].includes(hash)) {
    location.replace('studio.html#' + hash);
    return;
  }
  const aliases = { music: 'discover', episodes: 'archive' };
  const target = ['discover','archive'].includes(hash) ? hash : (Object.hasOwn(aliases, hash) ? aliases[hash] : 'home');
  document.querySelectorAll('main section').forEach(s => { s.hidden = s.id !== target; });
  document.querySelectorAll('nav a').forEach(a => {
    if (a.hash === '#' + target) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
  if (detail) {
    if (detail.closest('.more')) byId('more').open = true;
    detail.open = true;
    detail.scrollIntoView({ block: 'start' });
  } else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', showTab);
showTab();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}
async function loadJson(file) {
  const response = await fetch(file);
  if (!response.ok) throw new Error(response.statusText);
  return response.json();
}
loadJson('shows.json').then(data => {
  live.src = data.links.stream;
  try {
    const configuredStats = new URL(data.links.stats);
    if (configuredStats.protocol === 'https:' && configuredStats.hostname === 'live.ibboabdoli.com' && configuredStats.pathname === '/radio-stats.xsl') live.stats = configuredStats.href;
  } catch { /* Keep the vetted public stats endpoint. */ }
  recordings = data.recordings.map((r,i) => ({ ...r, subtitle: 'ساعت ' + r.time, image: 'gallery/recording-' + (i%5+1) + '.webp' }));
  byId('recent').replaceChildren(...recordings.slice(0,2).map(r => card(r)));
  renderArchive();
  byId('archiveQuery').oninput = renderArchive;
  if (byId('more')) renderRadioMenu(data);
}).catch(() => {
  for (const id of ['recent','groups']) notice(byId(id), 'آرشیو بارگذاری نشد.');
  if (byId('more')) byId('next').textContent = byId('contestStatus').textContent = 'اطلاعات بارگذاری نشد.';
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

// Listener count is fetched from Icecast; never display an invented count.
(() => {
  const badge = document.getElementById('liveListeners');
  if (!badge) return;
  // The scoped public stats endpoint is distinct from the blocked Icecast status-json endpoint.
  async function refreshListeners() {
    if (document.hidden) return;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response;
      try { response = await fetch(live.stats, {cache:'no-store',mode:'cors',signal:controller.signal}); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('Stats unavailable');
      const data = await response.json();
      if (typeof data?.live !== 'boolean' || !Number.isSafeInteger(data.listeners) || data.listeners < 0) throw new Error('Invalid public stats');
      if (!data.live) { badge.textContent = 'پخش زنده غیرفعال است'; return; }
      badge.textContent = new Intl.NumberFormat('fa-IR').format(data.listeners) + ' شنونده آنلاین';
    } catch { badge.textContent = 'آمار شنوندگان در دسترس نیست'; }
  }
  void refreshListeners();
  setInterval(() => { void refreshListeners(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshListeners(); });
})();
