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
