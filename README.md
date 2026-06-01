# Arreglos Discursos · Villa Fiad (GitHub Pages + Firebase)

Este paquete es un sitio **estático** (HTML/CSS/JS) listo para **GitHub Pages** y **Firebase (Auth + Firestore)**.

## 1) Configurar Firebase
1. Firebase Console → Authentication → Sign-in method → habilitar **Email/Password**
2. Authentication → Settings → Authorized domains → agregar:
   - `localhost`
   - `tu-proyecto.web.app` (si usás hosting)
   - `marcelo-arg-web.github.io` (GitHub Pages)
3. Firestore → Reglas → pegar el archivo `firestore.rules`

## 2) Pegar tu configuración del SDK
Editar: `js/firebase-config.js` y pegar tu config (apiKey, authDomain, projectId, etc).

## 3) Estructura de datos
- `/usuarios/{uid}` → `activo: true/false`, `rol: viewer/editor/admin/superadmin`, `nombre`, `email`
- `/personas` → hermanos con roles (microfonista, audio, etc.)
- `/asignaciones` → semanas con roles
- `/visitas` → discursantes visitantes / salidas

## 4) Flujo recomendado
1. Entrás como superadmin (tu usuario debe existir en `/usuarios/{tuUid}` con `activo=true` y `rol=superadmin`).
2. Cargás personas.
3. Cargás asignaciones semanales.
4. Vas a **Imprimir** y sacás el tablero mensual.

## 5) Importar Asignaciones.xlsx
Página: `importar.html` (solo para rol `editor` o superior).
Usa SheetJS (CDN) y mapeo rápido por nombre de columnas.

---

Generado: 2026-02-27


## Nota
Los scripts de páginas están en `js/pages/`.


## Build 63
Corrección de menú para usuarios comunes: Resultados + Mi perfil visibles y carga inmediata del mes.


## Build 70
Corrección fuerte para usuario común congelado en Resultados/Mi perfil, cierre de sesión real y limpieza de caché.

## Build 70
Corrección de usuario común: Resultados y Mi perfil sin bloqueo, Firebase SDK estable y reglas Firestore actualizadas. Ver LEER_IMPORTANTE_BUILD68_USUARIO_RESULTADOS_PERFIL.txt.


## Build 73
- Menú reorganizado: visible Asignaciones, Visitantes, Salientes y Resultados.
- PDF e impresión agrupados en un solo lugar.
- Usuario común limitado a Resultados/Mi perfil; admin mantiene acceso completo.
- Sugerencias reforzadas para no repetir asignados en la semana ni en el mes si hay candidatos disponibles.
- Respeta las funciones/tildes cargadas en Funciones.

## Build 74
- Corrección puntual: se asegura la opción **Visita del viajante** en Tipo de semana.
- En semana de visita, el discurso público queda a cargo del viajante.
- Si ya había visitante externo o saliente cargado previamente, se muestra alerta como en Asamblea.
- Cache actualizado a b74 para GitHub Pages.


## Build 75
- Configuración: se agregó la página Administración > Configuración con el campo “Nombre del viajante”.
- En semanas de “Visita del viajante”, Asignaciones carga automáticamente el nombre configurado como orador público.
- Se corrigió el menú lateral: al abrir “Carga y roles”, “PDF e impresión” o “Administración”, ahora se ven los enlaces internos.
- Se agregó regla Firestore para `configuracion/general`.
- Cache actualizado a b75 para GitHub/Firebase Hosting.


## Build 76 - título siguiente y oraciones
- Se corrigió autocompletado de título de la semana siguiente en Asignaciones.
- Se restauró/reforzó regla de oración final Visitante/Presidente y botón Sugerir.


## Build 77 - reglas de presidente exclusivo y rotación por función

Cambios puntuales sobre build 76:

- En Asignaciones, el presidente queda reservado solo para presidir: no se lo sugiere ni se permite guardarlo también en oración inicial, conductor, lector, multimedia, plataforma, acomodadores o microfonistas.
- La oración final automática Visitante/Presidente se conserva como regla existente y no se toca.
- Las demás personas sí pueden hacer oración y también participar en funciones de apoyo, siempre que no sean el presidente.
- La rotación mensual ahora evita repetir la misma función/grupo, no cualquier asignación general:
  - quien fue acomodador no se sugiere otra vez como acomodador en el mes si hay alternativa, pero sí puede ser microfonista o multimedia en otra semana;
  - quien fue multimedia no se sugiere otra vez como multimedia en el mes si hay alternativa, pero sí puede ser microfonista o acomodador en otra semana;
  - quien fue microfonista no se sugiere otra vez como microfonista en el mes si hay alternativa.
- Se ajustaron los avisos para que informen repetición de la misma función, no repetición global de cualquier asignación.

Archivos modificados: asignaciones.html, js/pages/asignaciones.js, js/no-sw-cleanup-b77.js, sw.js, README.md y este changelog.


## Build 78 - Sugerir oraciones y rotación por antigüedad

Corrección puntual sobre build 77: los botones Sugerir ahora avanzan por candidatos ordenados por antigüedad, evitan repetir la misma función en el mes si hay alternativas, y Oración inicial ya no queda en blanco cuando los tildes cargados dejan sin candidatos disponibles. Se mantiene presidente exclusivo.

Archivos modificados: asignaciones.html, js/pages/asignaciones.js, js/no-sw-cleanup-b78.js, sw.js, README.md y CAMBIOS_discursos78_sugerir_oraciones_rotacion.txt.


## Build 79 - Ver contraseña en acceso
Cambio puntual sobre build 78:
- Se agregó botón **Ver/Ocultar** en el campo contraseña del acceso normal.
- Se agregó el mismo botón en el acceso de consulta pública.
- Sirve para revisar la contraseña que el navegador completó automáticamente o la que el usuario escribió.
- La app no guarda contraseñas propias ni cambia Firebase Auth.

Archivos modificados: index.html, public-login.html, js/index.js, js/pages/public-login.js, css/styles.css, js/no-sw-cleanup-b79.js, sw.js, README.md y CAMBIOS_discursos79_ver_password_login.txt.
