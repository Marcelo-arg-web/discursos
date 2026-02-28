const CACHE_NAME = "villa-fiad-asignaciones-v1";
const CORE_ASSETS = [
  "./",
  "./asignaciones.html",
  "./visitantes.html",
  "./panel.html",
  "./doc-presi.html",
  "./estadisticas.html",
  "./salientes.html",
  "./personas.html",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./js/pages/asignaciones.js",
  "./js/data/canciones.js",
  "./js/data/bosquejos.js",
  "./js/data/visitantes.js"
  // Nota: NO cacheamos firebase-config.js para no tocarlo; igual el navegador lo va a pedir online.
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // cache dynamic same-origin
          const url = new URL(req.url);
          if (url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // fallback básico: si falla, devolvemos la página principal si existe en cache
          return caches.match("./asignaciones.html",
  "./visitantes.html",
  "./panel.html",
  "./doc-presi.html",
  "./estadisticas.html",
  "./salientes.html",
  "./personas.html",
  "./index.html");
        });
    })
  );
});