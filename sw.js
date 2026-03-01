// sw.js - Actualización automática (GitHub Pages cache busting)
self.addEventListener("install", (event) => {
  // Activar la nueva versión lo antes posible
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Network-first para HTML/JS/CSS (siempre traer lo último).
// Para imágenes y otros assets: cache-first (opcional).
const ASSET_CACHE = "assets-v1";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejar mismo origen (tu sitio)
  if (url.origin !== self.location.origin) return;

  const dest = req.destination; // 'document','script','style','image','font', etc.

  // Siempre traé lo último para documentos/scripts/estilos
  if (dest === "document" || dest === "script" || dest === "style") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        return fresh;
      } catch (e) {
        // Fallback: intentar cache si no hay red
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // Assets (imágenes, íconos, fuentes): cache-first con actualización en segundo plano
  if (dest === "image" || dest === "font" || dest === "manifest") {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // actualizar en bg
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok) await cache.put(req, fresh.clone());
          } catch {}
        })());
        return cached;
      }
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    })());
    return;
  }

  // Default: passthrough
});
