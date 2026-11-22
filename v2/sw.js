/* Ava o Nava v2: cache only the static shell; NEVER cache audio or third-party embeds. */
const CACHE='ava-v2-static-36';
const SHELL=['./','./index.html','./studio.html','./radio-preview.css','./radio-preview.js','./gallery/player-tar.jpg','./site.css?v=25','./studio.css?v=6','./expanded-player.css?v=3','./expanded-player.js?v=4','./gallery/recording-1.webp','./gallery/recording-2.webp','./gallery/recording-3.webp','./gallery/recording-4.webp','./gallery/recording-5.webp','./gallery/genre-traditional.webp','./gallery/genre-pop.webp','./gallery/genre-jazz.webp','./gallery/genre-instrumental.webp','./gallery/genre-electronic.webp','./studio.js?v=4','./app.js?v=16','./interaction.js?v=7','./install-guide.js?v=7','./mobile-premium.js?v=5','./audius-catalog.json','./audius.js?v=8','./shows.json','./manifest.webmanifest','../radio-neon-logo.webp','./icon.svg'];
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
