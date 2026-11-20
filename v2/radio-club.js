import {mountCompetitionUi} from './competition-ui.js';
const $=id=>document.getElementById(id);
const state={api:'',user:null,activeSongIds:new Set()};
const errors={unauthorized:'برای ادامه وارد حساب خود شوید.',forbidden:'اجازهٔ انجام این کار را ندارید.',invalid_credentials:'نام کاربری یا گذرواژه درست نیست.',credentials_changed:'گذرواژه هم‌زمان تغییر کرده است؛ دوباره وارد شوید.',invalid_recovery:'کد بازیابی معتبر نیست یا قبلاً استفاده شده است.',username_unavailable:'این نام کاربری قبلاً ثبت شده است.',registration_disabled:'ثبت‌نام هنوز فعال نیست.',rate_limited:'تلاش‌های زیادی انجام شده؛ بعداً دوباره امتحان کنید.',song_unavailable:'این آهنگ در فهرست فعال نیست.',duplicate_active_request:'این آهنگ را قبلاً درخواست کرده‌اید.',insufficient_points_or_invalid_state:'امتیاز کافی نیست یا وضعیت درخواست تغییر کرده است.',not_cancellable:'این درخواست دیگر قابل لغو نیست.',invalid_adjustment:'مقدار و دلیل تغییر امتیاز را بررسی کنید.',idempotency_key_required:'کلید ثبت تکراری لازم است.',idempotency_conflict:'این درخواست با دادهٔ دیگری قبلاً ثبت شده است.',user_missing_or_negative_balance:'کاربر پیدا نشد یا موجودی برای کسر کافی نیست.',invalid_competition:'اطلاعات مسابقه معتبر نیست.',verification_required:'تأیید ثبت‌نام لازم است.',participant_exists_or_missing:'شرکت‌کننده قبلاً ثبت شده یا پیدا نشد.',invalid_result:'نتیجه معتبر نیست.',result_conflict:'رتبه تکراری است یا نتیجهٔ جایزه‌دار قابل تغییر نیست.',participant_missing_or_awarded:'شرکت‌کننده پیدا نشد یا نتیجهٔ جایزه‌دار قابل تغییر نیست.',invalid_award:'اطلاعات جایزه معتبر نیست.',award_exists_or_ineligible:'جایزه قبلاً ثبت شده یا برنده واجد شرایط نیست.',service_disabled:'سرویس باشگاه هنوز فعال نیست.',internal_error:'سرویس موقتاً در دسترس نیست.'};
const text=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=String(value);if(className)el.className=className;return el};
const empty=(id,message)=>{const el=$(id);el.replaceChildren(text('p',message));return el};
const notice=(message,error=false)=>{const el=$('notice');el.textContent=message;el.classList.toggle('error',error)};
const show=(id,value)=>{$(id).hidden=!value};
const formatTime=value=>value?new Date(value).toLocaleString('fa-IR'):'—';
const number=value=>Number(value||0).toLocaleString('fa-IR');
const duration=seconds=>{const minutes=Math.floor(Number(seconds||0)/60);return minutes<60?`${number(minutes)} دقیقه`:`${number(Math.floor(minutes/60))} ساعت و ${number(minutes%60)} دقیقه`};
const statusLabel={pending:'منتظر بررسی',approved:'در صف پخش',rejected:'رد شده',cancelled:'لغو شده',played:'پخش شده'};
const kindLabel={attendance:'امتیاز حضور',request_spend:'هزینهٔ درخواست',refund:'بازگشت امتیاز',admin_adjustment:'تغییر مدیر'};
const transactionLabel=item=>item.source_type==='competition_prize'?'جایزهٔ مسابقه':item.source_type==='manual'?'تغییر دستی مدیر':kindLabel[item.kind]||item.kind;
errors.invalid_consent='تنظیم اجازهٔ نمایش نام معتبر نیست.';errors.result_not_found='نتیجه‌ای برای حساب شما پیدا نشد.';
const formatTransaction=item=>`${transactionLabel(item)} · ${item.delta>0?'+':''}${number(item.delta)} · ${item.note||'بدون یادداشت'} · ${formatTime(item.created_at_ms)}`;
async function api(path,{method='GET',data,key}={}){
 const headers={};if(data!==undefined)headers['content-type']='application/json';if(key)headers['Idempotency-Key']=key;
 const res=await fetch(state.api+path,{method,credentials:'include',headers,body:data===undefined?undefined:JSON.stringify(data)});
 let result={};try{result=await res.json()}catch{}if(!res.ok)throw Error(errors[result.error]||`خطای سرویس (${res.status})`);return result;
}
const competitionUi=mountCompetitionUi({api,notice,onChange:()=>refresh()});
const clubLinks=document.querySelectorAll('.club-mobile-nav a,.club-nav a');
const contestsLinks=document.querySelectorAll('[data-admin-competition-link],.club-nav a[href="#competitions"]');
function syncClubNavigation(hash=location.hash){
 const admin=state.user?.role==='admin';
 const contests=admin?'#competition-admin':'#competitions';
 contestsLinks.forEach(link=>{link.href=contests});
 const section=hash||(admin?contests:'#overview');
 const adminView=admin&&/^#competition-(admin|.*-form)$/.test(section);
 document.body.dataset.view=adminView?'admin-competitions':'dashboard';
 $('club-header-subtitle').textContent=adminView?'مدیریت مسابقه‌ها':'باشگاه شنوندگان';
 for(const link of clubLinks){
  if(link.hash===(adminView?contests:section))link.setAttribute('aria-current','true');
  else link.removeAttribute('aria-current');
 }
}
document.addEventListener('click',event=>{
 const link=event.target.closest('a[href^="#"]');
 if(!link)return;
 syncClubNavigation(link.hash);
 $('club-menu').open=false;
});
addEventListener('hashchange',()=>syncClubNavigation());
async function attendanceIndicator(){
 try{const health=await api('/health');show('attendance-indicator',!!state.user&&health.attendanceObserverEnabled===false)}
 catch{show('attendance-indicator',false)}
}
async function initialize(){
 const register=$('auth-form').querySelector('[value=register]');register.hidden=true;register.disabled=true;
 try{const config=await fetch('./request-config.json',{cache:'no-store'}).then(r=>r.json());if(config.clubEnabled!==true)throw Error();const base=new URL(config.apiBase);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error();state.api=base.origin;await refresh()}catch{notice('سامانهٔ باشگاه هنوز برای استفاده فعال نشده است.',true);show('auth',false);show('account',false);$('search').disabled=true;$('catalog-form').querySelector('button').disabled=true;empty('catalog','فهرست در دسترس نیست.');empty('queue','صف در دسترس نیست.');empty('leaders','جدول در دسترس نیست.')}
}
async function refresh(){
 try{state.user=(await api('/api/me')).user}catch{state.user=null}
 if(!state.user)$('recovery-code').textContent='';
 show('auth',!state.user);show('account',!!state.user);show('my-data',!!state.user);show('dashboard',!!state.user);show('points-summary',!!state.user);show('admin',state.user?.role==='admin');show('admin-activity',state.user?.role==='admin');show('competition-admin',state.user?.role==='admin');
 document.body.toggleAttribute('data-member',!!state.user);
 $('welcome-name').textContent=state.user?.displayName||(state.user?'خوش آمدید':'شنوندهٔ عزیز');
 $('member-handle').textContent=state.user?`@${state.user.username}`:'';
 $('account-status').textContent=state.user?'حساب فعال':'برای دیدن امتیاز و درخواست‌ها وارد شوید.';
 show('member-handle',!!state.user);show('member-settings',!!state.user);show('competition-spotlight',!!state.user);
 show('club-menu-admin',state.user?.role==='admin');syncClubNavigation();
 if(state.user){$('account-summary').textContent=`${state.user.username} — موجودی: ${state.user.balance} امتیاز`;$('ranking-opt-in').checked=state.user.leaderboardOptIn;await Promise.allSettled([myData(),dashboardData(),adminData(),adminActivity(),identityStatus(),competitionUi.refreshMine(),attendanceIndicator()])}else{state.activeSongIds.clear();$('my-competition-results').replaceChildren();show('attendance-indicator',false)}
 await Promise.allSettled([catalog(),queue(),leaders(),competitionUi.refreshPublic()]);
 if(state.user){await queuePositions();if(state.user.role==='admin')await Promise.allSettled([identityUsers(),competitionUi.refreshAdmin()])}
}
async function dashboardData(){if(!state.user)return;try{const {dashboard}=await api('/api/me/dashboard');$('stat-balance').textContent=number(dashboard.balance);$('stat-attendance').textContent=duration(dashboard.verifiedSeconds);$('stat-pending').textContent=number(dashboard.pending);$('stat-approved').textContent=number(dashboard.approved);$('stat-earned').textContent=number(dashboard.earned);$('stat-spent').textContent=number(dashboard.spent);$('my-rank').textContent=dashboard.rank===null?'برای نمایش رتبه، گزینهٔ جدول امتیازها را فعال کنید.':`رتبهٔ ${number(dashboard.rank)}`;}catch{for(const id of ['stat-balance','stat-attendance','stat-pending','stat-approved','stat-earned','stat-spent','my-rank'])$(id).textContent='در دسترس نیست'}}
async function adminActivity(){if(state.user?.role!=='admin')return;try{const [events,transactions,health]=await Promise.all([api('/api/admin/events'),api('/api/admin/transactions'),api('/health')]);$('system-status').textContent=`سرویس ${health.featuresEnabled?'فعال':'غیرفعال'} · ثبت‌نام عمومی ${health.registrationEnabled?'فعال':'بسته'} · مشاهدهٔ حضور ${health.attendanceObserverEnabled?'فعال':'غیرفعال'}`;const e=$('admin-events');e.replaceChildren();if(!events.events.length)empty('admin-events','رویدادی ثبت نشده است.');for(const item of events.events)e.append(text('div',`${item.action} · ${item.actor} · ${formatTime(item.created_at_ms)}`));const t=$('admin-transactions');t.replaceChildren();if(!transactions.transactions.length)empty('admin-transactions','گردشی ثبت نشده است.');for(const item of transactions.transactions)t.append(text('div',item.username+' · '+formatTransaction(item)+(item.actor?' · مدیر: '+item.actor:'')))}catch{$('system-status').textContent='وضعیت سرویس در دسترس نیست.';empty('admin-events','رویدادها در دسترس نیستند.');empty('admin-transactions','گردش امتیاز در دسترس نیست.')}}
async function queuePositions(){try{const [mine,publicQueue]=await Promise.all([api('/api/me/requests'),api('/api/queue')]);const positions=new Map(publicQueue.queue.map((item,index)=>[item.id,index+1]));const rows=$('my-requests').querySelectorAll(':scope > div');mine.requests.forEach((item,index)=>{const position=positions.get(item.id);if(position&&rows[index])rows[index].append(text('span',`جایگاه در صف: ${position}`,'meta'))})}catch{}}
async function identityUsers(){try{const data=await api('/api/admin/users'),select=$('identity-user');select.replaceChildren();for(const user of data.users){const option=document.createElement('option');option.value=user.id;option.textContent=user.username;select.append(option)}}catch{}}
async function identityStatus(){try{const data=await api('/api/me/clubhouse-identity');$('identity-status').textContent=data.linked?`شناسهٔ Clubhouse متصل: ${data.clubhouseUserId}`:'شناسهٔ Clubhouse هنوز متصل نیست.';show('identity-unlink',data.linked)}catch{$('identity-status').textContent='وضعیت اتصال در دسترس نیست.';show('identity-unlink',false)}}
async function catalog(){const q=$('search').value.trim();try{const {songs}=await api('/api/catalog?q='+encodeURIComponent(q));const host=$('catalog');host.replaceChildren();if(!songs.length)return empty('catalog','آهنگی یافت نشد.');for(const song of songs){const row=document.createElement('div');const art=text('span','♫','song-art');art.setAttribute('aria-hidden','true');row.append(art,text('strong',song.title),text('span',song.artist,'meta'),text('span',`${number(song.cost)} امتیاز · کسر هنگام تأیید`,'meta'));const active=state.activeSongIds.has(song.id),low=state.user&&state.user.balance<song.cost;const button=text('button',active?'درخواست فعال دارید':low?'امتیاز کافی نیست':'درخواست آهنگ');button.type='button';button.disabled=!state.user||active||low;button.addEventListener('click',async()=>{button.disabled=true;try{await api('/api/requests',{method:'POST',data:{catalogSongId:song.id},key:crypto.randomUUID()});notice('درخواست ثبت شد و منتظر بررسی مدیر است.');await refresh()}catch(e){notice(e.message,true);await myData();await catalog()}});row.append(button);host.append(row)}}catch{empty('catalog','فهرست در دسترس نیست.')}}
async function queue(){try{const {queue}=await api('/api/queue');const host=$('queue');host.replaceChildren();if(!queue.length)return empty('queue','صف فعلاً خالی است.');for(const [index,item] of queue.entries())host.append(text('li',`${index+1}. ${item.title} — ${item.artist}`))}catch{empty('queue','صف در دسترس نیست.')}}
async function leaders(){try{const {leaders}=await api('/api/leaderboard');const host=$('leaders');host.replaceChildren();if(!leaders.length)return empty('leaders','هنوز کسی نمایش عمومی امتیاز را فعال نکرده است.');for(const [index,item] of leaders.entries())host.append(text('li',`رتبهٔ ${number(index+1)} · ${item.name} · ${number(item.points)} امتیاز`))}catch{empty('leaders','جدول در دسترس نیست.')}}
async function myData(){if(!state.user)return;try{const [requests,attendance,transactions]=await Promise.all([api('/api/me/requests'),api('/api/me/attendance'),api('/api/me/transactions')]);state.activeSongIds=new Set(requests.requests.filter(item=>['pending','approved'].includes(item.status)&&item.catalog_song_id).map(item=>item.catalog_song_id));const r=$('my-requests');r.replaceChildren();if(!requests.requests.length)empty('my-requests','درخواستی ثبت نشده است.');for(const item of requests.requests){const row=document.createElement('div');row.append(text('strong',`${item.title} — ${item.artist}`),text('span',`${statusLabel[item.status]||item.status} · ${number(item.cost)} امتیاز · ${formatTime(item.created_at)}`,'meta'));if(['pending','approved'].includes(item.status)){const button=text('button','لغو درخواست');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await api(`/api/me/requests/${item.id}`,{method:'PATCH',data:{}});notice('درخواست لغو شد.');await refresh()}catch(e){notice(e.message,true);button.disabled=false}});row.append(button)}r.append(row)}const a=$('attendance');a.replaceChildren();if(!attendance.sessions.length)empty('attendance','حضور تأییدشده‌ای ثبت نشده است.');for(const item of attendance.sessions)a.append(text('div',`${item.room_id} · ${formatTime(item.start_ms)} · ${duration(item.credited_seconds)}`));const t=$('transactions');t.replaceChildren();if(!transactions.transactions.length)empty('transactions','گردش امتیازی وجود ندارد.');for(const item of transactions.transactions)t.append(text('div',formatTransaction(item)));renderRecentActivity(requests.requests,transactions.transactions)}catch(e){notice(e.message,true)}}
function renderRecentActivity(requests,transactions){
 const host=$('recent-activity');
 host.replaceChildren();
 const activity=[
  ...transactions.slice(0,5).map(item=>({when:item.created_at_ms,title:transactionLabel(item),delta:item.delta,icon:item.source_type==='competition_prize'?'trophy':'coins'})),
  ...requests.slice(0,5).map(item=>({when:Date.parse(item.created_at),title:item.title,caption:statusLabel[item.status]||item.status,icon:'queue'}))
 ].filter(item=>Number.isFinite(Number(item.when))).sort((a,b)=>b.when-a.when).slice(0,4);
 if(!activity.length){empty('recent-activity','هنوز فعالیتی ثبت نشده است.');return}
 for(const item of activity){
  const row=text('div','','recent-item'),glyph=text('span','','club-icon icon-'+item.icon),copy=text('div','');
  glyph.setAttribute('aria-hidden','true');
  copy.append(text('strong',item.title),text('time',formatTime(item.when)));
  row.append(glyph,copy);
  const badge=item.delta===undefined?item.caption:`${item.delta>0?'+':''}${number(item.delta)} امتیاز`;
  if(badge)row.append(text('span',badge,'recent-badge'));
  host.append(row);
 }
}
async function adminData(){
 if(state.user?.role!=='admin')return;
 try{
  const [pending,approved,users]=await Promise.all([api('/api/admin/requests?status=pending'),api('/api/admin/requests?status=approved'),api('/api/admin/users')]);
  for(const [id,rows] of [['pending',pending.requests],['approved',approved.requests]]){
   const host=$(id);host.replaceChildren();if(!rows.length)empty(id,'موردی وجود ندارد.');
   for(const item of rows){
    const row=document.createElement('div');row.append(text('strong',item.title+' — '+item.artist),text('span',item.requested_by+' | '+item.cost+' امتیاز','meta'));
    for(const action of id==='pending'?['approved','rejected']:['played','rejected']){
     const button=text('button',({approved:'تأیید و کسر امتیاز',rejected:'رد',played:'پخش شد'})[action]);button.type='button';
     button.addEventListener('click',async()=>{button.disabled=true;try{await api('/api/admin/requests/'+item.id,{method:'PATCH',data:{status:action}});notice('وضعیت ثبت شد.');await refresh()}catch(error){notice(error.message,true);button.disabled=false}});row.append(button);
    }
    if(id==='approved'){
     const priority=text('button','اولویت +۱');priority.type='button';priority.addEventListener('click',async()=>{priority.disabled=true;try{await api('/api/admin/requests/'+item.id,{method:'PATCH',data:{queuePriority:Math.min(100,item.queue_priority+1)}});await refresh()}catch(error){notice(error.message,true);priority.disabled=false}});row.append(priority);
    }
    host.append(row);
   }
  }
  const host=$('users');host.replaceChildren();
  for(const user of users.users){
   const row=document.createElement('div');row.append(text('strong',user.username+' | '+number(user.balance)+' امتیاز'));
   const form=document.createElement('form'),delta=document.createElement('input'),reason=document.createElement('input'),button=text('button','ثبت تغییر');
   delta.type='number';delta.placeholder='تغییر امتیاز';delta.min='-1000';delta.max='1000';delta.required=true;delta.setAttribute('aria-label','تغییر امتیاز');
   reason.placeholder='دلیل تغییر';reason.required=true;reason.maxLength=300;reason.setAttribute('aria-label','دلیل تغییر');
   button.type='submit';form.append(delta,reason,button);
   let retryKey=crypto.randomUUID();form.addEventListener('input',()=>{retryKey=crypto.randomUUID()});
   form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;try{const result=await api('/api/admin/users/'+user.id+'/adjust-points',{method:'POST',key:retryKey,data:{delta:Number(delta.value),note:reason.value}});notice(result.duplicate?'این تغییر قبلاً ثبت شده است.':'تغییر امتیاز ثبت شد.');await refresh()}catch(error){notice(error.message,true);button.disabled=false}});
   row.append(form);host.append(row);
  }
 }catch(error){notice(error.message,true)}
}
$('auth-form').addEventListener('submit',async e=>{e.preventDefault();const submit=e.submitter?.value||'login',form=e.currentTarget;try{const b={username:form.elements.namedItem('username').value,password:form.elements.namedItem('password').value};await api(`/api/auth/${submit}`,{method:'POST',data:b});if(submit==='register')await api('/api/auth/login',{method:'POST',data:b});form.reset();notice('');await refresh()}catch(err){notice(err.message,true)}});
$('recover-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;try{await api('/api/auth/recover',{method:'POST',data:{username:form.elements.namedItem('username').value,recoveryCode:form.elements.namedItem('recoveryCode').value,newPassword:form.elements.namedItem('newPassword').value}});form.reset();notice('گذرواژه تغییر کرد. اکنون وارد شوید.')}catch(err){notice(err.message,true)}});
$('recovery-code-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;try{const {recoveryCode}=await api('/api/me/recovery-code',{method:'POST',data:{currentPassword:form.elements.namedItem('currentPassword').value}});form.reset();$('recovery-code').textContent=recoveryCode;notice('کد بازیابی ساخته شد. آن را در جای امن ذخیره کنید.')}catch(err){notice(err.message,true)}});
$('password-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;try{await api('/api/me/password',{method:'POST',data:{currentPassword:form.elements.namedItem('currentPassword').value,newPassword:form.elements.namedItem('newPassword').value}});form.reset();state.user=null;await refresh();notice('گذرواژه تغییر کرد؛ همهٔ نشست‌ها بسته شدند.')}catch(err){notice(err.message,true)}});
$('logout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',data:{}});state.user=null;await refresh();notice('خارج شدید.')}catch(e){notice(e.message,true)}});
$('ranking-opt-in').addEventListener('change',async e=>{try{await api('/api/me',{method:'PATCH',data:{leaderboardOptIn:e.target.checked}});notice('تنظیم نمایش امتیاز ذخیره شد.');await refresh()}catch(err){notice(err.message,true)}});
let searchTimer;$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(catalog,250)});
$('catalog-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,x=name=>f.elements.namedItem(name);try{await api('/api/admin/catalog',{method:'POST',data:{title:x('title').value,artist:x('artist').value,sourceUrl:x('sourceUrl').value,rightsNote:x('rightsNote').value,cost:Number(x('cost').value),rightsConfirmed:x('rightsConfirmed').checked,playableConfirmed:x('playableConfirmed').checked}});f.reset();notice('آهنگ به فهرست اضافه شد.');await catalog()}catch(err){notice(err.message,true)}});
$('identity-form').addEventListener('submit',async e=>{e.preventDefault();try{await api(`/api/admin/users/${$('identity-user').value}/clubhouse-identity`,{method:'PUT',data:{clubhouseUserId:$('identity-clubhouse').value.trim(),consentConfirmed:$('identity-consent').checked}});$('identity-form').reset();notice('اتصال شناسه ثبت شد.')}catch(err){notice(err.message,true)}});
$('identity-unlink').addEventListener('click',async()=>{try{await api('/api/me/clubhouse-identity',{method:'DELETE'});notice('اتصال شناسه قطع شد؛ حضور جدید دیگر ثبت نمی‌شود.');await identityStatus()}catch(err){notice(err.message,true)}});
initialize();
