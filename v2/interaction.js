/* Radio Ava o Nava: tactile neon, pointer spotlight, scroll reveals and restored utilities. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const finePointer=window.matchMedia('(hover: hover) and (pointer: fine)');
 const surfaces='.live-panel,.up-next,.schedule-card,.music-card,.recording-card,.recording-player,.community-card,.install-platform-detail,.install-step-card,.about-section,.hero-feature,.hero-cover,.utility-button,.btn,.main-play,.rec-play,.icon-button,.small-btn,.music-play,.favorite-button,.header-cta,.dock-button,.menu-button,.mobile-tab,.header-share,.mobile-station-intro';
 const tactile='.utility-button,.btn,.main-play,.rec-play,.icon-button,.small-btn,.music-play,.favorite-button,.dock-button,.menu-button,.mobile-tab,.header-share,.mobile-station-intro,.schedule-card,.music-card,.recording-card,.community-card,.install-step-card,.install-platform-detail';
 const visibleTimeout=new WeakMap(),timers=new WeakMap();
 const activePointers=new Map();
 let pendingPointer=null,frame=0,observer=null;
 function setSpotlight(target,x,y) {
   if(!target)return;
   const b=target.getBoundingClientRect();
   if(!b.width||!b.height)return;
   target.style.setProperty('--glow-x',Math.max(0,Math.min(100,(x-b.left)/b.width*100)).toFixed(1)+'%');
   target.style.setProperty('--glow-y',Math.max(0,Math.min(100,(y-b.top)/b.height*100)).toFixed(1)+'%');
 }
 function animatePointer(){
   frame=0;
   const p=pendingPointer;
   if(!p)return;
   if(p.pointerType==='mouse'&&finePointer.matches&&!reduceMotion.matches){
     document.body.style.setProperty('--cursor-x',p.x+'px');
     document.body.style.setProperty('--cursor-y',p.y+'px');
     document.body.style.setProperty('--cursor-halo-opacity','1');
   }
   const target=p.target?.closest?.(surfaces);
   if(target)setSpotlight(target,p.x,p.y);
 }
 document.addEventListener('pointermove',event=>{
   if(reduceMotion.matches)return;
   if(event.pointerType!=='mouse'&&!activePointers.has(event.pointerId))return;
   pendingPointer={x:event.clientX,y:event.clientY,target:event.target,pointerType:event.pointerType};
   if(!frame)frame=requestAnimationFrame(animatePointer);
 },{passive:true});
 document.addEventListener('pointerdown',event=>{
   const surface=event.target.closest?.(tactile);
   if(!surface)return;
   const previous=timers.get(surface);if(previous)clearTimeout(previous);
   surface.classList.add('touch-glow');setSpotlight(surface,event.clientX,event.clientY);
   activePointers.set(event.pointerId,surface);
 },{passive:true});
 function releasePointer(e){
   const surface=activePointers.get(e.pointerId);activePointers.delete(e.pointerId);
   if(!surface)return;
   const previous=timers.get(surface);if(previous)clearTimeout(previous);
   const timeout=setTimeout(()=>{surface.classList.remove('touch-glow');timers.delete(surface)},e.pointerType==='touch'?880:350);
   timers.set(surface,timeout);
   if(e.pointerType==='touch')document.body.style.setProperty('--cursor-halo-opacity','0');
 }
 document.addEventListener('pointerup',releasePointer,{passive:true});
 document.addEventListener('pointercancel',releasePointer,{passive:true});
 document.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')document.body.style.setProperty('--cursor-halo-opacity','0')},{passive:true});
 window.addEventListener('blur',()=>{document.body.style.setProperty('--cursor-halo-opacity','0');activePointers.clear()});
 document.addEventListener('keydown',event=>{
   if(event.key==='Escape'){
     const nav=$('navigation'),menu=$('menuButton');
     if(nav?.classList.contains('open')){nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');menu?.focus();}
   }
 });
 document.addEventListener('click',event=>{
   const nav=$('navigation'),menu=$('menuButton');
   if(nav?.classList.contains('open')&&!nav.contains(event.target)&&!menu?.contains(event.target)){nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');}
 });
 for(const [i,n] of [...document.querySelectorAll('.sound-lines i')].entries())n.style.setProperty('--i',i);
 function installReveals(){
   if(reduceMotion.matches||!('IntersectionObserver' in window))return;
   document.body.classList.add('motion-ready');
   observer=new IntersectionObserver(entries=>{
     for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}
   },{rootMargin:'0px 0px -20px 0px',threshold:.08});
   const nodes=['.hero-copy','.hero-visual','.live-panel','.up-next','.section-heading','.schedule-card','.music-card','.recording-card','.recording-player','.community-card','.install-platform-detail','.about-section'];
   const add=(root=document)=>{
     for(const node of root.querySelectorAll(nodes.join(','))){
       if(node.classList.contains('reveal-item'))continue;
       node.classList.add('reveal-item');observer.observe(node);
     }
   };
   add();
   const observeChanges=new MutationObserver(changes=>{
     for(const c of changes){if(c.addedNodes.length)for(const n of c.addedNodes)if(n.nodeType===1){if(n.matches?.(nodes.join(','))){n.classList.add('reveal-item');observer.observe(n);}add(n);}}
   });
   for(const id of ['musicGrid','recordingGrid','scheduleGrid']){const el=$(id);if(el)observeChanges.observe(el,{childList:true});}
   reduceMotion.addEventListener('change',()=>{
     if(reduceMotion.matches){document.body.classList.remove('motion-ready');observer?.disconnect();observeChanges.disconnect();}
   },{once:true});
 }
 installReveals();
 // On large screens show both guides; on phones keep Android folded by default.
 if(window.matchMedia('(min-width:701px)').matches)document.querySelectorAll('.install-platform-detail').forEach(panel=>{panel.open=true;});
 function tell(message){const msg=$('liveMessage');if(msg)msg.textContent=message;}
 const official='https://radio.ibboabdoli.com/';
 const copyBtn=$('liveCopy');
 if(copyBtn)copyBtn.addEventListener('click',async()=>{
   try{await navigator.clipboard.writeText(official);tell('آدرس رادیو کپی شد.');}
   catch{try{window.prompt('لینک رادیو را کپی کن:',official)}catch{tell('برای کپی آدرس از نوار مرورگر استفاده کن.');}}
 });
 const share=$('liveShare');
 if(share)share.addEventListener('click',async()=>{
   if(navigator.share){
     try{await navigator.share({title:'رادیو آوا و نوا',text:'موسیقی، شعر، آواز و دکلمه',url:official});return;}
     catch(e){if(e?.name==='AbortError')return;}
   }
   try{await navigator.clipboard.writeText(official);tell('لینک رادیو برای اشتراک‌گذاری کپی شد.');}
   catch{window.open('https://t.me/share/url?url='+encodeURIComponent(official),'_blank','noopener,noreferrer');}
 });
 const fullscreen=$('liveFullscreen'),panel=$('listen')?.querySelector('.live-panel');
 if(fullscreen&&panel)fullscreen.addEventListener('click',async()=>{
   try{
     if(document.fullscreenElement){await document.exitFullscreen();return;}
     if(panel.requestFullscreen){await panel.requestFullscreen();return;}
     tell('حالت تمام‌صفحه در این مرورگر پشتیبانی نمی‌شود.');
   }catch{tell('مرورگر اجازه نمایش تمام‌صفحه نداد.');}
 });
})();
