# Arreglos de Discursos (v2) — Villa Fiad / Santa Rosa

Sistema web simple y profesional para:
- Login y registro con Firebase Auth (Email/Password)
- Roles (lector / admin / superadmin)
- Personas (base)
- Catálogos de Discursos y Canciones (para autocompletar títulos)
- Asignaciones por reunión (sábado/domingo), con microfonistas x2 y acomodadores x2
- Invitaciones (mensaje listo para WhatsApp)
- Exportar / Imprimir (PDF vía impresión, y CSV para Excel)

## 1) Configuración (OBLIGATORIO)
1. Abrí `js/firebase-config.js`
2. Reemplazá los valores `REEMPLAZAR` por tu configuración del SDK
3. En Firebase Console → Authentication → habilitá **Email/Password**

## 2) Publicar en GitHub Pages
- Settings → Pages → Branch `main` → `/ (root)`

## 3) Roles
- Por defecto los usuarios quedan como `lector`
- Whitelist por email en `js/firebase-config.js`:
  - SUPERADMINS: `marceyyesi@gmail.com`
  - ADMINS: `edurivaddek@gmail.com`
- También podés cambiar roles desde **Ajustes** (si sos admin)

## 4) Recomendación de orden
1. Cargar Personas
2. Cargar Catálogos (Discursos y Canciones)
3. Cargar Asignaciones
4. Generar Invitaciones y Exportar

## 5) Seguridad (FireStore Rules)
Ver `docs/firestore.rules.txt`.
