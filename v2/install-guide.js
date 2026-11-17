/* iOS + Android radio installation guide: progressive image zoom, no new dependencies. */
(() => {
  'use strict';
  const dialog=document.getElementById('installImageDialog');
  const image=document.getElementById('installDialogImage');
  const title=document.getElementById('installDialogTitle');
  const close=document.getElementById('installDialogClose');
  if(!dialog||!image||!title||!close)return;
  const allowed=/^\.\.\/assets\/(?:ios|android)-install-[1-4]\.svg$/;
  let previousFocus=null;
  document.querySelectorAll('button.install-preview').forEach(button=>{
    button.addEventListener('click',()=>{
      const src=button.dataset.installImage||'';
      if(!allowed.test(src))return;
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
