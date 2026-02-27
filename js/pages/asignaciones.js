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
  const num = normNumero($("cancionNumero")?.value);
  if (!num) { $("cancionTitulo").value = ""; return; }
  $("cancionTitulo").value = cancionesMap.get(num) || "";
}

function aplicarAutoDiscurso() {
  const num = normNumero($("discursoNumero")?.value);
  if (!num) return; // no borro el título por si lo escribió manualmente
  const t = discursosMap.get(num);
  if (t) $("tituloDiscurso").value = t;
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
  // Listas (basadas en tu lista de roles)
  // Nota: si alguien NO está en la lista, igual podés seleccionarlo si ya estaba guardado.
  const LISTAS = {
    conductoresAtalaya: ["Marcelo Palavecino", "Leonardo Araya"],
    multimedia: [
      "Marcelo Rodríguez",
      "Eduardo Rivadeneira",
      "Hugo García",
      "Marcelo Palavecino",
      "Braian Rivadeneira",
      "Isaías Schell",
      "Martin Zerda",
      "Roberto Lazarte",
      "Sergio Saldaña"
    ],
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
    plataforma: ["Braian Torres", "Braian Rivadeneira", "Martin Zerda", "Omar Santucho"],
    microfonistas: [
      "David Salica",
      "Emanuel Salica",
      "Martin Zerda (padre)",
      "Martin Zerda (hijo)",
      "Facundo Reinoso",
      "Maximiliano Navarro",
      "Eduar Salinas",
      "Misael Salinas",
      "Isaías Schell",
      "Roberto Lazarte",
      "Eduardo Rivadeneira",
      "Hugo García",
      "Brian Rivadeneira",
      "Brian Torres",
      "Epifanio Pedraza",
      "Omar Santucho",
      "Marcelo Rodríguez",
      "Sergio Lazarte",
      "José Lazarte",
      "Rodolfo Santucho"
    ]
  };

  function listaPara(id) {
    if (id === "conductorAtalaya") return LISTAS.conductoresAtalaya;
    if (id === "multimedia1" || id === "multimedia2") return LISTAS.multimedia;
    if (id === "acomodadorPlataforma") return LISTAS.plataforma;
    if (id === "acomodadorEntrada" || id === "acomodadorAuditorio") return LISTAS.acomodadores;
    if (id === "microfonista1" || id === "microfonista2") return LISTAS.microfonistas;
    return null;
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
    "microfonista2"];

  for (const id of selectsIds) {
    const sel = $(id);
    clearSelect(sel);
    addOption(sel, "", "— Seleccionar —");

    const lista = listaPara(id);
    if (Array.isArray(lista)) {
      // Lista cerrada (por nombre)
      const set = new Set(lista.map(n => String(n).toLowerCase()));
      const filtradas = personas.filter(p => set.has(String(p.nombre).toLowerCase()));
      for (const p of filtradas) addOption(sel, p.nombre, p.nombre);

      // Si ya había un valor guardado que no está en la lista, lo agregamos para no romper
      const actual = (sel.value || "").trim();
      if (actual && !set.has(actual.toLowerCase())) {
        addOption(sel, actual, actual);
      }
    } else {
      // Sin filtro
      for (const p of personas) addOption(sel, p.nombre, p.nombre);
    }
  }
}

// ---------- Form <-> Object ----------
function getFormData() {
  return {
    presidente: $("presidente").value || "",

    cancionNumero: ($("cancionNumero").value || "").trim(),
    cancionTitulo: ($("cancionTitulo").value || "").trim(),

    oracionInicial: $("oracionInicial").value || "",
    oradorPublico: $("oradorPublico").value || "",

    congregacionVisitante: ($("congregacionVisitante").value || "").trim(),

    discursoNumero: ($("discursoNumero").value || "").trim(),
    tituloDiscurso: ($("tituloDiscurso").value || "").trim(),

    tituloSiguienteSemana: ($("tituloSiguienteSemana").value || "").trim(),

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
  $("cancionTitulo").value = data.cancionTitulo || "";

  $("oracionInicial").value = data.oracionInicial || "";
  $("oradorPublico").value = data.oradorPublico || "";

  $("congregacionVisitante").value = data.congregacionVisitante || "";

  $("discursoNumero").value = data.discursoNumero || "";
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
