// asignaciones.js (Admin)
// NO se modifica firebase-config.js (firebase.js). Solo lo importamos.
// Ubicación esperada: /js/pages/asignaciones.js

import { db, auth } from "../firebase-config.js";
import { canciones } from "../data/canciones.js";
import { bosquejos } from "../data/bosquejos.js";
import { visitantes } from "../data/visitantes.js";

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

import { signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

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

function clearSelect(sel) { sel.innerHTML = ""; }

function addOption(sel, value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  sel.appendChild(opt);
}

function fillDatalist(datalistEl, values) {
  datalistEl.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    datalistEl.appendChild(opt);
  }
}

function normNumero(v) {
  const n = parseInt(String(v || "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// ---------- Catálogos (desde tus archivos JS) ----------
const visitantesMap = new Map(Object.entries(visitantes));

function findVisitanteCerca(fechaISO) {
  // busca exacto; si no, prueba +1 día y -1 día (para cubrir fin de semana)
  const exact = visitantesMap.get(fechaISO);
  if (exact) return exact;
  const d = new Date(fechaISO + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const plus = new Date(d); plus.setDate(plus.getDate() + 1);
  const minus = new Date(d); minus.setDate(minus.getDate() - 1);
  const isoPlus = plus.toISOString().slice(0,10);
  const isoMinus = minus.toISOString().slice(0,10);
  return visitantesMap.get(isoPlus) || visitantesMap.get(isoMinus) || null;
}

function aplicarAutoVisitante() {
  const semanaId = getSemanaId();
  if (!semanaId) return;
  const v = findVisitanteCerca(semanaId);
  if (!v) return;

  // Solo completamos si el campo está vacío (para no pisar lo que editaste)
  if (!($("oradorPublico").value || "").trim()) $("oradorPublico").value = v.nombre || "";
  if (!($("congregacionVisitante").value || "").trim()) $("congregacionVisitante").value = v.congregacion || "";

  const b = v.bosquejo;
  if (!($("discursoNumero").value || "").trim() && b !== undefined && b !== null && String(b).trim() !== "") {
    $("discursoNumero").value = String(b);
  }
  // Título: si está vacío, ponemos el de la planilla; si no, dejamos el que tenga
  if (!($("tituloDiscurso").value || "").trim() && (v.titulo || "").trim()) {
    $("tituloDiscurso").value = v.titulo;
  }

  const c = v.cancion;
  if (!($("cancionNumero").value || "").trim() && c !== undefined && c !== null && String(c).trim() !== "") {
    $("cancionNumero").value = String(c);
    aplicarAutoCancion();
  }
}

const cancionesMap = new Map(Object.entries(canciones).map(([k,v]) => [Number(k), String(v)]));
const discursosMap = new Map(Object.entries(bosquejos).map(([k,v]) => [Number(k), String(v)]));

function aplicarAutoCancion() {
  // En algunas pantallas el input del título puede no existir; no debe romper el guardado.
  const tituloEl = $("cancionTitulo");
  const numEl = $("cancionNumero");
  if (!tituloEl || !numEl) return;

  const num = normNumero(numEl.value);
  if (!num) { tituloEl.value = ""; return; }
  tituloEl.value = cancionesMap.get(num) || "";
}

function aplicarAutoDiscurso() {
  const numEl = $("discursoNumero");
  const tituloEl = $("tituloDiscurso");
  if (!numEl || !tituloEl) return;

  const num = normNumero(numEl.value);
  if (!num) return; // no borro el título por si lo escribió manualmente
  const t = discursosMap.get(num);
  if (t) tituloEl.value = t;
}

// ---------- Data loading ----------
let personas = []; // {id, nombre, roles[], activo}
let personasByNameLower = new Map();

async function cargarPersonas() {
  try {
    const q = query(collection(db, "personas"), where("activo", "==", true));
    const snap = await getDocs(q);
    personas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p?.nombre);
  } catch (e) {
    const snap = await getDocs(collection(db, "personas"));
    personas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p?.nombre);
  }

  personas.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  personasByNameLower = new Map();
  for (const p of personas) personasByNameLower.set(String(p.nombre).toLowerCase(), p);
}


function poblarSelectsConPersonas() {
  // --- Normalización de nombres/roles (SIN tocar Firebase) ---
  const norm = (s) => {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ");
  };

  const roleAliases = {
    "siervo ministerial": "siervoministerial",
    "siervo_ministerial": "siervoministerial",
    "siervoministerial": "siervoministerial",
    "anciano": "anciano",
    "presidente": "presidente",
    "microfonista": "microfonista",
    "microfonistas": "microfonista",
    "multimedia": "multimedia",
    "audio": "multimedia",
    "video": "multimedia",
    "audio y video": "multimedia",
    "audio/video": "multimedia",
    "audiovideo": "multimedia",
    "acomodador": "acomodador",
    "acomodadores": "acomodador",
    "acomodador de plataforma": "acomodadorplataforma",
    "acomodador plataforma": "acomodadorplataforma",
    "acomodadorplataforma": "acomodadorplataforma",
    "acomodador de entrada": "acomodadorentrada",
    "acomodador entrada": "acomodadorentrada",
    "acomodadorentrada": "acomodadorentrada",
    "acomodador de auditorio": "acomodadorauditorio",
    "acomodador auditorio": "acomodadorauditorio",
    "acomodadorauditorio": "acomodadorauditorio",
    "lector de la atalaya": "lectoratalaya",
    "lector atalaya": "lectoratalaya",
    "lectoratalaya": "lectoratalaya",
    "conductor de la atalaya": "conductoratalaya",
    "conductor atalaya": "conductoratalaya",
    "conductoratalaya": "conductoratalaya"
  };

  function getRolesNorm(p) {
    const arr = Array.isArray(p.roles) ? p.roles : [];
    return arr.map(r => roleAliases[norm(r)] || norm(r));
  }

  function hasBase(p) {
    const rs = getRolesNorm(p);
    return rs.includes("anciano") || rs.includes("siervoministerial");
  }

  function isAnciano(p) {
    const rs = getRolesNorm(p);
    return rs.includes("anciano");
  }

  // --- Listas específicas (por NOMBRE) ---
  // Nota: se matchea por nombre normalizado (sin tildes) para evitar problemas.
  // Además, para casos ambiguos (padre/hijo) usamos IDs.
  const LISTA = {
    acomodadores: [
      "Marcelo Rodríguez",
      "Omar Santucho",
      "Epifanio Pedraza",
      "Hugo García",
      "Eduardo Rivadeneira",
      "Marcelo Palavecino",
      "Leonardo Araya",
      "Luis Navarro",
      "Sergio Saldaña",
      "Sergio Lazarte",
      "Roberto Lazarte",
      "Rodolfo Santucho"
    ],
    plataforma: [
      "Brian Torres",
      "Brian Rivadeneira",
      "Martin Zerda",
      "Omar Santucho"
    ],
    multimedia: [
      "Marcelo Rodríguez",
      "Eduardo Rivadeneira",
      "Hugo García",
      "Marcelo Palavecino",
      "Brian Rivadeneira",
      "Isaias Schel",
      "Isaías Schell",
      "Martin Zerda",
      "Roberto Lazarte",
      "Sergio Saldaña"
    ],
    microfonistas: [
      "David Salica",
      "Emanuel Salica",
      "Facundo Reinoso",
      "Maxi Navarro",
      "Eduar Salinas",
      "Misael Salinas",
      "Isaias Schel",
      "Isaías Schell",
      "Roberto Lazarte",
      "Eduardo Rivadeneira",
      "Hugo García",
      "Brian Rivadeneira"
    ]
  };

  const setByName = (arr) => new Set((arr || []).map(n => norm(n)));

  const setAcomodadores = setByName(LISTA.acomodadores);
  const setPlataforma = setByName(LISTA.plataforma);
  const setMultimedia = setByName(LISTA.multimedia);
  const setMicrofonistas = setByName(LISTA.microfonistas);

  // --- IDs especiales (para distinguir personas con mismo nombre) ---
  const IDS = {
    martinPadre: "OIz2KC7o6VwzvjZCqliA",
    martinHijo: "UQqyIWnjmCkHJlnjnKTH",
    isaias: "3mdo5EMtQxj5t5Yqgp84"
  };

  // Microfonistas: incluyen ambos Martin por ID (padre e hijo)
  const microfonistasIds = new Set([IDS.martinPadre, IDS.martinHijo, IDS.isaias]);

  // Plataforma: usar Martin padre por ID (por defecto)
  const plataformaIds = new Set([IDS.martinPadre]);

  // Multimedia: incluir Isaías (acompañante) y Martin padre (acompañante) por ID
  const multimediaIds = new Set([IDS.isaias, IDS.martinPadre]);

  function inSetByNameOrId(p, nameSet, idSet) {
    if (!p) return false;
    if (idSet && idSet.has(p.id)) return true;
    return nameSet && nameSet.has(norm(p.nombre));
  }

  function canAppear(p, fieldId) {
    if (!p?.nombre) return false;

    // Oraciones: sin filtro (cualquier activo)
    if (fieldId === "oracionInicial" || fieldId === "oracionFinal") return true;

    if (fieldId === "presidente") return hasBase(p);

    if (fieldId === "conductorAtalaya") return isAnciano(p);

    if (fieldId === "lectorAtalaya") return hasBase(p);

    if (fieldId === "multimedia1" || fieldId === "multimedia2") {
      return hasBase(p) || inSetByNameOrId(p, setMultimedia, multimediaIds);
    }

    if (fieldId === "microfonista1" || fieldId === "microfonista2") {
      return hasBase(p) || inSetByNameOrId(p, setMicrofonistas, microfonistasIds);
    }

    if (fieldId === "acomodadorEntrada" || fieldId === "acomodadorAuditorio") {
      return hasBase(p) || inSetByNameOrId(p, setAcomodadores, null);
    }

    if (fieldId === "acomodadorPlataforma") {
      // Plataforma (MULTIMEDIA): SOLO lista de plataforma (no incluye acomodadores entrada/auditorio)
      // Nota: No agregamos "base" aquí para evitar que, por ser anciano/siervo,
      // aparezcan personas que no hacen plataforma (ej. Braian Torres solo plataforma).
      return inSetByNameOrId(p, setPlataforma, plataformaIds);
    }

    // default: todo activo
    return true;
  }

  function ensureOption(sel, value) {
    const v = String(value || "").trim();
    if (!v) return;
    const exists = Array.from(sel.options).some(o => o.value === v);
    if (!exists) addOption(sel, v, v);
  }

  const selectsIds = [
    "presidente",
    "oracionInicial",
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
    if (!sel) continue;
    clearSelect(sel);
    addOption(sel, "", "— Seleccionar —");

    const lista = personas.filter(p => canAppear(p, id));
    for (const p of lista) addOption(sel, p.nombre, p.nombre);
  }

  // Guardamos helpers para setFormData (para no perder valores guardados aunque no estén en la lista filtrada)
  window.__ensureOptionAsignaciones = (fieldId, value) => {
    const sel = $(fieldId);
    if (!sel) return;
    ensureOption(sel, value);
  };
}


// ---------- Form <-> Object ----------
function getFormData() {
  // Lectura segura: evita errores si algún campo no existe en el DOM
  const getVal = (id) => {
    const el = $(id);
    return el ? (el.value ?? "") : "";
  };
  const getTrim = (id) => String(getVal(id) || "").trim();

  return {
    presidente: getVal("presidente") || "",

    cancionNumero: getTrim("cancionNumero"),
    cancionTitulo: getTrim("cancionTitulo"),

    oracionInicial: getVal("oracionInicial") || "",
    oradorPublico: getVal("oradorPublico") || "",

    congregacionVisitante: getTrim("congregacionVisitante"),

    discursoNumero: getTrim("discursoNumero"),
    tituloDiscurso: getTrim("tituloDiscurso"),

    tituloSiguienteSemana: getTrim("tituloSiguienteSemana"),

    conductorAtalaya: getVal("conductorAtalaya") || "",
    lectorAtalaya: getVal("lectorAtalaya") || "",

    multimedia1: getVal("multimedia1") || "",
    multimedia2: getVal("multimedia2") || "",

    acomodadorPlataforma: getVal("acomodadorPlataforma") || "",
    acomodadorEntrada: getVal("acomodadorEntrada") || "",
    acomodadorAuditorio: getVal("acomodadorAuditorio") || "",

    microfonista1: getVal("microfonista1") || "",
    microfonista2: getVal("microfonista2") || "",

    oracionFinal: getVal("oracionFinal") || ""
  };
}

function setFormData(data = {}) {
  const setVal = (id, value) => {
    const el = $(id);
    if (el) el.value = value ?? "";
  };

  const ensure = window.__ensureOptionAsignaciones;
  if (typeof ensure === "function") {
    ensure("presidente", data.presidente || "");
    ensure("oracionInicial", data.oracionInicial || "");
    ensure("conductorAtalaya", data.conductorAtalaya || "");
    ensure("lectorAtalaya", data.lectorAtalaya || "");
    ensure("multimedia1", data.multimedia1 || "");
    ensure("multimedia2", data.multimedia2 || "");
    ensure("acomodadorPlataforma", data.acomodadorPlataforma || "");
    ensure("acomodadorEntrada", data.acomodadorEntrada || "");
    ensure("acomodadorAuditorio", data.acomodadorAuditorio || "");
    ensure("microfonista1", data.microfonista1 || "");
    ensure("microfonista2", data.microfonista2 || "");
    ensure("oracionFinal", data.oracionFinal || "");
  }

  setVal("presidente", data.presidente || "");

  setVal("cancionNumero", data.cancionNumero || "");
  setVal("cancionTitulo", data.cancionTitulo || "");

  setVal("oracionInicial", data.oracionInicial || "");
  setVal("oradorPublico", data.oradorPublico || "");

  setVal("congregacionVisitante", data.congregacionVisitante || "");

  setVal("discursoNumero", data.discursoNumero || "");
  setVal("tituloDiscurso", data.tituloDiscurso || "");

  setVal("tituloSiguienteSemana", data.tituloSiguienteSemana || "");

  setVal("conductorAtalaya", data.conductorAtalaya || "");
  setVal("lectorAtalaya", data.lectorAtalaya || "");

  setVal("multimedia1", data.multimedia1 || "");
  setVal("multimedia2", data.multimedia2 || "");

  setVal("acomodadorPlataforma", data.acomodadorPlataforma || "");
  setVal("acomodadorEntrada", data.acomodadorEntrada || "");
  setVal("acomodadorAuditorio", data.acomodadorAuditorio || "");

  setVal("microfonista1", data.microfonista1 || "");
  setVal("microfonista2", data.microfonista2 || "");

  setVal("oracionFinal", data.oracionFinal || "");
}

function limpiarFormulario() {
  setFormData({});
  setStatus("Formulario limpio.");
  aplicarAutoCancion();
  aplicarAutoDiscurso();
  refrescarBotonesOracionFinal();
  aplicarOracionFinalAutomatica(false);
}

// ---------- Conductor suggestion ----------
function hasRole(p, role) {
  const roles = Array.isArray(p?.roles) ? p.roles : [];
  return roles.map(r => String(r).toLowerCase()).includes(String(role).toLowerCase());
}

function sugerirConductorAtalaya() {
  const preferidos = [
    "Marcelo Palavecino",
    "Leonardo Araya",
    "Marcelo Rodríguez",
    "Eduardo Rivadeneira"
  ];

  for (const nombre of preferidos.slice(0, 2)) {
    if (personasByNameLower.has(nombre.toLowerCase())) {
      $("conductorAtalaya").value = nombre;
      setStatus(`Sugerencia aplicada: Conductor Atalaya → ${nombre}`);
      return;
    }
  }

  const anciano = personas.find(p => hasRole(p, "anciano"));
  if (anciano) {
    $("conductorAtalaya").value = anciano.nombre;
    setStatus(`Sugerencia aplicada: Conductor Atalaya → ${anciano.nombre} (anciano disponible)`);
    return;
  }

  for (const nombre of preferidos.slice(2)) {
    if (personasByNameLower.has(nombre.toLowerCase())) {
      $("conductorAtalaya").value = nombre;
      setStatus(`Sugerencia aplicada: Conductor Atalaya → ${nombre}`);
      return;
    }
  }

  setStatus("No pude sugerir conductor: no encontré los nombres ni ancianos en Personas.", true);
}

// ---------- Oración final (auto + botones con nombres) ----------
let oracionFinalFueEditada = false;

function refrescarBotonesOracionFinal() {
  const orador = $("oradorPublico").value || "";
  const pres = $("presidente").value || "";

  $("btnOracionFinalOrador").textContent = orador
    ? `Usar orador público: ${orador}`
    : "Usar orador público";

  $("btnOracionFinalPresidente").textContent = pres
    ? `Usar presidente: ${pres}`
    : "Usar presidente";
}

function sugerirOracionFinal() {
  const orador = $("oradorPublico").value || "";
  const pres = $("presidente").value || "";
  return orador || pres || "";
}

/**
 * Si force=true, reemplaza siempre.
 * Si force=false, solo completa si:
 *  - está vacío, o
 *  - todavía no fue editado manualmente.
 */
function aplicarOracionFinalAutomatica(force = false) {
  const sugerida = sugerirOracionFinal();
  if (!sugerida) return;

  const actual = $("oracionFinal").value || "";
  if (force || !actual || !oracionFinalFueEditada) {
    $("oracionFinal").value = sugerida;
  }
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
  const asign = data.asignaciones || data;
  setFormData(asign);

  // completa datos de visitante si existen en planilla y campos vacíos
  aplicarAutoVisitante();

  // al cargar: si no hay título guardado, lo completamos con catálogo
  aplicarAutoCancion();
  aplicarAutoDiscurso();

  // refrescar botones y sugerencia (sin pisar si ya está guardado)
  refrescarBotonesOracionFinal();
  oracionFinalFueEditada = Boolean((("" + $("oracionFinal").value) || "").trim());
  aplicarOracionFinalAutomatica(false);

  setStatus(`Datos cargados para ${semanaId}.`);
}

async function guardarAsignaciones() {
  const semanaId = getSemanaId();
  if (!semanaId) {
    setStatus("Elegí una fecha en 'Semana' para guardar.", true);
    return;
  }

  // mantener títulos sincronizados antes de guardar
  aplicarAutoCancion();
  aplicarAutoDiscurso();

  const asignaciones = getFormData();

  if (!asignaciones.presidente) {
    setStatus("Falta Presidente.", true);
    return;
  }

  const ref = doc(db, "asignacionesSemanales", semanaId);

  await setDoc(
    ref,
    {
      semana: semanaId,
      updatedAt: serverTimestamp(),
      asignaciones
    },
    { merge: true }
  );

    // Si hay orador visitante, guardamos/actualizamos estadística de visitantes
  const orador = (asignaciones.oradorPublico || "").trim();
  if (orador) {
    const refVis = doc(db, "visitantes", semanaId);
    await setDoc(refVis, {
      fecha: semanaId,
      nombre: orador,
      congregacion: (asignaciones.congregacionVisitante || "").trim(),
      bosquejo: (asignaciones.discursoNumero || "").trim(),
      titulo: (asignaciones.tituloDiscurso || "").trim(),
      cancion: (asignaciones.cancionNumero || "").trim(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  setStatus(`Guardado OK para ${semanaId}.`);
}

// ---------- Botones Oración final ----------
function usarOradorComoOracionFinal() {
  const orador = $("oradorPublico").value || "";
  if (!orador) {
    setStatus("Primero elegí el Orador público.", true);
    return;
  }
  $("oracionFinal").value = orador;
  oracionFinalFueEditada = true;
  setStatus(`Oración final asignada a: ${orador}`);
}

function usarPresidenteComoOracionFinal() {
  const pres = $("presidente").value || "";
  if (!pres) {
    setStatus("Primero elegí el Presidente.", true);
    return;
  }
  $("oracionFinal").value = pres;
  oracionFinalFueEditada = true;
  setStatus(`Oración final asignada a: ${pres}`);
}

// ---------- Logout ----------
async function logout() {
  try { await signOut(auth); } catch (e) {}
  window.location.href = "index.html";
}

// ---------- Init ----------
async function init() {
  try {
    $("semana").value = isoToday();

    setStatus(`Cargando personas... (Canciones: ${cancionesMap.size}, Discursos: ${discursosMap.size})`);
    await cargarPersonas();
    poblarSelectsConPersonas();

    // Datalists
    const dlOradores = document.getElementById("listaOradoresVisitantes");
    const dlOracionFinal = document.getElementById("listaOracionFinal");

    // Lista de visitantes (nombres únicos)
    const oradoresVisit = Array.from(new Set(Object.values(visitantes).map(v => v?.nombre).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"es"));
    fillDatalist(dlOradores, oradoresVisit);

    // Para oración final: mezcla personas + visitantes
    const personasNombres = personas.map(p => p.nombre).filter(Boolean);
    const oracionFinalOpts = Array.from(new Set([...personasNombres, ...oradoresVisit])).sort((a,b)=>a.localeCompare(b,"es"));
    fillDatalist(dlOracionFinal, oracionFinalOpts);


    // autocompletes
    $("cancionNumero").addEventListener("input", () => aplicarAutoCancion());
    $("discursoNumero").addEventListener("input", () => aplicarAutoDiscurso());

    // auto visitante según semana
    $("semana").addEventListener("change", () => {
      aplicarAutoVisitante();
      aplicarAutoCancion();
      aplicarAutoDiscurso();
      refrescarBotonesOracionFinal();
      aplicarOracionFinalAutomatica(false);
    });

    // oración final
    $("oracionFinal").addEventListener("change", () => { oracionFinalFueEditada = true; });

    $("oradorPublico").addEventListener("change", () => {
      refrescarBotonesOracionFinal();
      aplicarOracionFinalAutomatica(false);
    });
    $("presidente").addEventListener("change", () => {
      refrescarBotonesOracionFinal();
      aplicarOracionFinalAutomatica(false);
    });

    refrescarBotonesOracionFinal();
    aplicarOracionFinalAutomatica(false);

    setStatus(`Listo. Personas cargadas: ${personas.length}.`);
  } catch (e) {
    console.error(e);
    setStatus("Error cargando datos. Revisá consola (F12) y permisos de Firestore.", true);
  }

  $("btnCargar").addEventListener("click", () => cargarAsignaciones());
  $("btnGuardar").addEventListener("click", () => guardarAsignaciones());
  $("btnLimpiar").addEventListener("click", () => limpiarFormulario());

  $("btnSugerirConductor").addEventListener("click", () => sugerirConductorAtalaya());
  $("btnOracionFinalOrador").addEventListener("click", () => usarOradorComoOracionFinal());
  $("btnOracionFinalPresidente").addEventListener("click", () => usarPresidenteComoOracionFinal());

  const btnSalir = document.getElementById("btnSalir");
  if (btnSalir) btnSalir.addEventListener("click", () => logout());
}

init();