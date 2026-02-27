// js/firebase-config.js
// Configuración pública de Firebase (segura para GitHub Pages)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDARHGnQMk3ZU1H48n2pfJ_FhusAkl0kfk",
  authDomain: "discursos-147ba.firebaseapp.com",
  projectId: "discursos-147ba",
  storageBucket: "discursos-147ba.firebasestorage.app",
  messagingSenderId: "778635238055",
  appId: "1:778635238055:web:100e08b496f0b6d6c35982"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
