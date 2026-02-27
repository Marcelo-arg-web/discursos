// asignaciones.js
// Requiere: firebase-config.js que exporte { db, auth }
// Requiere: colección "personas" con campos { nombre: string, roles: array, activo: boolean }
// Guarda en: colección "asignacionesSemanales" docId = semana (YYYY-MM-DD)

// ✅ FIX: como este archivo está en js/pages, firebase-config está en ../
import { db } from "../firebase-config.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ---------- Helpers UI ----------
const $ = (id) => document.getElementById(id);

const statusBox = $("status");
function setStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.background = isError ? "#fff1f2" : "#f8fafc";
  statusBox.style.borderColor = isError ? "#fecdd3" : "#e5e7eb";
  statusBox.style.color = isError ? "#9f1239" : "#111827";
}

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clearSelect(sel) {
  sel.innerHTML = "";
}

function addOption(sel, value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  sel.appendChild(opt);
}

// ---------- Data loading ----------
let personas = []; // {id, nombre, roles[], activo}
let personasByNameLower = new Map();

async function cargarPersonas() {
  // Solo activos (si tu campo activo existe). Si no existe, igualmente trae todo.
  // Para no romperte nada, hacemos un intento con filtro, y si falla, sin filtro.
  try {
    const q = query(collection(db, "personas"), where("activo", "==", true));
    const snap = await getDocs(q);
    personas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p?.nombre);
  } catch (e) {
    // Si no existe índice o campo activo, cargamos sin filtro
    const snap = await getDocs(collection(db, "personas"));
    personas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p?.nombre);
  }

  // Orden alfabético por nombre
  personas.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  personasByNameLower = new Map();
  for (const p of personas) {
    personasByNameLower.set(String(p.nombre).toLowerCase(), p);
  }
}

function poblarSelectsConPersonas() {
  const selectsIds = [
    "presidente",
    "oracionInicial",
    "oradorPublico",
    "conductorAtalaya",
    "lectorAtalaya",
    "multimedia1",
    "multimedia2",
    "acomodadorPlataforma",
    "acomodadorEntrada",
    "acomodadorAuditorio",
    "microfonista1",
    "microfonista2",
    "oracionFinal"
  ];

  for (const id of selectsIds) {
    const sel = $(id);
    clearSelect(sel);

    addOption(sel, "", "— Seleccionar —");
    for (const p of personas) {
      addOption(sel, p.nombre, p.nombre);
    }
  }
}

// ---------- Form <-> Object ----------
function getFormData() {
  return {
    presidente: $("presidente").value || "",
    cancionNumero: $("cancionNumero").value?.trim() || "",
    oracionInicial: $("oracionInicial").value || "",
    oradorPublico: $("oradorPublico").value || "",
    congregacionVisitante: $("congregacionVisitante").value?.trim() || "",
    tituloDiscurso: $("tituloDiscurso").value?.trim() || "",
    tituloSiguienteSemana: $("tituloSiguienteSemana").value?.trim() || "",

    conductorAtalaya: $("conductorAtalaya").value || "",
    lectorAtalaya: $("lectorAtalaya").value || "",

    multimedia1: $("multimedia1").value || "",
    multimedia2: $("multimedia2").value || "",

    acomodadorPlataforma: $("acomodadorPlataforma").value || "",
    acomodadorEntrada: $("acomodadorEntrada").value || "",
    acomodadorAuditorio: $("acomodadorAuditorio").value || "",

    microfonista1: $("microfonista1").value || "",
    microfonista2: $("microfonista2").value || "",

    oracionFinal: $("oracionFinal").value || ""
  };
}

function setFormData(data = {}) {
  $("presidente").value = data.presidente || "";
  $("cancionNumero").value = data.cancionNumero || "";
  $("oracionInicial").value = data.oracionInicial || "";
  $("oradorPublico").value = data.oradorPublico || "";
  $("congregacionVisitante").value = data.congregacionVisitante || "";
  $("tituloDiscurso").value = data.tituloDiscurso || "";
  $("tituloSiguienteSemana").value = data.tituloSiguienteSemana || "";

  $("conductorAtalaya").value = data.conductorAtalaya || "";
  $("lectorAtalaya").value = data.lectorAtalaya || "";

  $("multimedia1").value = data.multimedia1 || "";
  $("multimedia2").value = data.multimedia2 || "";

  $("acomodadorPlataforma").value = data.acomodadorPlataforma || "";
  $("acomodadorEntrada").value = data.acomodadorEntrada || "";
  $("acomodadorAuditorio").value = data.acomodadorAuditorio || "";

  $("microfonista1").value = data.microfonista1 || "";
  $("microfonista2").value = data.microfonista2 || "";

  $("oracionFinal").value = data.oracionFinal || "";
}

function limpiarFormulario() {
  setFormData({});
  setStatus("Formulario limpio.");
}

// ---------- Conductor suggestion ----------
function hasRole(p, role) {
  const roles = Array.isArray(p?.roles) ? p.roles : [];
  return roles.map(r => String(r).toLowerCase()).includes(String(role).toLowerCase());
}

function sugerirConductorAtalaya() {
  // Orden:
  // 1) Marcelo Palavecino
  // 2) Leonardo Araya
  // 3) cualquier anciano
  // 4) Marcelo Rodríguez
  // 5) Eduardo Rivadeneira

  const preferidos = [
    "Marcelo Palavecino",
    "Leonardo Araya",
    "Marcelo Rodríguez",
    "Eduardo Rivadeneira"
  ];

  // 1 y 2 directos
  for (const nombre of preferidos.slice(0, 2)) {
    if (personasByNameLower.has(nombre.toLowerCase())) {
      $("conductorAtalaya").value = nombre;
      setStatus(`Sugerencia aplicada: Conductor Atalaya → ${nombre}`);
      return;
    }
  }

  // 3 cualquier anciano
  const anciano = personas.find(p => hasRole(p, "anciano"));
  if (anciano) {
    $("conductorAtalaya").value = anciano.nombre;
    setStatus(`Sugerencia aplicada: Conductor Atalaya → ${anciano.nombre} (anciano disponible)`);
    return;
  }

  // 4 y 5 fallback
  for (const nombre of preferidos.slice(2)) {
    if (personasByNameLower.has(nombre.toLowerCase())) {
      $("conductorAtalaya").value = nombre;
      setStatus(`Sugerencia aplicada: Conductor Atalaya → ${nombre}`);
      return;
    }
  }

  setStatus("No pude sugerir conductor: no encontré los nombres ni ancianos en Personas.", true);
}

// ---------- Firestore persistence ----------
function getSemanaId() {
  const semana = $("semana").value;
  return (semana && semana.trim()) ? semana.trim() : "";
}

async function cargarAsignaciones() {
  const semanaId = getSemanaId();
  if (!semanaId) {
    setStatus("Elegí una fecha en 'Semana' para cargar.", true);
    return;
  }

  const ref = doc(db, "asignacionesSemanales", semanaId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    limpiarFormulario();
    setStatus(`No hay datos guardados para ${semanaId}. Podés cargarlos y guardar.`);
    return;
  }

  const data = snap.data() || {};
  // Guardamos dentro de "asignaciones" (si existe) para no mezclar.
  const asign = data.asignaciones || data; // compatibilidad si antes guardabas plano
  setFormData(asign);
  setStatus(`Datos cargados para ${semanaId}.`);
}

async function guardarAsignaciones() {
  const semanaId = getSemanaId();
  if (!semanaId) {
    setStatus("Elegí una fecha en 'Semana' para guardar.", true);
    return;
  }

  const asignaciones = getFormData();

  // Validación mínima (podés sacar esto si querés)
  if (!asignaciones.presidente) {
    setStatus("Falta Presidente.", true);
    return;
  }

  const ref = doc(db, "asignacionesSemanales", semanaId);

  // setDoc con merge = true: agrega/actualiza sin borrar otros campos del documento
  await setDoc(
    ref,
    {
      semana: semanaId,
      updatedAt: serverTimestamp(),
      asignaciones
    },
    { merge: true }
  );

  setStatus(`Guardado OK para ${semanaId}.`);
}

// ---------- Oración final helpers ----------
function usarOradorComoOracionFinal() {
  const orador = $("oradorPublico").value || "";
  if (!orador) {
    setStatus("Primero elegí el Orador público.", true);
    return;
  }
  $("oracionFinal").value = orador;
  setStatus(`Oración final asignada a: ${orador}`);
}

function usarPresidenteComoOracionFinal() {
  const pres = $("presidente").value || "";
  if (!pres) {
    setStatus("Primero elegí el Presidente.", true);
    return;
  }
  $("oracionFinal").value = pres;
  setStatus(`Oración final asignada a: ${pres}`);
}

// ---------- Init ----------
async function init() {
  try {
    $("semana").value = isoToday();

    setStatus("Cargando personas...");
    await cargarPersonas();
    poblarSelectsConPersonas();
    setStatus(`Personas cargadas: ${personas.length}. Elegí semana y cargá o guardá.`);
  } catch (e) {
    console.error(e);
    setStatus("Error cargando personas. Revisá consola (F12) y permisos de Firestore.", true);
  }

  $("btnCargar").addEventListener("click", () => cargarAsignaciones());
  $("btnGuardar").addEventListener("click", () => guardarAsignaciones());
  $("btnLimpiar").addEventListener("click", () => limpiarFormulario());

  $("btnSugerirConductor").addEventListener("click", () => sugerirConductorAtalaya());
  $("btnOracionFinalOrador").addEventListener("click", () => usarOradorComoOracionFinal());
  $("btnOracionFinalPresidente").addEventListener("click", () => usarPresidenteComoOracionFinal());
}

init();