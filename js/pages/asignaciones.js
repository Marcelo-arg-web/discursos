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
const val = (id) => { const el = $(id); return el ? (el.value ?? "") : ""; };
const setVal = (id, v) => { const el = $(id); if (el) el.value = v ?? ""; };
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

const statusBox = $("status");
function setStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.background = isError ? "#fff1f2" : "#f8fafc";
  statusBox.style.borderColor = isError ? "#fecdd3" : "#e5e7eb";
  statusBox.style.color = isError ? "#9f1239" : "#111827";

// ---------- Normalización y alias (para que coincidan 'Brian/Braian', acentos, etc.) ----------
const ID_MARTIN_PADRE = "OIz2KC7o6VwzvjZCqliA";
const ID_MARTIN_JR = "UQqyIWnjmCkHJlnjnKTH";
const ID_ISAIAS_SCHEL = "3mdo5EMtQxj5t5Yqgp84";

function _stripAccents(s) {
  return String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function nameKey(s) {
  let x = _stripAccents(String(s || "").trim()).toLowerCase();
  x = x.replace(/[^\p{L}\p{N}\s]/gu, " ");
  x = x.replace(/\s+/g, " ").trim();
  // Brian/Braian → mismo
  x = x.replace(/\bbraian\b/g, "brian");
  // Schell/Schel → mismo
  x = x.replace(/\bschell\b/g, "schel");
  return x;
}

function displayNombre(p) {
  // Diferenciar padre/hijo aunque en Firebase ambos digan "Martin Zerda"
  if (p?.id === ID_MARTIN_PADRE) return "Martin Zerda (padre)";
  if (p?.id === ID_MARTIN_JR) return "Martin Zerda Jr";
  return String(p?.nombre || "");
}

function roleKey(s) {
  const x = nameKey(s);
  // equivalencias comunes
  if (x === "siervo ministerial" || x === "siervo" || x === "sm") return "siervoministerial";
  if (x === "conductor de la atalaya" || x === "conductor atalaya") return "conductoratalaya";
  if (x === "lector de la atalaya" || x === "lector atalaya") return "lectoratalaya";
  if (x === "acomodador de plataforma" || x === "plataforma") return "plataforma";
  if (x === "audio y video" || x === "audio video") return "multimedia";
  if (x === "sonido y video") return "multimedia";
  return x.replace(/\s+/g, "");
}

function getRoleSet(p) {
  const set = new Set();
  const arr = Array.isArray(p?.roles) ? p.roles : [];
  for (const r of arr) set.add(roleKey(r));
  const r1 = p?.rol ? roleKey(p.rol) : null;
  if (r1) set.add(r1);
  return set;
}

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
  if (!(val("oradorPublico") || "").trim()) setVal("oradorPublico", v.nombre || "");
  if (!(val("congregacionVisitante") || "").trim()) setVal("congregacionVisitante", v.congregacion || "");

  const b = v.bosquejo;
  if (!(val("discursoNumero") || "").trim() && b !== undefined && b !== null && String(b).trim() !== "") {
    setVal("discursoNumero", String(b));
  }
  // Título: si está vacío, ponemos el de la planilla; si no, dejamos el que tenga
  if (!(val("tituloDiscurso") || "").trim() && (v.titulo || "").trim()) {
    setVal("tituloDiscurso", v.titulo);
  }

  const c = v.cancion;
  if (!(val("cancionNumero") || "").trim() && c !== undefined && c !== null && String(c).trim() !== "") {
    setVal("cancionNumero", String(c));
    aplicarAutoCancion();
  }
}

const cancionesMap = new Map(Object.entries(canciones).map(([k,v]) => [Number(k), String(v)]));
const discursosMap = new Map(Object.entries(bosquejos).map(([k,v]) => [Number(k), String(v)]));

function aplicarAutoCancion() {
  const num = normNumero($("cancionNumero")?.value);
  if (!num) { setVal("cancionTitulo", ""); return; }
  setVal("cancionTitulo", cancionesMap.get(num) || "");
}

function aplicarAutoDiscurso() {
  const num = normNumero($("discursoNumero")?.value);
  if (!num) return; // no borro el título por si lo escribió manualmente
  const t = discursosMap.get(num);
  if (t) setVal("tituloDiscurso", t);
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

  personas.sort((a, b) => displayNombre(a).localeCompare(displayNombre(b), "es"));

  personasByNameLower = new Map();
  for (const p of personas) {
    // Guardamos múltiples llaves para encontrar por nombre aun si cambia el formato
    const k1 = nameKey(displayNombre(p));
    if (k1) personasByNameLower.set(k1, p);
    const k2 = nameKey(p.nombre);
    if (k2) personasByNameLower.set(k2, p);
  }
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
      "Brian Rivadeneira",
      "Braian Rivadeneira",
      "Isaías Schell",
      "Isaías Schel",
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
    plataforma: ["Brian Torres",
      "Braian Torres", "Braian Torres", "Brian Rivadeneira",
      "Braian Rivadeneira", "Braian Rivadeneira", "Martin Zerda Jr", "Martin Zerda (hijo)", "Martin Zerda", "Omar Santucho", "Facundo Reinoso"],
    microfonistas: [
      "David Salica",
      "Emanuel Salica",
      "Martin Zerda (padre)",
      "Martin Zerda (hijo)",
      "Facundo Reinoso",
      "Maxi Navarro",
      "Eduar Salinas",
      "Misael Salinas",
      "Isaías Schell",
      "Isaías Schel",
      "Roberto Lazarte",
      "Eduardo Rivadeneira",
      "Hugo García",
      "Brian Rivadeneira",
      "Braian Rivadeneira",
      "Brian Torres",
      "Braian Torres",
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
    if (id === "plataforma") return LISTAS.plataforma;
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
    "plataforma",
    "acomodadorEntrada",
    "acomodadorAuditorio",
    "microfonista1",
    "microfonista2"];

  for (const id of selectsIds) {
    const sel = $(id);
    if (!sel) continue;

    // Guardamos el valor previo (si estabas editando)
    const previo = (sel.value || "").trim();

    clearSelect(sel);
    addOption(sel, "", "— Seleccionar —");

    const lista = listaPara(id);

    // Filtro por lista cerrada (por nombre) o por rol (según reglas)
    let elegibles = personas;

    if (Array.isArray(lista)) {
      const set = new Set(lista.map(nameKey));

      elegibles = personas.filter(p => {
        // Casos especiales por ID (para padre/hijo y nombres iguales)
        if (id === "plataforma" && p.id === ID_MARTIN_JR) return true;
        if (id === "microfonista1" || id === "microfonista2") {
          if (set.has(nameKey(displayNombre(p)))) return true;
          return false;
        }
        return set.has(nameKey(displayNombre(p)));
      });
    } else {
      // Reglas por roles
      elegibles = personas.filter(p => {
        const rs = getRoleSet(p);
        const esAnciano = rs.has("anciano") || rs.has("anciano.");
        const esSiervo = rs.has("siervoministerial");
        const esLectorAtalaya = rs.has("lectoratalaya");
        const esConductorAtalaya = rs.has("conductoratalaya");

        if (id === "presidente" || id === "oracionInicial") {
          return esAnciano || esSiervo;
        }
        if (id === "lectorAtalaya") {
          return esAnciano || esSiervo || esLectorAtalaya;
        }
        if (id === "conductorAtalaya") {
          return esAnciano || esConductorAtalaya;
        }
        // Por defecto, no filtramos
        return true;
      });
    }

    for (const p of elegibles) {
      const nom = displayNombre(p);
      addOption(sel, nom, nom);
    }

    // Si ya había un valor guardado que no está en la lista/filtro, lo agregamos para no romper
    if (previo && !Array.from(sel.options).some(o => (o.value || "").trim() === previo)) {
      addOption(sel, previo, previo);
    }

    // Restauramos el valor previo si existe
    if (previo) sel.value = previo;
  }
}

// ---------- Form <-> Object ----------
function getFormData() {
  return {
    presidente: val("presidente") || "",

    cancionNumero: (val("cancionNumero") || "").trim(),
    cancionTitulo: (val("cancionTitulo") || "").trim(),

    oracionInicial: val("oracionInicial") || "",
    oradorPublico: val("oradorPublico") || "",

    congregacionVisitante: (val("congregacionVisitante") || "").trim(),

    discursoNumero: (val("discursoNumero") || "").trim(),
    tituloDiscurso: (val("tituloDiscurso") || "").trim(),

    tituloSiguienteSemana: (val("tituloSiguienteSemana") || "").trim(),

    conductorAtalaya: val("conductorAtalaya") || "",
    lectorAtalaya: val("lectorAtalaya") || "",

    multimedia1: val("multimedia1") || "",
    multimedia2: val("multimedia2") || "",

    plataforma: val("plataforma") || "",

    // compat: si existe el viejo campo en el HTML, lo tomamos también
    acomodadorPlataforma: (val("plataforma") || val("acomodadorPlataforma") || ""),
    acomodadorEntrada: val("acomodadorEntrada") || "",
    acomodadorAuditorio: val("acomodadorAuditorio") || "",

    microfonista1: val("microfonista1") || "",
    microfonista2: val("microfonista2") || "",

    oracionFinal: val("oracionFinal") || ""
  };
}

function setFormData(data = {}) {
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

  setVal("plataforma", (data.plataforma || data.acomodadorPlataforma || ""));
  // compat: si existe el viejo select en HTML, también lo cargamos
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
      setVal("conductorAtalaya", nombre);
      setStatus(`Sugerencia aplicada: Conductor Atalaya → ${nombre}`);
      return;
    }
  }

  const anciano = personas.find(p => hasRole(p, "anciano"));
  if (anciano) {
    setVal("conductorAtalaya", anciano.nombre);
    setStatus(`Sugerencia aplicada: Conductor Atalaya → ${anciano.nombre} (anciano disponible)`);
    return;
  }

  for (const nombre of preferidos.slice(2)) {
    if (personasByNameLower.has(nombre.toLowerCase())) {
      setVal("conductorAtalaya", nombre);
      setStatus(`Sugerencia aplicada: Conductor Atalaya → ${nombre}`);
      return;
    }
  }

  setStatus("No pude sugerir conductor: no encontré los nombres ni ancianos en Personas.", true);
}

// ---------- Oración final (auto + botones con nombres) ----------
let oracionFinalFueEditada = false;

function refrescarBotonesOracionFinal() {
  const orador = val("oradorPublico") || "";
  const pres = val("presidente") || "";

  $("btnOracionFinalOrador").textContent = orador
    ? `Usar orador público: ${orador}`
    : "Usar orador público";

  $("btnOracionFinalPresidente").textContent = pres
    ? `Usar presidente: ${pres}`
    : "Usar presidente";
}

function sugerirOracionFinal() {
  const orador = val("oradorPublico") || "";
  const pres = val("presidente") || "";
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

  const actual = val("oracionFinal") || "";
  if (force || !actual || !oracionFinalFueEditada) {
    setVal("oracionFinal", sugerida);
  }
}

// ---------- Firestore persistence ----------
function getSemanaId() {
  const semana = val("semana");
  return (semana && semana.trim()) ? semana.trim() : "";
}

async function cargarAsignaciones() {
  const semanaId = getSemanaId();
  if (!semanaId) {
    setStatus("Elegí una fecha en 'Semana' para cargar.", true);
    return;
  }

  const ref = doc(db, "asignaciones", semanaId);
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
  oracionFinalFueEditada = Boolean((("" + val("oracionFinal")) || "").trim());
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

  // Validación: evitar repetir la misma persona en Multimedia 1/2 y Acomodadores Entrada/Auditorio
  if (!validarNoRepetidos(asignaciones)) return;

  if (!asignaciones.presidente) {
    setStatus("Falta Presidente.", true);
    return;
  }

  const ref = doc(db, "asignaciones", semanaId);

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
    const refVis = doc(db, "visitas", semanaId);
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
  const orador = val("oradorPublico") || "";
  if (!orador) {
    setStatus("Primero elegí el Orador público.", true);
    return;
  }
  setVal("oracionFinal", orador);
  oracionFinalFueEditada = true;
  setStatus(`Oración final asignada a: ${orador}`);
}

function usarPresidenteComoOracionFinal() {
  const pres = val("presidente") || "";
  if (!pres) {
    setStatus("Primero elegí el Presidente.", true);
    return;
  }
  setVal("oracionFinal", pres);
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
    setVal("semana", isoToday());

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
    on("cancionNumero","input", () => aplicarAutoCancion());
    on("discursoNumero","input", () => aplicarAutoDiscurso());

    // auto visitante según semana
    on("semana","change", () => {
      aplicarAutoVisitante();
      aplicarAutoCancion();
      aplicarAutoDiscurso();
      refrescarBotonesOracionFinal();
      aplicarOracionFinalAutomatica(false);
    });

    // oración final
    on("oracionFinal","change", () => { oracionFinalFueEditada = true; });

    on("oradorPublico","change", () => {
      refrescarBotonesOracionFinal();
      aplicarOracionFinalAutomatica(false);
    });
    on("presidente","change", () => {
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

  on("btnCargar","click", () => cargarAsignaciones());
  on("btnGuardar","click", () => guardarAsignaciones());
  on("btnImprimir","click", () => window.open("imprimir.html", "_blank"));
  on("btnPdfPresidente","click", () => {
    const semanaId = getSemanaId();
    if(!semanaId){
      setStatus("Elegí una fecha en 'Semana' para generar el PDF del presidente.", true);
      return;
    }
    window.open(`presidente.html?semana=${encodeURIComponent(semanaId)}`, "_blank");
  });
  on("btnLimpiar","click", () => limpiarFormulario());

  on("btnSugerirConductor","click", () => sugerirConductorAtalaya());
  on("btnOracionFinalOrador","click", () => usarOradorComoOracionFinal());
  on("btnOracionFinalPresidente","click", () => usarPresidenteComoOracionFinal());

  const btnSalir = document.getElementById("btnSalir");
  if (btnSalir) btnSalir.addEventListener("click", () => logout());
}

init();

function validarNoRepetidos(data) {
  // No permitir asignar a la misma persona en estos campos
  const campos = [
    ["Multimedia 1", data.multimedia1],
    ["Multimedia 2", data.multimedia2],
    ["Acomodador Entrada", data.acomodadorEntrada],
    ["Acomodador Auditorio", data.acomodadorAuditorio],
  ]
    .map(([k,v]) => [k, String(v || "").trim()])
    .filter(([,v]) => v !== "");

  const seen = new Map(); // key normalizada -> {campo, valorOriginal}
  const repetidos = [];
  for (const [campo, valor] of campos) {
    const k = nameKey(valor);
    if (seen.has(k)) {
      const prev = seen.get(k);
      repetidos.push({ nombre: valor, campo1: prev.campo, campo2: campo });
    } else {
      seen.set(k, { campo, valor });
    }
  }

  if (repetidos.length) {
    const detalle = repetidos
      .map(r => `${r.nombre} (${r.campo1} y ${r.campo2})`)
      .join("
");
    alert("No se puede asignar a la misma persona en estos campos:

" + detalle);
    return false;
  }
  return true;
}
