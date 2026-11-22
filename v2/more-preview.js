const id = name => document.getElementById(name);
const stream = id('stream');
const sheet = id('player');
const playButtons = document.querySelectorAll('[data-play]');
const days = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];

function renderSchedule(data) {
  const {weekdays, hour, minute, dayPrograms} = data.schedule;
  const formatter = new Intl.DateTimeFormat('en-US', {timeZone: data.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  const time = [hour, minute].map(n => n.toLocaleString('fa-IR', {minimumIntegerDigits: 2})).join(':');
  const next = Array.from({length: 8}, (_, offset) => offset).find(offset =>
    weekdays.includes((today + offset) % 7) && (offset > 0 || Number(parts.hour)*60 + Number(parts.minute) < hour*60 + minute));
  id('next').textContent = next === undefined ? 'زمان بعدی اعلام نشده است.' :
    [dayPrograms?.[(today+next)%7]?.title || data.program.title, next === 0 ? 'امروز' : days[(today+next)%7], time].join(' · ');
  id('days').replaceChildren(...[6,0,1,2,3,4,5].filter(day => weekdays.includes(day)).map(day => {
    const li = document.createElement('li');
    li.textContent = days[day] + ' · ' + time;
    return li;
  }));
}

function attachLink(name, url) {
  const a = id(name);
  if (url && new URL(url).protocol === 'https:') { a.href = url; a.hidden = false; }
}
async function loadMenu() {
  try {
    const response = await fetch('shows.json');
    if (!response.ok) throw new Error('menu');
    const data = await response.json();
    attachLink('request', data.links.requestSong);
    const deadline = Date.parse(data.competition?.registrationDeadline);
    const expired = Number.isFinite(deadline) && deadline < Date.now();
    id('contestStatus').textContent = expired ? 'مهلت ثبت‌نام پایان یافته است.' :
      Number.isFinite(deadline) ? 'مهلت ثبت‌نام تا ' + new Date(deadline).toLocaleDateString('fa-IR') : 'مهلت ثبت‌نام اعلام نشده است.';
    if (!expired) attachLink('contest', data.links.contest);
    renderSchedule(data);
    document.querySelector('.week').addEventListener('toggle', () => renderSchedule(data));
  } catch {
    id('next').textContent = id('contestStatus').textContent = 'اطلاعات بارگذاری نشد.';
  }
}
loadMenu();

const rows = document.querySelectorAll('.menu > details');
rows.forEach(row => row.addEventListener('toggle', () => {
  if (row.open) rows.forEach(other => { if (other !== row) other.open = false; });
}));
function selectPlatform(platform) {
  document.querySelectorAll('[data-platform]').forEach(button => {
    const active = button.dataset.platform === platform;
    button.setAttribute('aria-pressed', String(active));
    id(button.dataset.platform).hidden = !active;
  });
}
document.querySelectorAll('[data-platform]').forEach(b => b.onclick = () => selectPlatform(b.dataset.platform));
selectPlatform(/android/i.test(navigator.userAgent) ? 'android' : 'ios');
document.querySelector('.open-player').onclick = () => sheet.showModal();
sheet.addEventListener('click', event => {
  if (event.target === sheet && event.clientY < sheet.getBoundingClientRect().top) sheet.close();
});
function showState(message) {
  document.querySelectorAll('[data-status]').forEach(s => { s.textContent = message; });
  playButtons.forEach(b => {
    const label = stream.paused ? 'شنیدن رادیو' : 'مکث';
    b.setAttribute('aria-label', label);
    b.textContent = b.classList.contains('listen') ? label : (stream.paused ? '▶' : 'Ⅱ');
  });
}
playButtons.forEach(b => b.onclick = async () => {
  if (!stream.paused) { stream.pause(); return; }
  if (stream.error) stream.load();
  try { await stream.play(); }
  catch (error) { if (error.name !== 'AbortError') showState('پخش در دسترس نیست'); }
});
stream.onwaiting = () => showState('در حال اتصال…');
stream.onplaying = () => showState('در حال پخش');
stream.onpause = () => showState('متوقف');
stream.onerror = () => showState('پخش در دسترس نیست');
