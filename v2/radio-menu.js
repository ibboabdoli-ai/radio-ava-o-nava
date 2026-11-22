const id = name => document.getElementById(name);
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

function renderRadioMenu(data) {
  attachLink('request', data.links.requestSong);
  const deadline = Date.parse(data.competition?.registrationDeadline);
  const expired = Number.isFinite(deadline) && deadline < Date.now();
  id('contestStatus').textContent = expired ? 'مهلت ثبت‌نام پایان یافته است.' :
    Number.isFinite(deadline) ? 'مهلت ثبت‌نام تا ' + new Date(deadline).toLocaleDateString('fa-IR') : 'مهلت ثبت‌نام اعلام نشده است.';
  if (!expired) attachLink('contest', data.links.contest);
  renderSchedule(data);
  document.querySelector('.menu > details').addEventListener('toggle', () => renderSchedule(data));
}
