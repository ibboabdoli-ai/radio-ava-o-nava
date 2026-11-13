/* Weekly schedule in Tehran time; user time is rendered in their device timezone. */
(() => {
'use strict';
const days = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
const scheduled = new Set([6,0,1,2,3]);
const tehran = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const europeLocal = new Intl.DateTimeFormat('fa-IR',{timeZone:'Europe/Stockholm',weekday:'long',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
const europeClock = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const iranClock = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const map={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
const $=id=>document.getElementById(id);
if(!$('weekly-days'))return;
function nextShow(now){
  // The Tehran timezone currently observes UTC+03:30 without daylight saving.
  // Verify candidate dates against Intl rather than trusting the fixed offset alone.
  const d=new Date(now);
  const utcDay=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  for(let i=-1;i<9;i++){
    const candidate=new Date(utcDay+i*86400000+17.5*3600000);
    if(candidate.getTime()<=now)continue;
    const parts=Object.fromEntries(tehran.formatToParts(candidate).map(p=>[p.type,p.value]));
    const weekday=map[parts.weekday];
    if(scheduled.has(weekday)&&Number(parts.hour)===21&&Number(parts.minute)===0)return {at:candidate,weekday};
  }
  return null;
}
function nextWeekdayDate(weekday){
  const now=Date.now();
  const base=new Date(now);
  const utcDay=Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate());
  for(let i=-1;i<9;i++){
    const candidate=new Date(utcDay+i*86400000+17.5*3600000);
    if(candidate.getTime()<now)continue;
    const parts=Object.fromEntries(tehran.formatToParts(candidate).map(p=>[p.type,p.value]));
    if(map[parts.weekday]===weekday&&Number(parts.hour)===21&&Number(parts.minute)===0)return candidate;
  }
  return null;
}
const grid=$('weekly-days');
for(const d of [6,0,1,2,3]){
  const card=document.createElement('div');card.className='weekly-day';card.dataset.weekday=String(d);
  const title=document.createElement('strong');title.textContent=days[d];
  const hour=document.createElement('span');const swedenTime = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const upcoming = nextWeekdayDate(d);
  hour.textContent='۲۱:۰۰ ایران · '+(upcoming?swedenTime.format(upcoming):'--:--')+' سوئد';
  card.append(title,hour);grid.append(card);
}
let next=null;
function refresh(){
  const now=Date.now();
  if(!next||next.at.getTime()<=now)next=nextShow(now);
  $('weekly-local-clock').textContent=europeClock.format(new Date(now));
  $('weekly-iran-clock').textContent=iranClock.format(new Date(now));
  if(!next){$('weekly-next-name').textContent='برنامه بعدی نامشخص';$('weekly-next-local').textContent='';$('weekly-countdown').textContent='--:--:--';return;}
  $('weekly-next-name').textContent=days[next.weekday]+'، ساعت ۲۱ ایران';
  $('weekly-next-local').textContent='به وقت اروپا (سوئد): '+europeLocal.format(next.at);
  const sec=Math.max(0,Math.floor((next.at.getTime()-now)/1000));
  const pad=n=>String(n).padStart(2,'0');
  $('weekly-countdown').textContent=pad(Math.floor(sec/3600))+':'+pad(Math.floor(sec%3600/60))+':'+pad(sec%60);
  grid.querySelectorAll('.weekly-day').forEach(el=>{el.classList.toggle('is-next',Number(el.dataset.weekday)===next.weekday);const date=nextWeekdayDate(Number(el.dataset.weekday));if(date)el.querySelector('span').textContent='۲۱:۰۰ ایران · '+europeClock.format(date)+' سوئد';});
}
refresh();setInterval(refresh,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){next=null;refresh();}});
})();
