import { db } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tabla = document.getElementById("tabla");
const mesInput = document.getElementById("mes");

document.getElementById("btnCargar").onclick = cargar;

async function cargar() {
  const mes = mesInput.value; // formato YYYY-MM
  if (!mes) return;

  tabla.innerHTML = "";

  const snapshot = await getDocs(collection(db, "asignaciones"));

  let docs = [];

  snapshot.forEach(doc => {
    if (doc.id.startsWith(mes)) {
      docs.push({ id: doc.id, ...doc.data() });
    }
  });

  docs.sort((a, b) => a.id.localeCompare(b.id));

  docs.forEach(d => {
    const fila = `
      <tr>
        <td>${d.id}</td>
        <td>${d.acomodadorPlataforma || "—"}</td>
        <td>${d.acomodadorEntrada || "—"}</td>
        <td>${d.acomodadorAuditorio || "—"}</td>
      </tr>
    `;
    tabla.innerHTML += fila;
  });
}