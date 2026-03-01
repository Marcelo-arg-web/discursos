// =======================================
// DOCUMENTO PRESIDENTE
// =======================================

import { db } from "./firebase-config.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Contenedor donde se renderiza el documento
const contenedor = document.getElementById("documentoPresidente");

// =======================================
// FORMATEAR FECHA
// =======================================

function formatearFecha(fechaISO) {
  if (!fechaISO) return "";
  const fecha = new Date(fechaISO + "T00:00:00");
  return fecha.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

// =======================================
// GENERAR DOCUMENTO
// =======================================

function generarDocumento(datos) {
  const presidente = datos.presidenteNombre || "";
  const orador = datos.oradorPublico || "";
  const congregacion = datos.congregacionVisitante || "";
  const tema = datos.temaDiscurso || "";
  const proximaSemana = datos.discursoProximaSemana || "";
  const conductor = datos.conductorAtalaya || "";
  const lector = datos.lectorAtalaya || "";
  const cancion = datos.cancion || "";

  return `
    <div class="doc-presi">

      <h2>Asignación Presidente</h2>
      <p class="subtitulo">Congregación Villa Fiad</p>
      <p class="fecha">${formatearFecha(datos.fecha)}</p>

      <hr>

      <p><strong>Presidente:</strong> ${presidente}</p>
      <p><strong>Canción:</strong> ${cancion}</p>
      <p><strong>Oración inicial:</strong> ${presidente}</p>

      <br>

      <p><strong>Orador público:</strong> ${orador}</p>
      <p><strong>Congregación:</strong> ${congregacion}</p>
      <p><strong>Tema del discurso:</strong> ${tema}</p>

      <br>

      <p><strong>Título próxima semana:</strong> ${proximaSemana}</p>

      <br>

      <p><strong>Conductor La Atalaya:</strong> ${conductor}</p>
      <p><strong>Lector La Atalaya:</strong> ${lector}</p>

    </div>
  `;
}

// =======================================
// CARGAR DATOS
// =======================================

export async function cargarDocumentoPresidente(idAsignacion) {
  try {
    const ref = doc(db, "asignaciones", idAsignacion);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      contenedor.innerHTML = "<p>No se encontró la asignación.</p>";
      return;
    }

    const datos = snap.data();

    contenedor.innerHTML = generarDocumento(datos);

    // Título del documento (para sugerir nombre PDF)
    document.title = `Asignacion_Presidente_${datos.fecha}_${datos.presidenteNombre}`;

  } catch (error) {
    console.error("Error cargando documento:", error);
    contenedor.innerHTML = "<p>Error cargando datos.</p>";
  }
}