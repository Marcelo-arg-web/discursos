// build 70 - Service Worker desactivado para evitar bucles de recarga/cache en GitHub Pages.
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    try{
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }catch(e){}
    try{ await self.registration.unregister(); }catch(e){}
    try{ await self.clients.claim(); }catch(e){}
  })());
});
self.addEventListener('fetch', event => { /* sin cache: red normal */ });
