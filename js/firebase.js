import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "discursos-147ba.firebaseapp.com",
  projectId: "discursos-147ba",
  storageBucket: "discursos-147ba.appspot.com",
  messagingSenderId: "778635238055",
  appId: "1:778635238055:web:100e08b496f0b6d6c35982"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);