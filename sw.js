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

// Network-first para HTML/JS/CSS - build 61 (siempre traer lo último).
// Para imágenes y otros assets: cache-first (opcional).
const ASSET_CACHE = "assets-v61-perfil-resultados-pdf";

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

// build 43: formulario de inicio profesional y textos limpios

// build 43: tablero mensual agrega Plataforma junto a Microfonistas

// build 43: modo resultados para usuarios no admin

// build 43: página Funciones agrega Audio\/Video para filtrar sugerencias de multimedia.

// build 43: Funciones agrega columna Activo y encabezado fijo para ver Presidente/Oración/etc al bajar.

// build 43: reset de clave desde Usuarios, perfil de discursante y PDF para enviar a otras congregaciones.

// build 43: recuperación de clave más clara, enlace nuevo y página restablecer-clave.html.

// build 43: usuarios comunes solo ven Resultados; próximas salidas filtra salientes locales de Villa Fiad.

// build 43: perfil agrega consulta de bosquejo, título automático y canciones elegidas.

// build 43: Documentos/PDF unificado con selector y menos páginas repetidas en el menú.

// build 44: perfil simplificado; número de bosquejo compacto, título más largo y sin canciones/listas extra.

// build 58: modo Preparar semana, usuarios limitados a Resultados y salientes filtrados solo a locales Villa Fiad.
// build 58: Mi perfil agrega alta, edición y eliminación de bosquejos desde el catálogo admin.

// build 58: revisión estética general, tarjetas, formularios, tablas, navegación y modo móvil.

// build 58: perfiles con aprobación para salir, solo local y PDF de discursantes filtrado por ancianos/siervos ministeriales aprobados.

// build 58: vista previa de documentos sin menú interno y estilo profesional unificado.

// build 58: usuarios comunes acceden a Mi perfil; admin puede cambiar o limpiar perfiles de discursante.

// build 58: Usuarios lee todos los perfiles de Firestore sin orderBy(nombre), permite eliminar perfil y borrar registro como superadmin.

// build 58: Personas queda fusionado dentro de Funciones; permite agregar, editar, eliminar, activar/desactivar y marcar funciones desde una sola página. Menú sin solapa Personas y ajuste PWA/Android.


// build 58: usuarios permite vincular perfiles faltantes de Authentication por UID y email.

// build 58: bordes más visibles en recuadros, formularios, tablas y tarjetas para monitores con poco contraste.

// build 58: vincular usuario existente ahora verifica creación en /usuarios/{UID} y muestra diagnóstico claro.

// build 58: vista previa de documentos optimizada para Android con desplazamiento táctil vertical y horizontal.

// build 58: reglas Firestore con rescate de superadmin por email y diagnóstico de permisos en Usuarios.
// build 61: en Android los botones Sugerir de asignaciones quedan compactos para ver mejor el nombre.

// build 61: usuarios tienen Mi perfil para cargar datos y bosquejos; Resultados muestra primero la vista previa; PDF externo solo aprobados para salir con bosquejos.
