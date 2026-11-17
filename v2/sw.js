/* Ava o Nava v2: cache only the static shell; NEVER cache audio or third-party embeds. */
const CACHE='ava-v2-static-5';
const SHELL=['./','./index.html','./site.css?v=3','./polish.css?v=3','./mobile.css?v=4','./app.js?v=5','./interaction.js?v=5','./mobile-premium.css?v=5','./mobile-premium.js?v=5','./catalog.json','./shows.json','./manifest.webmanifest','../radio-neon-logo.webp','./icon.svg','../assets/ios-install-1.svg','../assets/ios-install-2.svg','../assets/ios-install-3.svg','../assets/ios-install-4.svg','../assets/android-install-1.svg','../assets/android-install-2.svg','../assets/android-install-3.svg','../assets/android-install-4.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(SHELL.map(url=>cache.add(url)))));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ava-v2-static-')&&k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  const url=new URL(req.url);
  if(!url.pathname.includes('/v2/')&&!url.pathname.endsWith('/radio-neon-logo.webp'))return;
  event.respondWith(fetch(req).then(res=>{
    if(res.ok&&res.type==='basic'){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}
    return res;
  }).catch(async()=>{const cached=await caches.match(req);if(cached)return cached;if(req.mode==='navigate')return caches.match('./index.html');return Response.error();}));
});
