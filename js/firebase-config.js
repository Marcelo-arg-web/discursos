// js/firebase-config.js
// Pegá acá tu configuración real de Firebase (NO compartas tus claves privadas).
// Este archivo se importa desde varios módulos.
//
// IMPORTANTE: Este archivo es público en GitHub Pages. No pongas secretos.
// apiKey, authDomain y projectId son públicos por diseño.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

export const firebaseConfig = {
  // ✅ Reemplazá estos valores por los de tu Firebase Console → Project settings → Your apps → SDK setup and configuration
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_STORAGE_BUCKET",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
