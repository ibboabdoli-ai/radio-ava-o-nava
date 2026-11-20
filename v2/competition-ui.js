// Competition registration stays in the approved public form. This UI only
// displays D1 records and lets an administrator verify account linkage.
export function mountCompetitionUi({api,notice,onChange}){
 const $=id=>document.getElementById(id);
 const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=String(value);return el};
 const field=(form,name)=>form.elements.namedItem(name);
 const rules=value=>value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 let competitions=[],users=[];
 function options(select,rows,value,label){
  const selected=select.value;select.replaceChildren();
  for(const row of rows){const option=document.createElement('option');option.value=row[value];option.textContent=row[label];select.append(option)}
  if(rows.some(row=>row[value]===selected))select.value=selected;
 }
 async function refreshPublic(){
  const host=$('competition-public-list');host.replaceChildren();
  try{
   const data=await api('/api/competitions');
   if(!data.competitions.length){host.append(text('p','مسابقهٔ منتشرشده‌ای وجود ندارد.'));return}
   for(const competition of data.competitions){
    const row=document.createElement('div');row.append(text('h3',competition.title),text('p',competition.description));
    if(competition.rules.length){const list=document.createElement('ul');for(const rule of competition.rules)list.append(text('li',rule));row.append(list)}
    const link=text('a','مسیر ثبت‌نام تأییدشده');link.href='../competition.html';row.append(link);
    const heading=text('h4','نتیجه‌های تأییدشده');row.append(heading);
    if(!competition.results.length)row.append(text('p','هنوز نتیجه‌ای برای نمایش تأیید نشده است.'));
    else{const list=document.createElement('ol');for(const result of competition.results)list.append(text('li',`${result.placement===null?'—':result.placement+'. '} ${result.displayName} · ${result.result_text}`));row.append(list)}
    host.append(row);
   }
  }catch{host.append(text('p','مسابقه‌ها فعلاً در دسترس نیستند.'))}
 }
 async function refreshMine(){
  const host=$('my-competition-results');host.replaceChildren();
  try{
   const data=await api('/api/me/competition-results');
   if(!data.results.length){host.append(text('p','هنوز نتیجه‌ای برای حساب شما ثبت نشده است.'));return}
   for(const result of data.results){
    const row=document.createElement('div');row.append(text('strong',result.title),text('p',result.result_text));
    row.append(text('span',result.awarded_points?`${result.awarded_points} امتیاز جایزه`:'جایزه‌ای ثبت نشده است.'));
    const button=text('button',result.public_name_consent?'لغو نمایش نام من':'اجازهٔ نمایش نام من');button.type='button';button.className='secondary';
    button.addEventListener('click',async()=>{button.disabled=true;try{await api(`/api/me/competitions/${result.competition_id}/consent`,{method:'PATCH',data:{publicNameConsent:!result.public_name_consent}});notice(result.public_name_consent?'اجازهٔ نمایش نام لغو شد.':'اجازهٔ نمایش نام ثبت شد.');await onChange()}catch(error){notice(error.message,true);button.disabled=false}});
    row.append(button);host.append(row);
   }
  }catch{host.append(text('p','نتیجه‌های شما فعلاً در دسترس نیستند.'))}
 }
 function fillEdit(){
  const form=$('competition-edit-form'),item=competitions.find(x=>x.id===field(form,'competitionId').value);if(!item)return;
  field(form,'title').value=item.title;field(form,'description').value=item.description;field(form,'rules').value=item.rules.join('\n');field(form,'status').value=item.status;field(form,'resultsPublic').checked=!!item.results_public;
 }
 function updateParticipants(){
  const result=$('competition-result-form'),award=$('competition-award-form');
  const selected=competitions.find(x=>x.id===field(result,'competitionId').value);
  options(field(result,'userId'),selected?.participants||[],'user_id','username');
  const awardCompetition=competitions.find(x=>x.id===field(award,'competitionId').value);
  options(field(award,'userId'),(awardCompetition?.results||[]).filter(x=>x.is_winner&&!x.awarded_points),'user_id','username');
 }
 async function refreshAdmin(){
  const host=$('competition-admin-list');host.replaceChildren();
  try{
   const [data,accounts]=await Promise.all([api('/api/admin/competitions'),api('/api/admin/users')]);
   competitions=data.competitions;users=accounts.users;
   for(const id of ['competition-edit-form','competition-participant-form','competition-result-form','competition-award-form'])options(field($(id),'competitionId'),competitions,'id','title');
   options(field($('competition-participant-form'),'userId'),users,'id','username');fillEdit();updateParticipants();
   if(!competitions.length){host.append(text('p','هنوز مسابقه‌ای ساخته نشده است.'));return}
   for(const c of competitions){
    const row=document.createElement('div');row.append(text('strong',`${c.title} · ${c.status}`),text('p',`${c.participants.length} حساب تأییدشده در سامانه · ${c.results.length} نتیجهٔ ثبت‌شده`));
    for(const r of c.results)row.append(text('p',`${r.username} · ${r.is_winner?'برنده':'شرکت‌کننده'} · ${r.awarded_points?`${r.awarded_points} امتیاز جایزه`:'بدون جایزه'} · ${r.public_approved&&r.public_name_consent?'قابل نمایش':'خصوصی'}`));
    host.append(row);
   }
  }catch{host.append(text('p','مدیریت مسابقه‌ها فعلاً در دسترس نیست.'))}
 }
 async function submit(form,action,success){
  const button=form.querySelector('button[type=submit]'),key=form.dataset.retryKey||crypto.randomUUID();form.dataset.retryKey=key;button.disabled=true;
  try{await action(key);delete form.dataset.retryKey;notice(success);await onChange()}
  catch(error){notice(error.message,true)}finally{button.disabled=false}
 }
 for(const id of ['competition-create-form','competition-edit-form','competition-participant-form','competition-result-form','competition-award-form'])$(id).addEventListener('input',event=>{if(event.target.name!=='competitionId')delete event.currentTarget.dataset.retryKey});
 $('competition-edit-form').addEventListener('change',event=>{if(event.target.name==='competitionId')fillEdit()});
 for(const id of ['competition-result-form','competition-award-form'])$(id).addEventListener('change',event=>{if(event.target.name==='competitionId')updateParticipants()});
 $('competition-create-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;submit(form,()=>api('/api/admin/competitions',{method:'POST',data:{title:field(form,'title').value,description:field(form,'description').value,rules:rules(field(form,'rules').value)}}),'پیش‌نویس مسابقه ساخته شد.')});
 $('competition-edit-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;submit(form,()=>api(`/api/admin/competitions/${field(form,'competitionId').value}`,{method:'PATCH',data:{title:field(form,'title').value,description:field(form,'description').value,rules:rules(field(form,'rules').value),status:field(form,'status').value,resultsPublic:field(form,'resultsPublic').checked}}),'مسابقه ذخیره شد.')});
 $('competition-participant-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;submit(form,()=>api(`/api/admin/competitions/${field(form,'competitionId').value}/participants`,{method:'POST',data:{userId:field(form,'userId').value,verifiedFromApprovedForm:field(form,'verifiedFromApprovedForm').checked}}),'شرکت‌کنندهٔ بررسی‌شده ثبت شد.')});
 $('competition-result-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;submit(form,()=>api(`/api/admin/competitions/${field(form,'competitionId').value}/results`,{method:'POST',data:{userId:field(form,'userId').value,placement:field(form,'placement').value?Number(field(form,'placement').value):null,resultText:field(form,'resultText').value,isWinner:field(form,'isWinner').checked,publicApproved:field(form,'publicApproved').checked}}),'نتیجه ثبت شد.')});
 $('competition-award-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;submit(form,key=>api(`/api/admin/competitions/${field(form,'competitionId').value}/awards`,{method:'POST',key,data:{userId:field(form,'userId').value,points:Number(field(form,'points').value),reason:field(form,'reason').value}}),'جایزه ثبت شد.')});
 return {refreshPublic,refreshAdmin,refreshMine};
}
