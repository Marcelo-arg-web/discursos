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

// Network-first para HTML/JS/CSS - build 41 (siempre traer lo último).
// Para imágenes y otros assets: cache-first (opcional).
const ASSET_CACHE = "assets-v41-resultados-usuarios-salientes";

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

// build 41: formulario de inicio profesional y textos limpios

// build 41: tablero mensual agrega Plataforma junto a Microfonistas

// build 41: modo resultados para usuarios no admin

// build 41: página Funciones agrega Audio\/Video para filtrar sugerencias de multimedia.

// build 41: Funciones agrega columna Activo y encabezado fijo para ver Presidente/Oración/etc al bajar.

// build 41: reset de clave desde Usuarios, perfil de discursante y PDF para enviar a otras congregaciones.

// build 41: recuperación de clave más clara, enlace nuevo y página restablecer-clave.html.

// build 41: usuarios comunes solo ven Resultados; próximas salidas filtra salientes locales de Villa Fiad.
