const get = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const song = params.get('song');
const requestedPlaylist = song ? null : params.get('playlist');
const archiveUrl = 'https://radio.ibboabdoli.com/v2/music-library/';
const endpoint = '/api/library/';
let identity, pickedSong, selectedPlaylist, queue = [], position = -1;

const messages = {
  code_is_not_playlist_name:'این شبیه کد ورود باشگاه است. یک نام برای پلی‌لیست انتخاب کن.',
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
const trackPath = (playlistId,id) => playlistPath(playlistId) + '/tracks/' + encodeURIComponent(id);
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
  show('profile', Boolean(identity) && !requestedPlaylist && !song);
  show('my-playlists', Boolean(identity) && !requestedPlaylist && (!song || Boolean(pickedSong)));
  show('google', profile.googleEnabled);
  if (song && /^[a-f0-9-]{32,36}$/i.test(song)) {
    get('google').href = endpoint + 'auth/google?' + new URLSearchParams({song});
  }
  if (!identity) return;
  get('display-name').textContent = identity.name;
  get('profile-handle').textContent = identity.handle || '';
  show('profile-handle', Boolean(identity.handle));
  get('signin-method').textContent = identity.method === 'club' ? 'ورود از باشگاه' : 'ورود با گوگل';
  if (identity.picture) {
    get('avatar').src = identity.picture;
    show('avatar', true);
  }
}

async function showPicker() {
  get('heading').textContent = 'افزودن به پلی‌لیست';
  get('list-title').textContent = 'انتخاب پلی‌لیست';
  get('create-submit').textContent = 'ساخت و افزودن';
  show('picker', true);
  const {tracks} = await call(endpoint + 'playlist-catalog');
  pickedSong = tracks.find(track => track.id === song);
  get('picker-track').textContent = pickedSong ? label(pickedSong) : 'این آهنگ در آرشیو در دسترس نیست.';
}

function playlistRow(item) {
  const row = document.createElement('li');
  if (pickedSong) {
    row.className = 'playlist-choice';
    const name = document.createElement('span');
    name.textContent = item.name;
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = 'افزودن';
    add.setAttribute('aria-label','افزودن به ' + item.name);
    add.onclick = action(add, async () => {
      await call(trackPath(item.id,pickedSong.id),'PUT');
      add.textContent = 'افزوده شد';
      status('آهنگ به «' + item.name + '» اضافه شد.');
    });
    row.append(name,add);
  } else {
    const link = document.createElement('a');
    link.href = pageUrl(item.id);
    link.textContent = item.name;
    const privacy = document.createElement('small');
    privacy.textContent = item.public ? 'عمومی' : 'خصوصی';
    row.append(link,privacy);
  }
  return row;
}

async function showPlaylists() {
  const {playlists} = await call(endpoint + 'playlists');
  get('playlists').replaceChildren(...playlists.map(playlistRow));
  if (!playlists.length) status('هنوز پلی‌لیستی نساخته‌ای.');
}

async function showPlaylist(id) {
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
  show('player', playlist.tracks.some(track => track.title));
  get('tracks').replaceChildren(...playlist.tracks.map(track => renderTrack(track, playlist.owned)));
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
      await call(trackPath(selectedPlaylist.id,track.id), 'DELETE');
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
  get('save-playing-track').href = './account.html?' + new URLSearchParams({song:track.id});
  show('save-playing-track', true);
  audio.play().catch(() => status('این آهنگ باز نشد. دوباره بزن یا آهنگ بعدی را انتخاب کن.'));
}

async function signInWithClub(formId, route, credentials) {
  await call(route, 'POST', credentials);
  get(formId).reset();
  const profile = await call(endpoint + 'profile');
  identity = profile.account;
  if (!identity || identity.method !== 'club') throw new Error('برای پلی‌لیست با حساب شنوندهٔ باشگاه وارد شو.');
  showSignIn(profile);
  if (!song || pickedSong) await showPlaylists();
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
  const name = fields.get('name').trim();
  const {id} = await call(endpoint + 'playlists', 'POST', {name,...(pickedSong ? {songId:pickedSong.id} : {})});
  if (!pickedSong) {
    location.assign(pageUrl(id));
    return;
  }
  get('create').reset();
  await showPlaylists();
  status('آهنگ به «' + name + '» اضافه شد.');
});

onForm('edit', async fields => {
  await call(playlistPath(selectedPlaylist.id), 'PATCH', {name:fields.get('name'),public:fields.has('public')});
  await showPlaylist(selectedPlaylist.id);
  show('share-url', false);
  show('share-url-label', false);
  status('ذخیره شد.');
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

get('close-picker').onclick = () => {
  window.close();
  setTimeout(() => {
    if (history.length > 1) history.back();
    else location.assign(archiveUrl);
  },0);
};
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
  if (song) await showPicker();
  showSignIn(profile);
  if (requestedPlaylist) await showPlaylist(requestedPlaylist);
  else if (identity && (!song || pickedSong)) await showPlaylists();
}
initialize().catch(error => status(error.message));
