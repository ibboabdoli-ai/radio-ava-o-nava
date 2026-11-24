const get = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const song = params.get('song');
const requestedPlaylist = params.get('playlist');
const endpoint = '/api/library/';
let identity, catalog, selectedPlaylist, queue = [], position = -1;

const messages = {
  catalog_unavailable:'فهرست آهنگ‌ها موقتاً باز نشد. دوباره تلاش کن.',
  invalid_credentials:'نام کاربری یا گذرواژه درست نیست.',
  invalid_clubhouse_code:'کد عضویت معتبر نیست یا منقضی شده.',
  invalid_name:'یک نام تا ۸۰ نویسه وارد کن.',
  invalid_playlist:'نام یا تنظیم نمایش پلی‌لیست معتبر نیست.',
  not_found:'این پلی‌لیست یا آهنگ در دسترس نیست.',
  sign_in_required:'برای ساخت یا تغییر پلی‌لیست وارد حساب شو.',
  playlist_limit:'به سقف ۱۰۰ پلی‌لیست رسیدی.',
  track_limit:'این پلی‌لیست به سقف ۵۰۰ آهنگ رسیده.',
  rate_limited:'تعداد تلاش‌ها زیاد شد. کمی بعد دوباره امتحان کن.',
  clubhouse_profile_disabled:'ورود با کد باشگاه فعلاً در دسترس نیست.',
};
const status = message => { get('state').textContent = message; };
const show = (id, yes) => { get(id).hidden = !yes; };
const label = track => track.title ? track.title + (track.artist ? ' — ' + track.artist : '') : 'آهنگ در دسترس نیست';
const trackPath = id => endpoint + 'playlists/' + encodeURIComponent(selectedPlaylist.id) + '/tracks/' + encodeURIComponent(id);
const playlistPath = id => endpoint + 'playlists/' + encodeURIComponent(id);
function pageUrl(id, keepSong = false) {
  const url = new URL('./account.html', location.href);
  if (id) url.searchParams.set('playlist', id);
  if (keepSong && song) url.searchParams.set('song', song);
  return url;
}

async function call(path, method = 'GET', data) {
  const response = await fetch(path, {
    method, cache:'no-store', credentials:'same-origin',
    ...(data ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messages[result.error] || 'ارتباط برقرار نشد. دوباره تلاش کن.');
  return result;
}

function action(button, work) {
  return async event => {
    event.preventDefault();
    button.disabled = true;
    status('');
    try { await work(event); }
    catch (error) { status(error.message); }
    finally { button.disabled = false; }
  };
}
function onForm(id, work) {
  const form = get(id);
  form.addEventListener('submit', action(form.querySelector('[type="submit"]'), () => work(new FormData(form))));
}

function showSignIn(profile) {
  show('sign-in', !identity && !requestedPlaylist);
  show('profile', Boolean(identity) && !requestedPlaylist);
  show('my-playlists', Boolean(identity) && !requestedPlaylist);
  show('google', profile.googleEnabled);
  if (song && /^[a-f0-9-]{32,36}$/i.test(song)) {
    get('google').href = endpoint + 'auth/google?' + new URLSearchParams({song});
  }
  if (!identity) return;
  get('display-name').textContent = identity.name;
  get('signin-method').textContent = identity.method === 'club' ? 'ورود از باشگاه' : 'ورود با گوگل';
  if (identity.picture) {
    get('avatar').src = identity.picture;
    show('avatar', true);
  }
}

async function showPlaylists() {
  const {playlists} = await call(endpoint + 'playlists');
  const list = get('playlists');
  list.replaceChildren(...playlists.map(item => {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = pageUrl(item.id, true);
    link.textContent = item.name;
    const privacy = document.createElement('small');
    privacy.textContent = item.public ? 'عمومی' : 'خصوصی';
    row.append(link,privacy);
    return row;
  }));
  if (!playlists.length) status('هنوز پلی‌لیستی نساخته‌ای.');
  if (!song) return;
  const track = (await loadCatalog()).find(track => track.id === song);
  if (track) {
    get('song-picker-note').textContent = 'برای ذخیرهٔ «' + track.title + '» یک پلی‌لیست انتخاب کن یا یکی بساز.';
    show('song-picker-note', true);
  }
}

async function loadCatalog() {
  catalog ??= (await call(endpoint + 'playlist-catalog')).tracks;
  return catalog;
}

function searchSongs() {
  const match = get('song-query').value.trim().toLocaleLowerCase('fa');
  const selected = get('song').value || song;
  const items = catalog.filter(track => label(track).toLocaleLowerCase('fa').includes(match));
  if (!match && selected && items.some(track => track.id === selected)) {
    items.sort((a,b) => Number(b.id === selected) - Number(a.id === selected));
  }
  const empty = new Option('انتخاب آهنگ', '');
  get('song').replaceChildren(empty, ...items.slice(0, 75).map(track => new Option(label(track), track.id)));
  if (items.slice(0, 75).some(track => track.id === selected)) get('song').value = selected;
}

async function showPlaylist(id, initialize = false) {
  const playlist = selectedPlaylist = await call(playlistPath(id));
  document.title = playlist.name + ' | آوا و نوا';
  get('heading').textContent = playlist.owned ? 'پلی‌لیست من' : 'پلی‌لیست';
  get('playlist-title').textContent = playlist.name;
  get('visibility').textContent = playlist.public ? 'عمومی · هرکسی لینک داشته باشه می‌تونه گوش بده.' : 'خصوصی';
  get('edit-name').value = playlist.name;
  get('edit').elements.namedItem('public').checked = playlist.public;
  show('playlist', true);
  show('playlist-back', Boolean(identity));
  show('edit', playlist.owned);
  show('share', playlist.owned && playlist.public);
  show('add', playlist.owned);
  show('player', playlist.tracks.some(track => track.title));
  get('tracks').replaceChildren(...playlist.tracks.map(track => renderTrack(track, playlist.owned)));
  if (playlist.owned && initialize) {
    await loadCatalog();
    searchSongs();
  }
}

function renderTrack(track, owned) {
  const row = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'track-name';
  button.textContent = label(track);
  button.disabled = !track.title;
  button.onclick = () => playList(track.id);
  row.append(button);
  if (owned) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'برداشتن';
    remove.setAttribute('aria-label', 'برداشتن ' + label(track));
    remove.onclick = action(remove, async () => {
      await call(trackPath(track.id), 'DELETE');
      await showPlaylist(selectedPlaylist.id);
    });
    row.append(remove);
  }
  return row;
}

function playList(id) {
  queue = selectedPlaylist.tracks.filter(track => track.title);
  position = id ? queue.findIndex(track => track.id === id) : 0;
  playCurrent();
}

function playCurrent() {
  const track = queue[position];
  if (!track) return;
  const audio = get('audio');
  get('current').textContent = label(track);
  audio.src = endpoint + 'audio/' + encodeURIComponent(track.id);
  audio.play().catch(() => status('این آهنگ باز نشد. دوباره بزن یا آهنگ بعدی را انتخاب کن.'));
}

async function signInWithClub(formId, route, credentials) {
  await call(route, 'POST', credentials);
  get(formId).reset();
  const profile = await call(endpoint + 'profile');
  identity = profile.account;
  if (!identity || identity.method !== 'club') throw new Error('برای پلی‌لیست با حساب شنوندهٔ باشگاه وارد شو.');
  showSignIn(profile);
  await showPlaylists();
}

onForm('club-sign-in', fields => signInWithClub('club-sign-in','/api/auth/clubhouse-code',{code:fields.get('code')}));
onForm('password-sign-in', fields => signInWithClub('password-sign-in','/api/auth/login',{
  username:fields.get('username').trim(),
  password:fields.get('password'),
}));

get('logout').onclick = action(get('logout'), async () => {
  if (identity.method === 'club') await call('/api/auth/logout', 'POST');
  else await call(endpoint + 'auth/logout', 'POST');
  location.assign(pageUrl(null, true));
});

onForm('create', async fields => {
  const {id} = await call(endpoint + 'playlists', 'POST', {name:fields.get('name')});
  location.assign(pageUrl(id,true));
});

onForm('edit', async fields => {
  await call(playlistPath(selectedPlaylist.id), 'PATCH', {name:fields.get('name'),public:fields.has('public')});
  await showPlaylist(selectedPlaylist.id);
  show('share-url', false);
  show('share-url-label', false);
  status('ذخیره شد.');
});

onForm('add', async fields => {
  await call(trackPath(fields.get('song')), 'PUT');
  await showPlaylist(selectedPlaylist.id);
  status('آهنگ در پلی‌لیست است.');
});

get('delete').onclick = action(get('delete'), async () => {
  if (!confirm('پلی‌لیست «' + selectedPlaylist.name + '» حذف شود؟')) return;
  await call(playlistPath(selectedPlaylist.id), 'DELETE');
  location.assign(pageUrl());
});

get('share').onclick = action(get('share'), async () => {
  const url = pageUrl(selectedPlaylist.id).href;
  get('share-url').value = url;
  show('share-url', true);
  show('share-url-label', true);
  if (!navigator.clipboard) return;
  if (await navigator.clipboard.writeText(url).then(() => true, () => false)) status('لینک کپی شد.');
});

get('song-query').oninput = searchSongs;
get('play-all').onclick = () => playList();
get('audio').onended = () => {
  position += 1;
  if (position < queue.length) playCurrent();
  else status('پایان پلی‌لیست.');
};
get('audio').onerror = () => status('فایل این آهنگ در دسترس نیست.');

async function initialize() {
  const profile = await call(endpoint + 'profile');
  identity = profile.account;
  status(params.has('signin') ? 'ورود گوگل کامل نشد. دوباره تلاش کن.' : '');
  showSignIn(profile);
  if (requestedPlaylist) await showPlaylist(requestedPlaylist,true);
  else if (identity) await showPlaylists();
}
initialize().catch(error => status(error.message));
