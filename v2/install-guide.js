/* iOS + Android radio installation guide: progressive image zoom, no new dependencies. */
(() => {
  'use strict';
  const dialog=document.getElementById('installImageDialog');
  const image=document.getElementById('installDialogImage');
  const title=document.getElementById('installDialogTitle');
  const close=document.getElementById('installDialogClose');
  if(!dialog||!image||!title||!close)return;
  const allowed=/^\.\.\/assets\/(?:ios|android)-install-[1-4]\.svg$/;
  // Load one real screenshot only after its slide becomes visible.
  // No multi-megabyte base64 bundle and no duplicated image downloads.
  const slideImage=(platform,index)=>{
    if(!['ios','android'].includes(platform)||!Number.isInteger(index)||index<0||index>3)return null;
    const path='../assets/'+platform+'-install-'+(index+1)+'.svg';
    return allowed.test(path)?path:null;
  };
  // One slide at a time for both iPhone and Android. Keep buttons keyboard-
  // accessible; swipes only advance on clearly horizontal movement.
  document.querySelectorAll('[data-install-slider]').forEach(slider=>{
    const track=slider.querySelector('.install-step-grid');
    const cards=[...track.querySelectorAll('.install-step-card')];
    const previous=slider.querySelector('.install-prev');
    const next=slider.querySelector('.install-next');
    const count=slider.querySelector('.install-slider-status');
    const dots=[...slider.querySelectorAll('.install-slider-dot')];
    if(cards.length!==4||dots.length!==cards.length||!previous||!next||!count)return;
    let current=0;
    const persianNumber=n=>new Intl.NumberFormat('fa-IR').format(n);
    const show=index=>{
      current=Math.max(0,Math.min(cards.length-1,index));
      cards.forEach((card,i)=>{
        const active=i===current;
        card.hidden=!active;
        card.setAttribute('aria-hidden',String(!active));
        if(active){
          const picture=card.querySelector('.install-preview img');
          const src=slideImage(platform,i);
          if(picture&&src&&picture.getAttribute('src')!==src){
            picture.src=src;picture.loading='eager';picture.decoding='async';
          }
        }
      });
      previous.disabled=current===0;
      next.disabled=current===cards.length-1;
      count.textContent='مرحله '+persianNumber(current+1)+' از '+persianNumber(cards.length);
      dots.forEach((dot,i)=>{
        const selected=i===current;
        dot.classList.toggle('active',selected);
        dot.setAttribute('aria-current',selected?'step':'false');
        dot.setAttribute('aria-pressed',String(selected));
      });
    };
    previous.addEventListener('click',()=>show(current-1));
    next.addEventListener('click',()=>show(current+1));
    dots.forEach((dot,i)=>dot.addEventListener('click',()=>show(i)));
    let start=null;
    track.addEventListener('touchstart',event=>{
      if(event.touches.length!==1){start=null;return;}
      const t=event.touches[0];start={x:t.clientX,y:t.clientY};
    },{passive:true});
    track.addEventListener('touchend',event=>{
      if(!start||!event.changedTouches.length)return;
      const t=event.changedTouches[0];
      const dx=t.clientX-start.x,dy=t.clientY-start.y;
      start=null;
      if(Math.abs(dx)<44||Math.abs(dx)<Math.abs(dy)*1.25)return;
      show(current+(dx<0?1:-1));
    },{passive:true});
    track.addEventListener('touchcancel',()=>{start=null;},{passive:true});
    slider.addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
        if(event.target.matches('input,textarea,select'))return;
        event.preventDefault();
        show(current+(event.key==='ArrowLeft'?1:-1));
      }
    });
    show(0);
    slider.classList.add('is-ready');
  });

  let previousFocus=null;
  document.querySelectorAll('button.install-preview').forEach(button=>{
    button.addEventListener('click',()=>{
      const platform=button.dataset.installPlatform;
      const index=Number(button.dataset.installStep);
      const known=button.dataset.installImage||'';
      const src=(platform==='ios'||platform==='android')&&Number.isInteger(index)
        ?slideImage(platform,index):known;
      if(!src||!allowed.test(src))return;
      previousFocus=button;
      title.textContent=button.dataset.installLabel||'راهنمای تصویری نصب';
      image.alt=title.textContent;
      image.src=src;
      if(typeof dialog.showModal==='function')dialog.showModal();
      else{dialog.setAttribute('open','');dialog.setAttribute('aria-modal','true');}
      close.focus();
    });
  });
  function closePreview(){
    if(typeof dialog.close==='function'&&dialog.open)dialog.close();
    else dialog.removeAttribute('open');
    previousFocus?.focus();
  }
  close.addEventListener('click',closePreview);
  dialog.addEventListener('click',event=>{
    if(event.target===dialog)closePreview();
  });
  dialog.addEventListener('close',()=>previousFocus?.focus());
})();
