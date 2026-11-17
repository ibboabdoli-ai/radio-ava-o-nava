/* Radio Ava o Nava — native-feeling mobile navigation and share control. */
(() => {
 'use strict';
 const nav=document.getElementById('mobileBottomNav');
 const share=document.getElementById('headerShare');
 if(!nav)return;
 const tabs=[...nav.querySelectorAll('a[data-mobile-tab]')];
 const pageUrl='https://radio.ibboabdoli.com/';
 const siteTitle='رادیو آوا و نوا';
 const setActive=id=>{
   for(const a of tabs){
     const current=a.dataset.mobileTab===id;
     a.classList.toggle('active',current);
     if(current)a.setAttribute('aria-current','page');
     else a.removeAttribute('aria-current');
   }
 };
 tabs.forEach(a=>a.addEventListener('click',()=>{
   setActive(a.dataset.mobileTab);
   const menu=document.getElementById('navigation'),toggle=document.getElementById('menuButton');
   menu?.classList.remove('open');
   toggle?.setAttribute('aria-expanded','false');
 }));
 if('IntersectionObserver' in window){
   const targetIds=tabs.map(a=>a.dataset.mobileTab);
   const sections=targetIds.map(id=>document.getElementById(id)).filter(Boolean);
   const observer=new IntersectionObserver(entries=>{
     const matches=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);
     if(matches.length)setActive(matches[0].target.id);
   },{rootMargin:'-20% 0px -55% 0px',threshold:[0,.15,.4]});
   sections.forEach(section=>observer.observe(section));
 }
 const showCopied=()=>{
   const toast=document.getElementById('toast');if(!toast)return;
   toast.textContent='لینک اصلی رادیو کپی شد.';
   toast.hidden=false;
   window.setTimeout(()=>{if(toast.textContent==='لینک اصلی رادیو کپی شد.')toast.hidden=true},2600);
 };
 if(share)share.addEventListener('click',async()=>{
   if(navigator.share){
     try{await navigator.share({title:siteTitle,url:pageUrl});return;}catch(error){if(error?.name==='AbortError')return;}
   }
   try{await navigator.clipboard.writeText(pageUrl);showCopied();}
   catch{const link=document.createElement('a');link.href='https://t.me/share/url?url='+encodeURIComponent(pageUrl)+'&text='+encodeURIComponent(siteTitle);link.target='_blank';link.rel='noopener noreferrer';link.click();}
 });
 // The bottom player is intentionally hidden until a station, song or replay is selected.
 const dock=document.getElementById('playerDock');
 const connectDock=()=>{
   if(!dock)return;
   if(dock.getAttribute('data-observer-active'))return;
   dock.setAttribute('data-observer-active','1');
 };
 connectDock();
})();
