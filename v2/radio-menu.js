const id = name => document.getElementById(name);
const days = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];

const scheduleTimezones = [
  ['auto', 'خودکار · ساعت دستگاه'],
  ['Asia/Tehran', 'ایران · تهران'],
  ['Europe/Stockholm', 'سوئد · استکهلم'],
  ['Europe/London', 'انگلیس · لندن'],
  ['Europe/Berlin', 'آلمان · برلین'],
  ['Europe/Paris', 'فرانسه · پاریس'],
  ['Europe/Istanbul', 'ترکیه · استانبول'],
  ['Asia/Dubai', 'امارات · دبی'],
  ['Asia/Kolkata', 'هند · دهلی'],
  ['Asia/Tokyo', 'ژاپن · توکیو'],
  ['Australia/Sydney', 'استرالیا · سیدنی'],
  ['America/New_York', 'آمریکا · نیویورک'],
  ['America/Los_Angeles', 'آمریکا · لس‌آنجلس'],
  ['America/Toronto', 'کانادا · تورنتو']
];
let scheduleData = null;
let nextScheduleTimestamp = null;
let scheduleTimer = null;
const iranWeekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const tehranParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tehran', year:'numeric',month:'2-digit',day:'2-digit',
  weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
function timeParts(date) {
  return Object.fromEntries(tehranParts.formatToParts(date)
    .filter(part => part.type !== 'literal').map(part => [part.type,part.value]));
}
function tehranInstant(year,month,day,hour,minute) {
  const target = Date.UTC(year,month-1,day,hour,minute);
  let result = target;
  for(let attempt=0;attempt<4;attempt++) {
    const parts = timeParts(new Date(result));
    const seen = Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),
      Number(parts.hour),Number(parts.minute));
    const next = result + (target-seen);
    if(next === result) break;
    result = next;
  }
  return result;
}
function nextProgram(data,now=new Date()) {
  const config=data.schedule;
  if(!Array.isArray(config?.weekdays) || !Number.isInteger(config.hour) ||
    config.hour<0 || config.hour>23 || !Number.isInteger(config.minute) ||
    config.minute<0 || config.minute>59) return null;
  const parts=timeParts(now);
  const midnight=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day));
  for(let offset=0;offset<9;offset++) {
    const date=new Date(midnight+offset*86400000);
    const day=date.getUTCDay();
    if(!config.weekdays.includes(day)) continue;
    const timestamp=tehranInstant(date.getUTCFullYear(),date.getUTCMonth()+1,
      date.getUTCDate(),config.hour,config.minute);
    if(timestamp>now.getTime()) return {timestamp,day,offset};
  }
  return null;
}
function chosenTimezone() {
  const chosen=id('scheduleTimezone').value;
  return chosen==='auto' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : chosen;
}
function renderCountdown() {
  const target=id('showCountdown');
  if(!Number.isFinite(nextScheduleTimestamp)) {
    target.textContent='زمان برنامه مشخص نیست.';
    return;
  }
  const remaining=Math.max(0,Math.ceil((nextScheduleTimestamp-Date.now())/1000));
  const hours=Math.floor(remaining/3600);
  const minutes=Math.floor(remaining%3600/60);
  const seconds=remaining%60;
  target.textContent=remaining===0 ? 'زمان شروع برنامه رسیده است؛ برای پخش زنده بررسی کنید.' :
    'تا شروع برنامه: '+[hours,minutes,seconds].map(n=>String(n).padStart(2,'0')).join(':')
      .replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
function renderSchedule(data) {
  scheduleData=data;
  const next=nextProgram(data);
  nextScheduleTimestamp=next?.timestamp ?? null;
  const time=[data.schedule.hour,data.schedule.minute].map(n=>String(n).padStart(2,'0')).join(':');
  const displayTime=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',
    hourCycle:'h23',timeZone:'Asia/Tehran'}).format(next ? new Date(next.timestamp) : new Date());
  id('next').textContent=next
    ? [data.schedule.dayPrograms?.[next.day]?.title || data.program?.title || 'آوا و نوا',
      next.offset===0 ? 'امروز' : days[next.day],displayTime].join(' · ')
    : 'زمان بعدی اعلام نشده است.';
  const zone=chosenTimezone();
  try {
    const localFormatter=new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{
      timeZone:zone,weekday:'long',day:'numeric',month:'long',hour:'2-digit',
      minute:'2-digit',hourCycle:'h23'
    });
    id('localShowTime').textContent=next
      ? 'به وقت انتخابی شما: '+localFormatter.format(new Date(next.timestamp))
      : 'ساعت محلی برنامه مشخص نیست.';
  } catch { id('localShowTime').textContent='منطقه زمانی انتخاب‌شده معتبر نیست.'; }
  id('days').replaceChildren(...[6,0,1,2,3,4,5]
    .filter(day=>data.schedule.weekdays.includes(day)).map(day=>{
      const li=document.createElement('li');
      li.textContent=days[day]+' · '+time.replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])+' تهران';
      return li;
    }));
  renderCountdown();
}
function setupScheduleTimezone() {
  const selector=id('scheduleTimezone');
  if(!selector || selector.options.length) return;
  for(const [value,label] of scheduleTimezones) {
    const option=document.createElement('option');
    option.value=value;option.textContent=label;selector.append(option);
  }
  selector.value='auto';
  selector.addEventListener('change',()=>{if(scheduleData)renderSchedule(scheduleData);});
  if(scheduleTimer===null) scheduleTimer=setInterval(()=>{
    if(!scheduleData || document.hidden) return;
    if(nextScheduleTimestamp===null || Date.now()>=nextScheduleTimestamp) renderSchedule(scheduleData);
    else renderCountdown();
  },1000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && scheduleData) renderSchedule(scheduleData);
  });
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
  setupScheduleTimezone();
  renderSchedule(data);
  document.querySelector('.menu > details').addEventListener('toggle', () => renderSchedule(data));
}
