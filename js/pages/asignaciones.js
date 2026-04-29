// js/pages/asignaciones.js
// Admin: carga personas, guarda asignaciones semanales, y autocompleta visitante/títulos.
// NO modifica Firebase.

import { auth, db } from "../firebase-config.js?v=20260429b68";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { canciones } from "../data/canciones.js";
import { bosquejos } from "../data/bosquejos.js";
import { visitantes as visitantesLocal } from "../data/visitantes.js";

import {
  getAncianosOSiervos,
  getAncianos,
  getPresidentes,
  getOradoresOracion,
  getConductoresAtalaya,
  getAcomodadores,
  getPlataforma,
  getMultimedia,
  getMicrofonistas,
  getLectoresAtalaya
} from "../roles/getRoleCandidates.js";

// ---------------- UI helpers ----------------
const $ = (id) => document.getElementById(id);
const getVal = (id) => ($(id)?.value ?? "");
const setVal = (id, v) => {
  const el = $(id);
  if (el) el.value = v ?? "";
};

// ---------------- Semana Jueves/Sábado: copiar asignados automáticamente ----------------
function isoToDate(iso){
  const [y,m,d] = String(iso||"").split("-").map(n=>parseInt(n,10));
  if(!y||!m||!d) return null;
  return new Date(y, m-1, d);
}
function toISODate(dt){
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const d = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function getJuevesAnteriorISO(fechaISO){
  const dt = isoToDate(fechaISO);
  if(!dt) return null;
  const dow = dt.getDay(); // 0 dom ... 6 sáb
  // Reunión fin de semana: sábado => jueves -2, domingo => jueves -3
  const delta = (dow === 6) ? 2 : (dow === 0 ? 3 : null);
  if(delta === null) return null;
  dt.setDate(dt.getDate() - delta);
  return toISODate(dt);
}
// Copiamos solo estos campos (dentro de asignaciones) para jueves y sábado
const CAMPOS_COPIAR_A_JUEVES = [
  "acomodadorEntradaId",
  "acomodadorAuditorio1Id",
  "plataformaId",
  "multimedia1Id",
  "multimedia2Id",
  "microfonista1Id",
  "microfonista2Id",
];

async function copiarAsignadosAlJuevesSiCorresponde(fechaFinDeSemanaISO, dataAsignaciones){
  const juevesISO = getJuevesAnteriorISO(fechaFinDeSemanaISO);
  if(!juevesISO) return; // no es sábado/domingo
  const refJ = doc(db, "asignaciones", juevesISO);
  const snapJ = await getDoc(refJ);
  const existente = snapJ.exists() ? (snapJ.data()?.asignaciones || {}) : {};
  const patch = {};
  for(const campo of CAMPOS_COPIAR_A_JUEVES){
    const vSab = dataAsignaciones?.[campo];
    if(vSab === undefined || vSab === null || String(vSab).trim() === "") continue;
    const vJ = existente?.[campo];
    if(vJ !== undefined && vJ !== null && String(vJ).trim() !== "") continue; // no pisar
    patch[campo] = vSab;
  }
  if(Object.keys(patch).length === 0) return;

  await setDoc(refJ, {
    asignaciones: patch,
    updatedAt: serverTimestamp(),
    copiadoDesdeFinDeSemana: fechaFinDeSemanaISO,
  }, { merge: true });
}
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(msg, isError = false) {
  const box = $("status");
  if (!box) return;
  box.textContent = msg;
  box.style.display = "block";
  box.style.background = isError ? "#fff1f2" : "#f8fafc";
  box.style.border = `1px solid ${isError ? "#fecdd3" : "#e5e7eb"}`;
  box.style.borderColor = isError ? "#fecdd3" : "#e5e7eb";
  box.style.color = isError ? "#9f1239" : "#111827";
}

function setBusy(btnId, busy, busyLabel = "Procesando…") {
  const b = $(btnId);
  if (!b) return;
  if (busy) {
    b.dataset._prevLabel = b.textContent;
    b.textContent = busyLabel;
    b.disabled = true;
  } else {
    b.textContent = b.dataset._prevLabel || b.textContent;
    b.disabled = false;
  }
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function semanaTipo() {
  return String(getVal("tipoSemana") || "normal").trim().toLowerCase() || "normal";
}

function isSemanaEspecialValue(v) {
  return v === "asamblea" || v === "conmemoracion";
}

function isSemanaEspecial() {
  return isSemanaEspecialValue(semanaTipo());
}

function semanaEspecialLabel(v = semanaTipo()) {
  return v === "asamblea" ? "Asamblea" : v === "conmemoracion" ? "Conmemoración" : "";
}

function blankAssignmentsData(extra = {}) {
  return {
    presidenteId: "",
    oracionInicialId: "",
    oracionFinalId: "",
    conductorAtalayaId: "",
    lectorAtalayaId: "",
    multimedia1Id: "",
    multimedia2Id: "",
    plataformaId: "",
    microfonista1Id: "",
    microfonista2Id: "",
    acomodadorEntradaId: "",
    acomodadorAuditorio1Id: "",
    cancionNumero: "",
    oradorPublico: "",
    congregacionVisitante: "",
    discursoNumero: "",
    tituloDiscurso: "",
    tituloSiguienteSemana: "",
    ...extra,
  };
}

function updateSemanaEspecialUI() {
  const especial = isSemanaEspecial();
  const ids = [
    "presidente","oracionInicial","oracionFinal","conductorAtalaya","lectorAtalaya",
    "multimedia1","multimedia2","plataforma","microfonista1","microfonista2",
    "acomodadorEntrada","acomodadorAuditorio1",
    "cancionNumero","oradorPublico","congregacionVisitante","discursoNumero",
    "tituloDiscurso","tituloSiguienteSemana",
    "btnSugerirPresidente","btnSugerirOracionInicial","btnSugerirConductor","btnSugerirLectorAtalaya","btnSugMultimedia1","btnSugMultimedia2",
    "btnSugPlataforma","btnSugAcomEntrada","btnSugAcomAuditorio1","btnSugMicrofonista1","btnSugMicrofonista2"
  ];
  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.disabled = especial;
  });
  const note = $("semanaEspecialHelp");
  if (note) {
    note.textContent = especial
      ? `${semanaEspecialLabel()}: no hay reuniones ni asignados en esa semana.`
      : "Normal: se cargan los asignados de la semana.";
  }
}

function fmtAR(iso) {
  // 2026-02-28 -> 28/02/2026
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function upcomingSaturdayISO(fromISO = isoToday()) {
  // Devuelve el sábado más cercano en o después de la fecha dada (YYYY-MM-DD)
  const d = new Date(fromISO + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDay(); // 0=dom ... 6=sáb
  const delta = (6 - day + 7) % 7; // días hasta sábado
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function shiftWeekISO(semanaSatISO, weeks) {
  return addDaysISO(semanaSatISO, 7 * weeks);
}

function addOpt(sel, value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  sel.appendChild(opt);
}

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\.\,\;\:]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizeRole(r) {
  const n = normalize(r).replace(/_/g, " ").replace(/-/g, " ");
  return n;
}

function displayName(persona) {
  return persona?.nombre || "";
}
function rolesSet(persona) {
  const arr = Array.isArray(persona?.roles) ? persona.roles : [];
  return new Set(arr.map(normalizeRole));
}

function hasAncianoOrSiervo(persona) {
  const rs = rolesSet(persona);
  return (
    rs.has("anciano") ||
    rs.has("siervo ministerial") ||
    rs.has("siervoministerial") ||
    rs.has("siervo")
  );
}

function hasAnciano(persona) {
  const rs = rolesSet(persona);
  return rs.has("anciano");
}

// ---------------- Data ----------------
let personas = []; // {id, nombre, roles, activo, ...}
let usuarioRol = "";
let isAdmin = true;
const candidates = {
  multimedia: [],
  plataforma: [],
  acomodadores: [],
  microfonistas: [],
};

const SUPPORT_SELECT_IDS = [
  "multimedia1",
  "multimedia2",
  "plataforma",
  "acomodadorEntrada",
  "acomodadorAuditorio1",
  "microfonista1",
  "microfonista2",
];

const SUPPORT_HISTORY_FIELDS = [
  "multimedia1Id",
  "multimedia2Id",
  "plataformaId",
  "acomodadorEntradaId",
  "acomodadorAuditorio1Id",
  "microfonista1Id",
  "microfonista2Id",
];

// Campos con personas asignadas en la semana. Se usan para que el botón "Sugerir"
// no cargue siempre a los mismos ni repita una persona en la misma semana si hay alternativas.
const WEEK_PERSON_SELECT_IDS = [
  "presidente",
  "oracionInicial",
  "conductorAtalaya",
  "lectorAtalaya",
  "multimedia1",
  "multimedia2",
  "plataforma",
  "acomodadorEntrada",
  "acomodadorAuditorio1",
  "microfonista1",
  "microfonista2",
];

const MARCELO_CONDUCTOR_NOMBRE = "Marcelo Palavecino";
const MARCELO_SALIENTES_FALLBACK = [
  // Respaldo local por si la colección salientes todavía no fue leída/cargada.
  { fecha: "2026-02-14", orador: "Marcelo Palavecino" },
  { fecha: "2026-03-21", orador: "Marcelo Palavecino" },
  { fecha: "2026-04-05", orador: "Marcelo Palavecino" },
  { fecha: "2026-05-10", orador: "Marcelo Palavecino" },
  { fecha: "2026-08-01", orador: "Marcelo Palavecino" },
  { fecha: "2026-09-19", orador: "Marcelo Palavecino" },
  { fecha: "2026-10-11", orador: "Marcelo Palavecino" },
];

let salientesHistoryLoaded = false;
let salientesHistory = [];

let supportHistoryLoaded = false;
const supportLastAssigned = new Map();

let roleHistoryLoaded = false;
const roleHistoryMaps = {
  presidente: new Map(),
  oracionInicial: new Map(),
  conductorAtalaya: new Map(),
  lectorAtalaya: new Map(),
  plataforma: new Map(),
  multimedia: new Map(),
  multimedia1: new Map(),
  multimedia2: new Map(),
  acomodadores: new Map(),
  acomodadorEntrada: new Map(),
  acomodadorAuditorio1: new Map(),
  microfonista: new Map(),
  microfonista1: new Map(),
  microfonista2: new Map(),
};
const roleCountMaps = Object.fromEntries(Object.keys(roleHistoryMaps).map((k) => [k, new Map()]));

function updateRoleHistory(roleKey, personaId, whenValue) {
  const map = roleHistoryMaps[roleKey];
  const countMap = roleCountMaps[roleKey];
  const id = String(personaId || "").trim();
  if (!map || !id) return;
  if (countMap) countMap.set(id, (countMap.get(id) || 0) + 1);
  const when = String(whenValue || "").trim();
  const prev = map.get(id) || "";
  if (!prev || (when && prev < when)) {
    map.set(id, when || prev || "");
  }
}

function markSuggestedLocal(roleKey, personaId) {
  const id = String(personaId || "").trim();
  if (!roleKey || !id) return;
  try { localStorage.setItem(`lastSuggested_${roleKey}_${id}`, String(Date.now())); } catch (_) {}
}

function getLastSuggestedLocal(roleKey, personaId) {
  try {
    const n = parseInt(localStorage.getItem(`lastSuggested_${roleKey}_${personaId}`) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function selectedIdsThisWeek(exceptSelectId = "") {
  const ids = new Set();
  WEEK_PERSON_SELECT_IDS.forEach((sid) => {
    if (sid === exceptSelectId) return;
    const v = String(getVal(sid) || "").trim();
    // Oración final puede contener texto como "Visitante/Presidente"; solo tomamos IDs reales.
    if (v && personaNameById(v)) ids.add(v);
  });
  return ids;
}

function buildCandidateList(candidateIds, selectId, softExcludedIds = [], hardExcludedIds = []) {
  const hard = new Set((hardExcludedIds || []).map((v) => String(v || "").trim()).filter(Boolean));
  const soft = new Set([
    ...Array.from(selectedIdsThisWeek(selectId)),
    ...(softExcludedIds || []).map((v) => String(v || "").trim()).filter(Boolean),
  ]);
  const base = Array.from(new Set((candidateIds || []).map((v) => String(v || "").trim()).filter(Boolean)))
    .filter((id) => !hard.has(id));
  if (!base.length) return [];

  // Primero: no repetir a nadie ya usado en la misma semana.
  const noRepeat = base.filter((id) => !soft.has(id));
  if (noRepeat.length) return noRepeat;

  // Si no queda alternativa, permitimos repetir antes que dejar vacío.
  return base;
}

function personaByName(nombre) {
  const target = normalize(nombre);
  return personas.find((p) => p && p.activo !== false && normalize(p.nombre || "") === target) || null;
}

function isMarceloPalavecinoId(personaId) {
  const name = personaNameById(personaId);
  return normalize(name) === normalize(MARCELO_CONDUCTOR_NOMBRE);
}

function salienteNombre(r) {
  return r?.orador || r?.oradorNombre || r?.nombre || "";
}

async function ensureSalientesHistoryLoaded() {
  if (salientesHistoryLoaded) return;
  salientesHistoryLoaded = true;
  salientesHistory = MARCELO_SALIENTES_FALLBACK.slice();
  try {
    const snap = await getDocs(collection(db, "salientes"));
    const fromDb = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    salientesHistory = salientesHistory.concat(fromDb);
  } catch (e) {
    console.warn("No pude leer salientes para validar conductor de La Atalaya; uso respaldo local.", e);
  }
}

function isISODate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

function salidaEnFinDeSemanaDeAtalaya(salidaISO, semanaISOValue) {
  if (!isISODate(salidaISO) || !isISODate(semanaISOValue)) return false;
  const d = new Date(semanaISOValue + "T00:00:00");
  const sabado = d.getDay() === 0 ? addDaysISO(semanaISOValue, -1) : semanaISOValue;
  const domingo = addDaysISO(sabado, 1);
  return salidaISO === sabado || salidaISO === domingo;
}

async function marceloTieneSalidaFinDeSemana(semanaSatISO) {
  await ensureSalientesHistoryLoaded();
  const s = String(semanaSatISO || "").trim();
  return salientesHistory.some((r) =>
    normalize(salienteNombre(r)) === normalize(MARCELO_CONDUCTOR_NOMBRE) &&
    salidaEnFinDeSemanaDeAtalaya(String(r?.fecha || "").trim(), s)
  );
}

function extractRoleAssignmentsFromData(data, whenValue) {
  const a = data?.asignaciones || data || {};
  updateRoleHistory("presidente", a?.presidenteId, whenValue);
  updateRoleHistory("oracionInicial", a?.oracionInicialId, whenValue);
  updateRoleHistory("conductorAtalaya", a?.conductorAtalayaId, whenValue);
  updateRoleHistory("lectorAtalaya", a?.lectorAtalayaId, whenValue);
  updateRoleHistory("plataforma", a?.plataformaId, whenValue);
  updateRoleHistory("acomodadores", a?.acomodadorEntradaId, whenValue);
  updateRoleHistory("acomodadorEntrada", a?.acomodadorEntradaId, whenValue);
  updateRoleHistory("acomodadores", a?.acomodadorAuditorio1Id || a?.acomodadorAuditorioId, whenValue);
  updateRoleHistory("acomodadorAuditorio1", a?.acomodadorAuditorio1Id || a?.acomodadorAuditorioId, whenValue);
  updateRoleHistory("multimedia", a?.multimedia1Id, whenValue);
  updateRoleHistory("multimedia1", a?.multimedia1Id, whenValue);
  updateRoleHistory("multimedia", a?.multimedia2Id, whenValue);
  updateRoleHistory("multimedia2", a?.multimedia2Id, whenValue);
  updateRoleHistory("microfonista", a?.microfonista1Id, whenValue);
  updateRoleHistory("microfonista1", a?.microfonista1Id, whenValue);
  updateRoleHistory("microfonista", a?.microfonista2Id, whenValue);
  updateRoleHistory("microfonista2", a?.microfonista2Id, whenValue);
}

async function ensureRoleHistoryLoaded() {
  if (roleHistoryLoaded) return;
  roleHistoryLoaded = true;
  Object.values(roleHistoryMaps).forEach((m) => m.clear());
  Object.values(roleCountMaps).forEach((m) => m.clear());

  try {
    const weekSnap = await getDocs(collection(db, "asignaciones"));
    weekSnap.docs.forEach((d) => {
      extractRoleAssignmentsFromData(d.data() || {}, d.id);
    });
  } catch (e) {
    console.warn("No pude leer historial semanal de asignaciones:", e);
  }

  try {
    const monthSnap = await getDocs(collection(db, COL_MES));
    monthSnap.docs.forEach((d) => {
      const mesISO = d.id;
      const data = d.data() || {};
      const semanas = data?.semanas || {};
      const sats = saturdaysInMonth(mesISO);
      Object.entries(semanas).forEach(([weekKey, weekData]) => {
        const idx = Math.max(0, parseInt(String(weekKey || "1"), 10) - 1);
        const whenValue = sats[idx] || `${mesISO}-99`;
        extractRoleAssignmentsFromData(weekData, whenValue);
      });
    });
  } catch (e) {
    console.warn("No pude leer historial mensual de roles:", e);
  }
}

function compareCandidatesByRoleHistory(roleKey, aId, bId) {
  const map = roleHistoryMaps[roleKey] || new Map();
  const countMap = roleCountMaps[roleKey] || new Map();

  // 1) Menos veces en esa asignación.
  const aCount = countMap.get(aId) || 0;
  const bCount = countMap.get(bId) || 0;
  if (aCount !== bCount) return aCount - bCount;

  // 2) Más tiempo sin servir en esa asignación.
  const aWhen = map.get(aId) || "";
  const bWhen = map.get(bId) || "";
  if (!aWhen && bWhen) return -1;
  if (aWhen && !bWhen) return 1;
  if (aWhen !== bWhen) return aWhen.localeCompare(bWhen);

  // 3) Desempate local para que no gane siempre el primero alfabéticamente.
  const aLocal = getLastSuggestedLocal(roleKey, aId);
  const bLocal = getLastSuggestedLocal(roleKey, bId);
  if (aLocal !== bLocal) return aLocal - bLocal;

  const aName = personaNameById(aId) || "";
  const bName = personaNameById(bId) || "";
  return aName.localeCompare(bName, "es", { sensitivity: "base" });
}

async function suggestByRoleHistory(selectId, roleKey, candidateIds, extraExcludedIds = [], hardExcludedIds = []) {
  if (!isAdmin) return "";
  const sel = $(selectId);
  if (!sel) return "";

  await ensureRoleHistoryLoaded();

  const list = buildCandidateList(candidateIds, selectId, extraExcludedIds, hardExcludedIds);
  if (!list.length) return "";
  list.sort((a, b) => compareCandidatesByRoleHistory(roleKey, a, b));

  const chosen = list[0] || "";
  if (chosen) {
    sel.value = chosen;
    updateRoleHistory(roleKey, chosen, semanaISO() || isoToday());
    markSuggestedLocal(roleKey, chosen);
  }
  return chosen;
}

function getSupportSelectedIds(exceptSelectId = "") {
  return selectedIdsThisWeek(exceptSelectId);
}

function getSupportCandidateIds() {
  return Array.from(new Set([
    ...(candidates.multimedia || []),
    ...(candidates.plataforma || []),
    ...(candidates.acomodadores || []),
    ...(candidates.microfonistas || []),
  ].filter(Boolean)));
}

function updateSupportLastAssigned(personaId, whenValue) {
  const id = String(personaId || "").trim();
  if (!id) return;
  const when = String(whenValue || "").trim();
  const prev = supportLastAssigned.get(id) || "";
  if (!prev || (when && prev < when)) {
    supportLastAssigned.set(id, when || prev || "");
  }
}

function extractSupportAssignmentsFromData(data, whenValue) {
  const a = data?.asignaciones || data || {};
  SUPPORT_HISTORY_FIELDS.forEach((field) => {
    const pid = String(a?.[field] || "").trim();
    if (pid) updateSupportLastAssigned(pid, whenValue);
  });
  extractRoleAssignmentsFromData(data, whenValue);
}

async function ensureSupportHistoryLoaded() {
  if (supportHistoryLoaded) return;
  supportHistoryLoaded = true;
  supportLastAssigned.clear();

  try {
    const weeklySnap = await getDocs(collection(db, "asignaciones"));
    weeklySnap.docs.forEach((d) => {
      extractSupportAssignmentsFromData(d.data(), d.id);
    });
  } catch (e) {
    console.warn("No pude leer historial semanal de asignaciones:", e);
  }

  try {
    const monthSnap = await getDocs(collection(db, COL_MES));
    monthSnap.docs.forEach((d) => {
      const mesISO = d.id;
      const data = d.data() || {};
      const semanas = data?.semanas || {};
      const sats = saturdaysInMonth(mesISO);
      Object.entries(semanas).forEach(([weekKey, weekData]) => {
        const idx = Math.max(0, parseInt(String(weekKey || "1"), 10) - 1);
        const whenValue = sats[idx] || `${mesISO}-99`;
        extractSupportAssignmentsFromData(weekData, whenValue);
      });
    });
  } catch (e) {
    console.warn("No pude leer historial mensual de asignaciones:", e);
  }
}

function compareSupportCandidatesByHistory(aId, bId) {
  const aWhen = supportLastAssigned.get(aId) || "";
  const bWhen = supportLastAssigned.get(bId) || "";
  if (!aWhen && bWhen) return -1;
  if (aWhen && !bWhen) return 1;
  if (aWhen !== bWhen) return aWhen.localeCompare(bWhen);
  const aName = personaNameById(aId) || "";
  const bName = personaNameById(bId) || "";
  return aName.localeCompare(bName, "es", { sensitivity: "base" });
}

function supportRoleKeyForSelectId(selectId) {
  return ({
    multimedia1: "multimedia1",
    multimedia2: "multimedia2",
    plataforma: "plataforma",
    acomodadorEntrada: "acomodadorEntrada",
    acomodadorAuditorio1: "acomodadorAuditorio1",
    microfonista1: "microfonista1",
    microfonista2: "microfonista2",
  })[String(selectId || "").trim()] || "";
}

async function suggestSupportSelect(selectId, candidateIds) {
  if (!isAdmin) return;
  const sel = $(selectId);
  if (!sel) return;

  await ensureSupportHistoryLoaded();
  await ensureRoleHistoryLoaded();

  const list = buildCandidateList(candidateIds, selectId);
  if (!list.length) return;

  const roleKey = supportRoleKeyForSelectId(selectId);
  if (roleKey && roleHistoryMaps[roleKey]) {
    list.sort((a, b) => compareCandidatesByRoleHistory(roleKey, a, b));
  } else {
    list.sort(compareSupportCandidatesByHistory);
  }

  const chosen = list[0] || "";
  if (chosen) {
    sel.value = chosen;
    updateSupportLastAssigned(chosen, semanaISO() || isoToday());
    if (roleKey) {
      updateRoleHistory(roleKey, chosen, semanaISO() || isoToday());
      markSuggestedLocal(roleKey, chosen);
    }
  }
  return chosen;
}

async function getUsuario(uid){
  try{
    const snap = await getDoc(doc(db,"usuarios",uid));
    return snap.exists() ? snap.data() : null;
  }catch(e){
    console.error(e);
    return null;
  }
}


function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        <a href="programa-mensual.html" class="${active==='programa'?'active':''}">Programa mensual</a>
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Asignaciones Villa Fiad</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="funciones.html" class="${active==='personas'?'active':''}">Funciones</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>
      </div>
      <div class="actions">
        <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch(e){}
    window.location.href = "index.html";
  });
}


function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}

function applyReadOnlyMode(){
  if(isAdmin) return;
  setStatus("Modo solo lectura: podés ver e imprimir, pero no modificar asignaciones.");

  // Botones que NO deberían usarse en modo usuario
  [
    "btnGuardar","btnLimpiar","btnCopiarAnterior",
    "btnGuardarMes"
  ].forEach(id=>{
    const b = $(id);
    if(b) b.disabled = true;
  });

  // Deshabilita campos editables
  const disableIds = [
    "presidente","cancionNumero","oracionInicial","oradorPublico","congregacionVisitante",
    "tituloDiscurso","tituloSiguienteSemana","conductorAtalaya","lectorAtalaya",
    "multimedia1","multimedia2","plataforma","acomodadorEntrada","acomodadorAuditorio1",
      "microfonista1","microfonista2","oracionFinal",
    // mensuales
    "mes","mesSemana","mesPlataforma","mesAcomodadorEntrada","mesAcomodadorAuditorio1",
    "mesMultimedia1","mesMultimedia2","mesMicrofonista1","mesMicrofonista2"
  ];
  disableIds.forEach(id=>{ const el = $(id); if(el) el.disabled = true; });

  // Botones sugerir
  [
    "btnSugerirPresidente","btnSugerirOracionInicial","btnSugerirConductor","btnSugerirLectorAtalaya","btnSugMultimedia1","btnSugMultimedia2","btnSugPlataforma",
  ].forEach(id=>{ const b = $(id); if(b) b.disabled = true; });
}

// ---------------- Asignaciones mensuales (tablero) ----------------
const COL_MES = "asignaciones_mensuales";
let lastMesDoc = null; // cache del último doc mensual cargado

function monthParts(mesISO) {
  const [yS, mS] = String(mesISO || "").split("-");
  const y = parseInt(yS, 10);
  const m = parseInt(mS, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { y, m };
}

function saturdaysInMonth(mesISO) {
  const p = monthParts(mesISO);
  if (!p) return [];
  const { y, m } = p;
  const d = new Date(y, m - 1, 1);
  const out = [];
  while (d.getMonth() === m - 1) {
    if (d.getDay() === 6) {
      const mm = String(m).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${mm}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function renderMesSemanaOptions(mesISO) {
  const sel = $("mesSemana");
  if (!sel) return;
  const sats = saturdaysInMonth(mesISO);
  sel.innerHTML = "";
  if (!mesISO) {
    addOpt(sel, "", "— Elegí un mes —");
    return;
  }
  if (sats.length === 0) {
    addOpt(sel, "1", "Semana 1");
    return;
  }
  sats.forEach((iso, idx) => {
    const dd = iso.slice(8, 10);
    addOpt(sel, String(idx + 1), `Semana ${idx + 1} (sáb ${dd})`);
  });
  if (!getVal("mesSemana")) setVal("mesSemana", "1");
}

function currentMesSemana() {
  const v = String(getVal("mesSemana") || "").trim();
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "1";
}

function monthISOFromDateISO(dateISO) {
  // "2026-02-28" -> "2026-02"
  if (!dateISO) return "";
  return String(dateISO).slice(0, 7);
}

function isoMonthToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function personaNameById(id) {
  if (!id) return "";
  const s = String(id).trim();
  const p = personas.find((x) => x.id === s);
  if (p?.nombre) return p.nombre;
  return "";
}

function formMesData() {
  return {
    plataformaId: getVal("mesPlataforma"),
    acomodadorEntradaId: getVal("mesAcomodadorEntrada"),
    acomodadorAuditorio1Id: getVal("mesAcomodadorAuditorio1"),
    multimedia1Id: getVal("mesMultimedia1"),
    multimedia2Id: getVal("mesMultimedia2"),
    microfonista1Id: getVal("mesMicrofonista1"),
    microfonista2Id: getVal("mesMicrofonista2"),
  };
}

function emptyMesData() {
  return {
    plataformaId: "",
    acomodadorEntradaId: "",
    acomodadorAuditorio1Id: "",
    multimedia1Id: "",
    multimedia2Id: "",
    microfonista1Id: "",
    microfonista2Id: "",
  };
}

function ensureOptionById(selectId, personaId) {
  const sel = $(selectId);
  if (!sel || !personaId) return;
  // Evita errores si el id apunta a un input (o un elemento que no es <select>)
  if (!sel.options) return;

  const exists = Array.from(sel.options).some((o) => o.value === personaId);
  if (exists) return;

  const p = personas.find((x) => x.id === personaId);
  if (!p) return;

  addOpt(sel, p.id, displayName(p));
}

function hydrateMesToUI(m) {
  if (!m) return;
  const w = currentMesSemana();
  const dataWeek =
    m.semanas && m.semanas[w] ? m.semanas[w] : m.semanas ? emptyMesData() : m;

  [
    ["mesPlataforma", dataWeek.plataformaId],
    ["mesAcomodadorEntrada", dataWeek.acomodadorEntradaId],
    ["mesAcomodadorAuditorio1", dataWeek.acomodadorAuditorio1Id || dataWeek.acomodadorAuditorioId],
    ["mesMultimedia1", dataWeek.multimedia1Id],
    ["mesMultimedia2", dataWeek.multimedia2Id],
    ["mesMicrofonista1", dataWeek.microfonista1Id],
    ["mesMicrofonista2", dataWeek.microfonista2Id],
  ].forEach(([sid, pid]) => ensureOptionById(sid, pid));

  setVal("mesPlataforma", dataWeek.plataformaId || "");
  setVal("mesAcomodadorEntrada", dataWeek.acomodadorEntradaId || "");
  setVal("mesAcomodadorAuditorio1", dataWeek.acomodadorAuditorio1Id || dataWeek.acomodadorAuditorioId || "");
  setVal("mesMultimedia1", dataWeek.multimedia1Id || "");
  setVal("mesMultimedia2", dataWeek.multimedia2Id || "");
  setVal("mesMicrofonista1", dataWeek.microfonista1Id || "");
  setVal("mesMicrofonista2", dataWeek.microfonista2Id || "");
}

function renderMesPreview(mesISO, docData) {
  const box = $("printMes");
  if (!box) return;

  const monthLabel = mesISO ? mesISO : "—";
  const sats = saturdaysInMonth(mesISO);
  const totalWeeks = Math.max(1, sats.length || 1);

  const semanas = docData?.semanas ? docData.semanas : null;
  const fallback = docData && !docData.semanas ? docData : null;

  const rows = [];
  for (let i = 1; i <= totalWeeks; i++) {
    const key = String(i);
    const d =
      semanas && semanas[key]
        ? semanas[key]
        : i === 1 && fallback
        ? fallback
        : emptyMesData();

    const satISO = sats[i - 1] || "";
    const ddSat = satISO ? satISO.slice(8, 10) : "";
    const thuISO = satISO ? addDaysISO(satISO, -2) : "";
    const ddThu = thuISO ? thuISO.slice(8, 10) : "";

    const labelThu = ddThu
      ? `Semana ${i} (jue ${ddThu} 20:00)`
      : `Semana ${i} (jue 20:00)`;
    const labelSat = ddSat
      ? `Semana ${i} (sáb ${ddSat} 19:30)`
      : `Semana ${i} (sáb 19:30)`;

    const rowCells = (lbl) => `
      <tr>
        <td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">${lbl}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.plataformaId) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.acomodadorEntradaId) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.acomodadorAuditorio1Id || d.acomodadorAuditorioId) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.multimedia1Id) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.multimedia2Id) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.microfonista1Id) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.microfonista2Id) || "—"}</td>
      </tr>
    `;

    rows.push(rowCells(labelThu));
    rows.push(rowCells(labelSat));
  }

  box.innerHTML = `
    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
      <h3 style="margin:0 0 8px 0; color:#111827;">Asignaciones del mes: ${monthLabel}</h3>
      <div style="font-size:13px; color:#374151; margin-bottom:12px;">Para tablero de anuncios (Villa Fiad)</div>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Semana / día</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Plataforma</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Acom. entrada</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Acom. auditorio</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Multimedia 1</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Multimedia 2</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Micro 1</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Micro 2</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("\n")}
        </tbody>
      </table>
      <div style="font-size:12px; color:#6b7280; margin-top:10px;">
        Generado desde el panel. (Seleccioná semana, guardá, e imprimí.)
      </div>
    </div>
  `;
}

// --------------------
// Sugerencias equitativas (mensual, por semana)
// --------------------
function monthUsageCounts(m) {
  const counts = {}; // counts[personaId] = { total: n, roles: { roleKey:n } }
  const semanas = (m && m.semanas) ? m.semanas : {};
  Object.values(semanas).forEach((w) => {
    if (!w) return;
    const entries = [
      ["plataforma", w.plataformaId],
      ["acomodadorEntrada", w.acomodadorEntradaId],
      ["acomodadorAuditorio1", w.acomodadorAuditorio1Id || w.acomodadorAuditorioId],
      ["multimedia", w.multimedia1Id],
      ["multimedia", w.multimedia2Id],
      ["microfonista", w.microfonista1Id],
      ["microfonista", w.microfonista2Id],
    ];
    entries.forEach(([roleKey, pid]) => {
      if (!pid) return;
      if (!counts[pid]) counts[pid] = { total: 0, roles: {} };
      counts[pid].total += 1;
      counts[pid].roles[roleKey] = (counts[pid].roles[roleKey] || 0) + 1;
    });
  });
  return counts;
}

function pickFairCandidate(candidateIds, counts, roleKey, usedThisWeek) {
  const list = (candidateIds || []).filter(Boolean).filter((id) => !usedThisWeek.has(id));
  if (list.length === 0) return "";
  // Orden: menos total en el mes, luego menos veces en ese rol, luego rotación local (último uso)
  const lastUsedKey = (id) => `lastUsed_${roleKey}_${id}`;
  const getLastUsed = (id) => parseInt(localStorage.getItem(lastUsedKey(id)) || "0", 10);

  list.sort((a, b) => {
    const ca = counts[a] || { total: 0, roles: {} };
    const cb = counts[b] || { total: 0, roles: {} };
    const ta = ca.total || 0, tb = cb.total || 0;
    if (ta !== tb) return ta - tb;
    const ra = (ca.roles && ca.roles[roleKey]) ? ca.roles[roleKey] : 0;
    const rb = (cb.roles && cb.roles[roleKey]) ? cb.roles[roleKey] : 0;
    if (ra !== rb) return ra - rb;
    return getLastUsed(a) - getLastUsed(b);
  });

  return list[0] || "";
}

function markLastUsed(roleKey, personaId) {
  if (!personaId) return;
  localStorage.setItem(`lastUsed_${roleKey}_${personaId}`, String(Date.now()));
}

function applyMesWeekSuggestion(targetWeekKey) {
  // Usa lo ya cargado del mes (lastMesDoc) para mantener equidad, y rellena la semana seleccionada.
  if (!lastMesDoc) lastMesDoc = { semanas: {} };
  if (!lastMesDoc.semanas) lastMesDoc.semanas = {};

  const counts = monthUsageCounts(lastMesDoc);
  const used = new Set();

  // Respeta lo ya elegido manualmente: si ya hay valores, se toman como "usados"
  const current = formMesData();
  Object.values(current).forEach((pid) => pid && used.add(pid));

  const platforma = getVal("mesPlataforma") || pickFairCandidate(candidates.plataforma, counts, "plataforma", used);
  used.add(platforma);

  const acomEnt = getVal("mesAcomodadorEntrada") || pickFairCandidate(candidates.acomodadores, counts, "acomodadorEntrada", used);
  used.add(acomEnt);

  const acomAud1 = getVal("mesAcomodadorAuditorio1") || pickFairCandidate(candidates.acomodadores, counts, "acomodadorAuditorio1", used);
  used.add(acomAud1);

  const mm1 = getVal("mesMultimedia1") || pickFairCandidate(candidates.multimedia, counts, "multimedia", used);
  used.add(mm1);

  const mm2 = getVal("mesMultimedia2") || pickFairCandidate(candidates.multimedia, counts, "multimedia", used);
  used.add(mm2);

  const mic1 = getVal("mesMicrofonista1") || pickFairCandidate(candidates.microfonistas, counts, "microfonista", used);
  used.add(mic1);

  const mic2 = getVal("mesMicrofonista2") || pickFairCandidate(candidates.microfonistas, counts, "microfonista", used);
  used.add(mic2);

  // Asigna al UI
  [
    ["mesPlataforma", platforma],
    ["mesAcomodadorEntrada", acomEnt],
    ["mesAcomodadorAuditorio1", acomAud1],
    ["mesMultimedia1", mm1],
    ["mesMultimedia2", mm2],
    ["mesMicrofonista1", mic1],
    ["mesMicrofonista2", mic2],
  ].forEach(([sid, pid]) => {
    ensureOptionById(sid, pid);
    setVal(sid, pid || "");
  });

  // Guarda en memoria (no en Firestore aún)
  const wk = targetWeekKey || currentMesSemana();
  lastMesDoc.semanas[wk] = formMesData();

  // Marca uso para el criterio de desempate local
  markLastUsed("plataforma", platforma);
  markLastUsed("acomodadorEntrada", acomEnt);
  markLastUsed("acomodadorAuditorio1", acomAud1);
  markLastUsed("multimedia", mm1);
  markLastUsed("multimedia", mm2);
  markLastUsed("microfonista", mic1);
  markLastUsed("microfonista", mic2);
}

function sugerirSemanaEquitativa() {
  const mesISO = (getVal("mes") || "").trim();
  if (!mesISO) return setStatus("Elegí un mes primero.", true);
  applyMesWeekSuggestion(currentMesSemana());
  renderMesPreview(mesISO, lastMesDoc);
  setStatus("Sugerencia aplicada a la semana seleccionada. Ajustá si hace falta y guardá.");
}

function sugerirMesCompleto() {
  const mesISO = (getVal("mes") || "").trim();
  if (!mesISO) return setStatus("Elegí un mes primero.", true);
  // genera sugerencias para todas las semanas del mes
  const sel = $("mesSemana");
  if (!sel) return;
  const weeks = Array.from(sel.options).map((o) => String(o.value)).filter(Boolean);
  if (!lastMesDoc) lastMesDoc = { semanas: {} };
  if (!lastMesDoc.semanas) lastMesDoc.semanas = {};

  const prevWeek = currentMesSemana();
  weeks.forEach((wk) => {
    // cambia selección para que hydrate/sets funcionen coherentemente
    setVal("mesSemana", wk);
    hydrateMesToUI(lastMesDoc); // carga si ya existía
    applyMesWeekSuggestion(wk); // sugiere completando faltantes sin pisar lo ya elegido
  });
  setVal("mesSemana", prevWeek);
  hydrateMesToUI(lastMesDoc);

  renderMesPreview(mesISO, lastMesDoc);
  setStatus("Sugerencias generadas para todo el mes. Revisá semana por semana y guardá cada una.");
}

async function cargarMes() {
  const mesISO = (getVal("mes") || "").trim();
  if (!mesISO) return setStatus("Elegí un mes.", true);
  setStatus("Cargando mes…");
  try {
    const snap = await getDoc(doc(db, COL_MES, mesISO));
    if (snap.exists()) {
      const data = snap.data() || {};
      lastMesDoc = data;
      hydrateMesToUI(data);
      renderMesPreview(mesISO, data);
      setStatus("Mes cargado.");
    } else {
      lastMesDoc = { semanas: {} };
      hydrateMesToUI(lastMesDoc);
      renderMesPreview(mesISO, null);
      setStatus("No hay datos para ese mes. Completá y guardá.");
    }
  } catch (e) {
    console.error(e);
    setStatus("Error cargando el mes. Revisá permisos de Firestore.", true);
  }
}

async function guardarMes() {
  const mesISO = (getVal("mes") || "").trim();
  if (!mesISO) return setStatus("Elegí un mes.", true);
  setStatus("Guardando mes…");
  setBusy("btnGuardarMes", true, "Guardando…");
  const weekKey = currentMesSemana();
  const weekData = formMesData();
  try {
    await setDoc(
      doc(db, COL_MES, mesISO),
      {
        semanas: { [weekKey]: weekData },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const snap = await getDoc(doc(db, COL_MES, mesISO));
    const data = snap.exists()
      ? snap.data() || {}
      : { semanas: { [weekKey]: weekData } };
    lastMesDoc = data;
    renderMesPreview(mesISO, data);
    setStatus("Mes guardado OK.");
  } catch (e) {
    console.error(e);
    setStatus("No pude guardar el mes. Revisá permisos de Firestore.", true);
  } finally {
    setBusy("btnGuardarMes", false);
  }
}

function imprimirMes() {
  const mesISO = (getVal("mes") || "").trim();
  if (!mesISO) return setStatus("Elegí un mes.", true);
  (async () => {
    try {
      const snap = await getDoc(doc(db, COL_MES, mesISO));
      if (snap.exists()) renderMesPreview(mesISO, snap.data() || {});
      else
        renderMesPreview(mesISO, {
          semanas: { [currentMesSemana()]: formMesData() },
        });
    } catch (e) {
      console.error(e);
      renderMesPreview(mesISO, { semanas: { [currentMesSemana()]: formMesData() } });
    }
    document.body.classList.add("print-mes");
    const cleanup = () => document.body.classList.remove("print-mes");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1200);
  })();
}

async function cargarPersonas() {
  const snap = await getDocs(collection(db, "personas"));
  personas = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p?.nombre);
  personas.sort((a, b) =>
    displayName(a).localeCompare(displayName(b), "es", { sensitivity: "base" })
  );
  window.__personasCache = personas.slice();
}

function fillSelect(id, filterFn) {
  const sel = $(id);
  if (!sel) return;
  const current = String(sel.value || "").trim();
  sel.innerHTML = "";
  addOpt(sel, "", "— Seleccionar —");
  for (const p of personas) {
    if (p?.activo === false) continue;
    if (filterFn(p)) addOpt(sel, p.id, displayName(p));
  }
  if (current) {
    const existing = Array.from(sel.options).some((o) => o.value === current);
    if (!existing) {
      const p = personas.find((x) => x.id === current);
      if (p?.nombre) addOpt(sel, p.id, `${displayName(p)} (inactivo)`);
    }
    sel.value = current;
  }
}

function poblarSelects() {
  const ancSiervos = getAncianosOSiervos(personas);
  const ancianos = getAncianos(personas);
  const acomodadores = getAcomodadores(personas);
  const plataforma = getPlataforma(personas);
  const multimedia = getMultimedia(personas);
  const microfonistas = getMicrofonistas(personas);
  const lectoresAtalaya = getLectoresAtalaya(personas);

  // cache de candidatos (para sugerencias/rotación)
  candidates.multimedia = (multimedia || []).map(p=>p.id);
  candidates.plataforma = (plataforma || []).map(p=>p.id);
  candidates.acomodadores = (acomodadores || []).map(p=>p.id);
  candidates.microfonistas = (microfonistas || []).map(p=>p.id);

  const byIds = (arr) => {
    const set = new Set((arr || []).map((p) => p.id));
    return (p) => set.has(p.id);
  };

  fillSelect("presidente", byIds(ancSiervos));
  fillSelect("oracionInicial", byIds(ancSiervos));
  fillSelect("oracionFinal", (p) => p?.activo !== false);
  // Opción especial: oración final por el orador visitante
  const ofSel = $("oracionFinal");
  if (ofSel && !Array.from(ofSel.options).some(o => o.value === "__VISITANTE__")) {
    const opt = document.createElement("option");
    opt.value = "__VISITANTE__";
    opt.textContent = "Orador visitante";
    ofSel.insertBefore(opt, ofSel.firstChild);
  }
fillSelect("lectorAtalaya", byIds(lectoresAtalaya));

  fillSelect("conductorAtalaya", byIds(ancianos));

  fillSelect("multimedia1", byIds(multimedia));
  fillSelect("multimedia2", byIds(multimedia));

  fillSelect("mesMultimedia1", byIds(multimedia));
  fillSelect("mesMultimedia2", byIds(multimedia));

  fillSelect("plataforma", byIds(plataforma));
  fillSelect("mesPlataforma", byIds(plataforma));

  fillSelect("acomodadorEntrada", byIds(acomodadores));
  fillSelect("acomodadorAuditorio1", byIds(acomodadores));

  fillSelect("mesAcomodadorEntrada", byIds(acomodadores));
  fillSelect("mesAcomodadorAuditorio1", byIds(acomodadores));

  fillSelect("microfonista1", byIds(microfonistas));
  fillSelect("microfonista2", byIds(microfonistas));

  fillSelect("mesMicrofonista1", byIds(microfonistas));
  fillSelect("mesMicrofonista2", byIds(microfonistas));
}

// ---------------- Rotación / sugerencias ----------------
function nextFromRotation(key, ids){
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if(list.length === 0) return "";
  const k = `rot_${key}`;
  const idx0 = parseInt(localStorage.getItem(k) || "0", 10);
  const idx = Number.isFinite(idx0) ? idx0 : 0;
  const chosen = list[idx % list.length];
  localStorage.setItem(k, String((idx + 1) % list.length));
  return chosen;
}

function suggestSelect(selectId, key, ids){
  if (["multimedia1","multimedia2","plataforma","acomodadorEntrada","acomodadorAuditorio1","microfonista1","microfonista2"].includes(selectId)) {
    return suggestSupportSelect(selectId, ids);
  }
  if (selectId === "plataforma") {
    return suggestByRoleHistory(selectId, "plataforma", ids);
  }
  if(!isAdmin) return;
  const sel = $(selectId);
  if(!sel) return;
  const current = sel.value;
  let chosen = nextFromRotation(key, ids);
  if(chosen && chosen === current && (ids||[]).length > 1){
    chosen = nextFromRotation(key, ids);
  }
  if(chosen) sel.value = chosen;
}

// ---------------- Autocompletado canción y discurso por número ----------------
const cancionesMap = new Map(Object.entries(canciones).map(([k, v]) => [Number(k), String(v)]));
const bosquejosMap = new Map(Object.entries(bosquejos).map(([k, v]) => [Number(k), String(v)]));
let lastAutoTituloDiscurso = "";

function normNumero(v) {
  const n = parseInt(String(v || "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function aplicarAutoCancion() {
  const num = normNumero(getVal("cancionNumero"));
  if (!num) return;
  // no hay campo cancionTitulo en el formulario, pero lo dejamos para imprimir
}

function aplicarAutoDiscurso() {
  const elOut = document.getElementById("discursoTituloAuto");
  const num = normNumero(getVal("discursoNumero"));
  const tituloInput = $("tituloDiscurso");
  if (!num) {
    if (elOut) elOut.textContent = "—";
    if (tituloInput) {
      const cur = String(tituloInput.value || "").trim();
      if (lastAutoTituloDiscurso && cur === lastAutoTituloDiscurso) {
        tituloInput.value = "";
      }
    }
    lastAutoTituloDiscurso = "";
    return;
  }
  const t = String(bosquejosMap.get(num) || "").trim();
  if (elOut) elOut.textContent = t ? `Bosquejo ${num}: ${t}` : `Bosquejo ${num}: no encontrado`;
  if (tituloInput) {
    const cur = String(tituloInput.value || "").trim();
    if (!cur || cur === lastAutoTituloDiscurso) {
      tituloInput.value = t;
    }
  }
  lastAutoTituloDiscurso = t;
}


// ---------------- Visitantes (Firestore + fallback local) ----------------
function cleanText(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const t = cleanText(v);
    if (t) return t;
  }
  return "";
}

function firstNumberLike(...values) {
  for (const v of values) {
    const t = cleanText(v);
    if (!t) continue;
    const n = parseInt(t, 10);
    if (Number.isFinite(n)) return n;
  }
  return "";
}

function normalizarVisitante(raw, id = "") {
  if (!raw) return null;
  const tipo = cleanText(raw.tipo || raw.clase).toLowerCase();
  if (tipo === "evento") return null;

  const v = {
    id: id || raw.id || raw.fecha || "",
    fecha: raw.fecha || id || "",
    nombre: firstNonEmpty(raw.nombre, raw.orador, raw.oradorPublico, raw.conferenciante, raw.hermano),
    congregacion: firstNonEmpty(raw.congregacion, raw.congregacionVisitante, raw["congregación"], raw.origen, raw.deDondeViene),
    bosquejo: firstNumberLike(raw.bosquejo, raw.discursoNumero, raw.numeroDiscurso, raw.numero, raw.nroBosquejo, raw.nro),
    cancion: firstNumberLike(raw.cancion, raw.cancionNumero, raw["cántico"], raw.cantico),
    titulo: firstNonEmpty(raw.titulo, raw.tituloDiscurso, raw["título"], raw.tema, raw.nombreDiscurso),
    observaciones: firstNonEmpty(raw.observaciones, raw.notas),
    hospitalidad: firstNonEmpty(raw.hospitalidad, raw.hospedaje),
  };

  return (v.nombre || v.congregacion || v.bosquejo || v.titulo) ? v : null;
}

function fechasCompatiblesVisitante(fechaISO) {
  return [fechaISO, addDaysISO(fechaISO, 1), addDaysISO(fechaISO, -1)].filter(Boolean);
}

function localVisitanteFor(fechaISO) {
  for (const f of fechasCompatiblesVisitante(fechaISO)) {
    const v = normalizarVisitante(visitantesLocal[f], f);
    if (v) return v;
  }
  return null;
}

async function firestoreVisitFor(fechaISO) {
  for (const f of fechasCompatiblesVisitante(fechaISO)) {
    try {
      const snap = await getDoc(doc(db, "visitas", f));
      if (snap.exists()) {
        const v = normalizarVisitante({ id: snap.id, ...snap.data() }, snap.id);
        if (v) return v;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

function pickNextFrom(ids, storageKey) {
  const list = Array.from(new Set((ids || []).filter(Boolean)));
  if (!list.length) return "";
  const idx0 = parseInt(localStorage.getItem(storageKey) || "0", 10);
  const idx = Number.isFinite(idx0) ? idx0 : 0;
  const chosen = list[idx % list.length] || "";
  localStorage.setItem(storageKey, String((idx + 1) % list.length));
  return chosen;
}

async function sugerirPresidente(){
  if(!window.__personasCache) return "";
  const presidentes = getPresidentes(window.__personasCache) || [];
  const exclNames = new Set([normalize(MARCELO_CONDUCTOR_NOMBRE)]);
  const excl = [getVal("conductorAtalaya"), getVal("lectorAtalaya"), getVal("oracionInicial")];
  const candidatos = presidentes
    .filter(p => p && p.id && p.nombre)
    // Marcelo se reserva para conducir La Atalaya, salvo asignación manual del usuario.
    .filter(p => !exclNames.has(normalize(p.nombre || "")))
    .map(p => p.id);
  return await suggestByRoleHistory("presidente", "presidente", candidatos, excl);
}

async function sugerirConductorAtalaya(){
  if(!window.__personasCache) return "";
  const conductores = getConductoresAtalaya(window.__personasCache) || [];
  const anc = getAncianos(window.__personasCache) || [];
  const baseConductores = conductores.length ? conductores : anc;
  const candidatos = baseConductores.filter(p=>p && p.id && p.nombre).map(p=>p.id);
  const marcelo = baseConductores.find(p => normalize(p?.nombre || "") === normalize(MARCELO_CONDUCTOR_NOMBRE)) || anc.find(p => normalize(p?.nombre || "") === normalize(MARCELO_CONDUCTOR_NOMBRE));
  const salidaMarcelo = marcelo ? await marceloTieneSalidaFinDeSemana(semanaISO() || upcomingSaturdayISO()) : false;
  const marceloUsadoEnOtraAsignacion = marcelo ? selectedIdsThisWeek("conductorAtalaya").has(marcelo.id) : false;

  // Regla fija: Conductor de La Atalaya = Marcelo Palavecino.
  // Excepción: si ese fin de semana Marcelo tiene salida para dar discurso, se sugiere otro anciano.
  if (marcelo?.id && !salidaMarcelo && !marceloUsadoEnOtraAsignacion) {
    const sel = $("conductorAtalaya");
    if (sel) {
      sel.value = marcelo.id;
      updateRoleHistory("conductorAtalaya", marcelo.id, semanaISO() || isoToday());
      markSuggestedLocal("conductorAtalaya", marcelo.id);
      return marcelo.id;
    }
  }

  const hardExcluded = salidaMarcelo && marcelo?.id ? [marcelo.id] : [];
  const chosen = await suggestByRoleHistory(
    "conductorAtalaya",
    "conductorAtalaya",
    candidatos,
    [getVal("presidente"), getVal("lectorAtalaya")],
    hardExcluded
  );

  if (salidaMarcelo && !chosen) {
    setStatus("Marcelo Palavecino tiene salida ese fin de semana y no encontré otro anciano disponible para conducir La Atalaya.", true);
  }
  return chosen;
}

async function sugerirLectorAtalaya(){
  if(!window.__personasCache) return "";
  const lectores = getLectoresAtalaya(window.__personasCache) || [];
  const candidatos = lectores.filter(p=>p && p.id && p.nombre).map(p=>p.id);
  const marcelo = personaByName(MARCELO_CONDUCTOR_NOMBRE);
  const salidaMarcelo = marcelo ? await marceloTieneSalidaFinDeSemana(semanaISO() || upcomingSaturdayISO()) : false;
  return await suggestByRoleHistory(
    "lectorAtalaya",
    "lectorAtalaya",
    candidatos,
    [getVal("presidente"), getVal("conductorAtalaya")],
    salidaMarcelo && marcelo?.id ? [marcelo.id] : []
  );
}

function autoPresidenteIfNeeded(){
  if(getVal("presidente").trim()) return;
  sugerirPresidente();
}

async function sugerirOracionInicial(){
  if(!window.__personasCache) return "";
  const pool = (getOradoresOracion(window.__personasCache) || []);
  const candidatos = pool
    .filter(p=>p && p.id && p.nombre)
    .map(p=>p.id);
  const marcelo = personaByName(MARCELO_CONDUCTOR_NOMBRE);
  const salidaMarcelo = marcelo ? await marceloTieneSalidaFinDeSemana(semanaISO() || upcomingSaturdayISO()) : false;
  return await suggestByRoleHistory(
    "oracionInicial",
    "oracionInicial",
    candidatos,
    [getVal("lectorAtalaya"), getVal("conductorAtalaya"), getVal("presidente")],
    salidaMarcelo && marcelo?.id ? [marcelo.id] : []
  );
}

function autoOracionInicialIfNeeded(){
  const oi = getVal("oracionInicial");
  if(!oi){
    return sugerirOracionInicial();
  }
}

async function precargarAsignacionesAutomaticas(opts = {}) {
  if (!isAdmin) return;
  const soloVacios = opts?.soloVacios !== false;

  const completarSiVacio = async (fieldId, fn) => {
    if (!$(fieldId)) return;
    if (soloVacios && getVal(fieldId)) return;
    await fn();
  };

  await completarSiVacio("presidente", () => sugerirPresidente());
  // Reservamos a Marcelo Palavecino para conductor de La Atalaya antes de sugerir otros campos.
  await completarSiVacio("conductorAtalaya", () => sugerirConductorAtalaya());
  await completarSiVacio("oracionInicial", () => sugerirOracionInicial());
  await completarSiVacio("lectorAtalaya", () => sugerirLectorAtalaya());
  await completarSiVacio("multimedia1", () => suggestSelect("multimedia1", "multimedia", candidates.multimedia));
  await completarSiVacio("multimedia2", () => suggestSelect("multimedia2", "multimedia", candidates.multimedia));
  await completarSiVacio("plataforma", () => suggestSelect("plataforma", "plataforma", candidates.plataforma));
  await completarSiVacio("acomodadorEntrada", () => suggestSelect("acomodadorEntrada", "acomodadores", candidates.acomodadores));
  await completarSiVacio("acomodadorAuditorio1", () => suggestSelect("acomodadorAuditorio1", "acomodadores", candidates.acomodadores));
  await completarSiVacio("microfonista1", () => suggestSelect("microfonista1", "microfonista", candidates.microfonistas));
  await completarSiVacio("microfonista2", () => suggestSelect("microfonista2", "microfonista", candidates.microfonistas));
}

async function aplicarAutoVisitante(fechaISO, opts = {}) {
  const force = opts?.force !== false; // por defecto sincroniza con la solapa Visitantes.
  const visitante = (await firestoreVisitFor(fechaISO)) || localVisitanteFor(fechaISO);
  if (!visitante) {
    updateOracionFinalVisitorOptionLabel();
    autoOracionFinal(false);
    return null;
  }

  const setFromVisitor = (fieldId, value) => {
    const val = cleanText(value);
    if (!val) return;
    if (force || !getVal(fieldId).trim()) setVal(fieldId, val);
  };

  setFromVisitor("oradorPublico", visitante.nombre);
  setFromVisitor("congregacionVisitante", visitante.congregacion);
  if (visitante.cancion) setFromVisitor("cancionNumero", String(visitante.cancion));
  if (visitante.bosquejo) {
    setFromVisitor("discursoNumero", String(visitante.bosquejo));
    aplicarAutoDiscurso();
  }
  if (visitante.titulo) {
    setFromVisitor("tituloDiscurso", visitante.titulo);
    lastAutoTituloDiscurso = visitante.titulo;
  }

  updateOracionFinalVisitorOptionLabel();
  autoOracionFinal(Boolean(force));
  return visitante;
}

function oracionFinalAutoTexto(){
  const visitante = (getVal("oradorPublico") || "").trim();
  const presId = (getVal("presidente") || "").trim();
  const presidente = (personaNameById(presId) || "").trim();
  if (visitante && presidente) return `Visitante ${visitante}/${presidente}`;
  if (visitante) return `Visitante ${visitante}`;
  if (presidente) return presidente;
  return "";
}

function updateOracionFinalVisitorOptionLabel(){
  const ofSel = $("oracionFinal");
  if(!ofSel) return;
  const opt = Array.from(ofSel.options).find(o => o.value === "__VISITANTE__");
  if(!opt) return;
  opt.textContent = oracionFinalAutoTexto() || "Orador visitante";
}

function isAutoOracionFinalValue(value){
  const v = String(value || "").trim();
  if(!v || v === "__VISITANTE__") return true;
  const visitante = (getVal("oradorPublico") || "").trim();
  const presId = (getVal("presidente") || "").trim();
  const presidente = (personaNameById(presId) || "").trim();
  const posibles = new Set([
    oracionFinalAutoTexto(),
    visitante,
    presidente,
    visitante && presidente ? `${visitante}/${presidente}` : "",
    visitante ? `Visitante ${visitante}` : "",
    visitante && presidente ? `Visitante ${visitante}/${presidente}` : ""
  ].filter(Boolean));
  return posibles.has(v);
}

function ensureOracionFinalOption(value){
  const sel = $("oracionFinal");
  const v = String(value || "").trim();
  if(!sel || !v) return;
  let opt = Array.from(sel.options).find(x => (x.value || "").trim() === v);
  if(!opt){
    opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }else{
    opt.textContent = v;
  }
}

function autoOracionFinal(force = false){
  const sel = document.getElementById("oracionFinal");
  if(!sel) return;

  const v = oracionFinalAutoTexto();
  if(!v){
    if(force || !sel.value || isAutoOracionFinalValue(sel.value)){
      sel.value = "";
      sel.dataset.manual = "0";
    }
    return;
  }

  if(!force && sel.value && sel.dataset.manual === "1" && !isAutoOracionFinalValue(sel.value)) return;

  ensureOracionFinalOption(v);
  sel.value = v;
  sel.dataset.manual = "0";
}

function oracionFinalValueForSave(){
  const sel = $("oracionFinal");
  const v = String(sel?.value || "").trim();
  if(v === "__VISITANTE__") return oracionFinalAutoTexto();
  return v;
}


// ---------------- Guardar / cargar ----------------
function semanaISO() {
  return (getVal("semana") || "").trim();
}

function setSemanaISO(iso) {
  if (!iso) return;
  setVal("semana", iso);
}

async function goToSemana(iso) {
  if (!iso) return;

  // Usuarios (no admin): no permitir navegar a fechas pasadas
  if(!isAdmin){
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const hoyISO = hoy.toISOString().slice(0,10);
    if(String(iso).slice(0,10) < hoyISO){
      iso = upcomingSaturdayISO(); // referencia sugerida
      setStatus("Solo se muestran asignaciones desde hoy en adelante.");
    }
  }

  setSemanaISO(iso);
  await cargarSemana();
  generarAviso();
}

async function copiarSemanaAnterior() {
  const s = semanaISO();
  if (!s) return setStatus("Elegí una semana (fecha).", true);
  const prev = shiftWeekISO(s, -1);
  if (!prev) return;

  setStatus("Copiando semana anterior…");
  try {
    const snap = await getDoc(doc(db, "asignaciones", prev));
    if (!snap.exists()) {
      return setStatus("La semana anterior no tiene datos guardados.", true);
    }
    const data = snap.data();
    const a = data.asignaciones || data;
    hydrateToUI(a);
    await aplicarAutoVisitante(s, { force: true });
    setStatus("Listo: copié la semana anterior. Revisá y Guardá.");
    generarAviso();
  } catch (e) {
    console.error(e);
    setStatus("No pude copiar. Revisá consola (F12) y permisos.", true);
  }
}


function formData() {
  const tipo = semanaTipo();
  if (isSemanaEspecialValue(tipo)) {
    return blankAssignmentsData({ tipoSemana: tipo });
  }
  return {
    presidenteId: getVal("presidente"),
    oracionInicialId: getVal("oracionInicial"),
    oracionFinalId: oracionFinalValueForSave(),
    conductorAtalayaId: getVal("conductorAtalaya"),
    lectorAtalayaId: getVal("lectorAtalaya"),
    multimedia1Id: getVal("multimedia1"),
    multimedia2Id: getVal("multimedia2"),
    plataformaId: getVal("plataforma"),
    microfonista1Id: getVal("microfonista1"),
    microfonista2Id: getVal("microfonista2"),
    acomodadorEntradaId: getVal("acomodadorEntrada"),
    acomodadorAuditorio1Id: getVal("acomodadorAuditorio1"),
    acomodadorAuditorio2Id: "", // Villa Fiad usa un solo acomodador de auditorio. Se deja vacío por compatibilidad con datos viejos.

    cancionNumero: getVal("cancionNumero"),
    oradorPublico: getVal("oradorPublico"),
    congregacionVisitante: getVal("congregacionVisitante"),
    discursoNumero: getVal("discursoNumero"),
    tituloDiscurso: getVal("tituloDiscurso"),
    tituloSiguienteSemana: getVal("tituloSiguienteSemana"),
    tipoSemana: tipo,
  };
}

function hydrateToUI(a) {
  if (!a) return;

  setVal("tipoSemana", a.tipoSemana || "normal");
  updateSemanaEspecialUI();

  [
    ["presidente", a.presidenteId],
    ["oracionInicial", a.oracionInicialId],
    ["oracionFinal", a.oracionFinalId],
    ["conductorAtalaya", a.conductorAtalayaId],
    ["lectorAtalaya", a.lectorAtalayaId],
    ["multimedia1", a.multimedia1Id],
    ["multimedia2", a.multimedia2Id],
    ["plataforma", a.plataformaId],
    ["microfonista1", a.microfonista1Id],
    ["microfonista2", a.microfonista2Id],
    ["acomodadorEntrada", a.acomodadorEntradaId],
    // Compatibilidad: antes existía un solo campo "acomodadorAuditorioId".
    // Ahora Villa Fiad usa un solo campo de auditorio.
    ["acomodadorAuditorio1", a.acomodadorAuditorio1Id || a.acomodadorAuditorioId],
  ].forEach(([sid, pid]) => ensureOptionById(sid, pid));

  setVal("presidente", a.presidenteId || "");
  setVal("oracionInicial", a.oracionInicialId || "");
  setVal("oracionFinal", a.oracionFinalId || "");
  const ofSel = $("oracionFinal");
  if (ofSel) ofSel.dataset.manual = a.oracionFinalId ? "1" : "0";
  setVal("conductorAtalaya", a.conductorAtalayaId || "");
  setVal("lectorAtalaya", a.lectorAtalayaId || "");
  setVal("multimedia1", a.multimedia1Id || "");
  setVal("multimedia2", a.multimedia2Id || "");
  setVal("plataforma", a.plataformaId || "");
  setVal("microfonista1", a.microfonista1Id || "");
  setVal("microfonista2", a.microfonista2Id || "");
  setVal("acomodadorEntrada", a.acomodadorEntradaId || "");
  setVal("acomodadorAuditorio1", a.acomodadorAuditorio1Id || a.acomodadorAuditorioId || "");
  setVal("acomodadorAuditorio2", "");

  setVal("cancionNumero", a.cancionNumero || "");
  setVal("oradorPublico", a.oradorPublico || "");
  setVal("congregacionVisitante", a.congregacionVisitante || "");
  setVal("discursoNumero", a.discursoNumero || "");
  setVal("tituloDiscurso", a.tituloDiscurso || "");
  setVal("tituloSiguienteSemana", a.tituloSiguienteSemana || "");
  aplicarAutoDiscurso();
}


function validateRequired() {
  if (isSemanaEspecial()) return "";
  const required = [
    { id: "plataforma", label: "Plataforma" },
    { id: "acomodadorEntrada", label: "Acomodador Entrada" },
    { id: "acomodadorAuditorio1", label: "Acomodador Auditorio 1" },
    { id: "multimedia1", label: "Multimedia 1" },
    { id: "multimedia2", label: "Multimedia 2" },
  ];
  const missing = required.filter((r) => !getVal(r.id));
  if (missing.length) {
    return "Faltan campos: " + missing.map((m) => m.label).join(", ") + ".";
  }
  return "";
}

function validateNoDuplicates() {
  if (isSemanaEspecial()) return null;
  const fields = [
    { id: "presidente", label: "Presidente" },
    { id: "oracionInicial", label: "Oración inicial" },
    { id: "conductorAtalaya", label: "Conductor La Atalaya" },
    { id: "lectorAtalaya", label: "Lector La Atalaya" },
    { id: "multimedia1", label: "Multimedia 1" },
    { id: "multimedia2", label: "Multimedia 2" },
    { id: "plataforma", label: "Acomodador de plataforma" },
    { id: "acomodadorEntrada", label: "Acomodador Entrada" },
    { id: "acomodadorAuditorio1", label: "Acomodador Auditorio 1" },
    { id: "microfonista1", label: "Microfonista 1" },
    { id: "microfonista2", label: "Microfonista 2" },
  ];
  const chosen = fields.map((f) => ({ ...f, value: getVal(f.id) })).filter((x) => x.value);

  const seen = new Map();
  for (const c of chosen) {
    if (seen.has(c.value)) {
      const a = seen.get(c.value);
      const p = personas.find((pp) => pp.id === c.value);
      const name = p ? displayName(p) : "(persona)";
      return `No podés asignar a ${name} en ${a.label} y ${c.label}.`;
    }
    seen.set(c.value, c);
  }
  return null;
}

async function cargarSemana() {
  const s = semanaISO();
  if (!s) return setStatus("Elegí una semana (fecha).", true);

  setStatus("Cargando…");
  try {
    const snap = await getDoc(doc(db, "asignaciones", s));
    if (snap.exists()) {
      const data = snap.data();
      const a = data.asignaciones || data;
      hydrateToUI(a);
      await aplicarAutoVisitante(s, { force: true });
      try{ await precargarAsignacionesAutomaticas({ soloVacios: true }); }catch(_e){}
      try{ autoPresidenteIfNeeded(); }catch(_e){}
      // refresca aviso
      try{ await generarAviso(); }catch(_e){}
      setStatus("Datos cargados. Si había campos vacíos, se completaron sugerencias automáticas sin repetir funciones.");
    } else {
      hydrateToUI(blankAssignmentsData({ tipoSemana: "normal" }));
      updateSemanaEspecialUI();
      setStatus("No hay datos guardados para esta semana. Hice una precarga automática sin repetir funciones. Revisá y guardá.");
      await aplicarAutoVisitante(s, { force: true });
      try{ await precargarAsignacionesAutomaticas({ soloVacios: true }); }catch(_e){}
      try{ autoPresidenteIfNeeded(); }catch(_e){}
      setAvisoText("");
    }
  } catch (e) {
    console.error(e);
    setStatus("Error cargando datos. Revisá consola (F12) y permisos de Firestore.", true);
  }
}

async function guardar() {
  const s = semanaISO();
  if (!s) return setStatus("Elegí una semana (fecha).", true);


  const miss = validateRequired();
  if (miss) return setStatus(miss, true);

  const dup = validateNoDuplicates();
  if (dup) return setStatus(dup, true);

  setStatus("Guardando…");
  setBusy("btnGuardar", true, "Guardando…");
  const data = formData();

  try {
    await setDoc(
      doc(db, "asignaciones", s),
      {
        asignaciones: data,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    
    // Si estás guardando una reunión de fin de semana (sábado/domingo),
    // copiamos automáticamente acomodadores/multimedia/microfonistas al jueves anterior (sin pisar lo ya cargado).
    try{
      await copiarAsignadosAlJuevesSiCorresponde(s, data);
    }catch(e){
      console.warn("No pude copiar asignados al jueves anterior:", e);
    }

setStatus("Guardado con éxito.");
    // deja el aviso listo para WhatsApp
    generarAviso();
  } catch (e) {
    console.error(e);
    const detail = e?.message || e?.code || String(e);
    setStatus(`No pude guardar: ${detail}`, true);
  } finally {
    setBusy("btnGuardar", false);
  }
}

function limpiar() {
  [
    "presidente",
    "oracionInicial",
    "oracionFinal",
    "conductorAtalaya",
    "lectorAtalaya",
    "multimedia1",
    "multimedia2",
    "plataforma",
    "microfonista1",
    "microfonista2",
    "acomodadorEntrada",
    "acomodadorAuditorio1",
      "cancionNumero",
    "oradorPublico",
    "congregacionVisitante",
    "discursoNumero",
    "tituloDiscurso",
    "tituloSiguienteSemana",
  ].forEach((id) => setVal(id, ""));
  setVal("tipoSemana", "normal");
  updateSemanaEspecialUI();
  setStatus("Formulario limpio.");
}

function abrirPdfPresidente() {
  const s = semanaISO();
  if (!s) return setStatus("Elegí una semana primero.", true);
  // Abrir en nueva pestaña y activar impresión automática
  window.open(`presidente.html?semana=${encodeURIComponent(s)}&auto=1`, "_blank");
}

// ---------------- Aviso semanal (acomodadores + multimedia) ----------------
function buildAvisoSemanal(semanaSatISO, a) {
  const sab = semanaSatISO;
  const jue = addDaysISO(semanaSatISO, -2);

  if (isSemanaEspecialValue(a?.tipoSemana)) {
    const tipo = semanaEspecialLabel(a?.tipoSemana);
    return [
      `*${tipo}*`,
      `Semana: Jueves ${fmtAR(jue)} · Sábado ${fmtAR(sab)}`,
      `No hay reuniones ni asignados esta semana.`
    ].join("\n");
  }

  const m1 = personaNameById(a?.multimedia1Id) || "—";
  const m2 = personaNameById(a?.multimedia2Id) || "—";
  const plat = personaNameById(a?.plataformaId) || "—";
  const ent = personaNameById(a?.acomodadorEntradaId) || "—";
  const aud = personaNameById(a?.acomodadorAuditorio1Id || a?.acomodadorAuditorioId) || "—";
  const pres = personaNameById(a?.presidenteId) || "—";
  const visitante = (a?.oradorPublico || "").trim();

  const lines = [];
  lines.push(`*Asignaciones de esta semana*`);
  lines.push(`Jueves ${fmtAR(jue)} (20:00) y Sábado ${fmtAR(sab)} (19:30)`);
  lines.push("");
  if(visitante){
    lines.push(`*Orador visitante*`);
    lines.push(`• ${visitante}/${pres}`);
    lines.push("");
  }
  lines.push(`*Acomodadores*`);
  lines.push(`• Plataforma: ${plat}`);
  lines.push(`• Entrada: ${ent}`);
  lines.push(`• Auditorio: ${aud}`);
  lines.push("");
  lines.push(`*Multimedia*`);
  lines.push(`• ${m1} / ${m2}`);
  return lines.join("\n");
}

// ---------------- Impresión semanal (A4 en 1 hoja, 2 columnas) ----------------
function oracionFinalTexto(a){
  const visitante = (a?.oradorPublico || "").trim();
  const pres = personaNameById(a?.presidenteId) || (a?.presidente || "");
  if(visitante && pres) return `${visitante}/${pres}`; // sin espacios
  return pres || visitante || "";
}

function buildPrintSemanaHTML(semanaSatISO, a){
  const sab = semanaSatISO;
  const jue = addDaysISO(semanaSatISO, -2);

  if (isSemanaEspecialValue(a?.tipoSemana)) {
    const tipo = semanaEspecialLabel(a?.tipoSemana);
    return `
      <div class="print-grid">
        <div class="p-card" style="grid-column:1 / -1;">
          <div class="p-h">Asignados Villa Fiad</div>
          <div class="p-sub">Semana: Jueves ${fmtAR(jue)} (20:00) · Sábado ${fmtAR(sab)} (19:30)</div>
          <div class="p-row"><span class="k">Semana especial</span><span class="v">${escapeHtml(tipo)}</span></div>
          <div class="p-row"><span class="k">Estado</span><span class="v">No hay reuniones ni asignados</span></div>
        </div>
      </div>
    `;
  }

  const pres = personaNameById(a?.presidenteId) || "—";
  const oi = personaNameById(a?.oracionInicialId) || "—";
  const of = ( (a?.oradorPublico || "").trim() ) ? (oracionFinalTexto(a) || "—") : ((personaNameById(a?.oracionFinalId) || oracionFinalTexto(a) || "—"));

  const canNum = String(a?.cancionNumero || "").trim();
  const canTit = canNum ? (cancionesMap.get(Number(canNum)) || "") : "";
  const canStr = canNum ? `${canNum}${canTit ? " — " + canTit : ""}` : "—";

  const orador = (a?.oradorPublico || "").trim() || "—";
  const cong = (a?.congregacionVisitante || "").trim() || "—";
  const titulo = (a?.tituloDiscurso || "").trim() || "—";
  const prox = (a?.tituloSiguienteSemana || "").trim() || "—";

  const conductor = personaNameById(a?.conductorAtalayaId) || "—";
  const lector = personaNameById(a?.lectorAtalayaId) || "—";

  const mm1 = personaNameById(a?.multimedia1Id) || "—";
  const mm2 = personaNameById(a?.multimedia2Id) || "—";
  const plat = personaNameById(a?.plataformaId) || "—";
  const ent = personaNameById(a?.acomodadorEntradaId) || "—";
  const aud = personaNameById(a?.acomodadorAuditorio1Id || a?.acomodadorAuditorioId) || "—";
  const mic1 = personaNameById(a?.microfonista1Id) || "—";
  const mic2 = personaNameById(a?.microfonista2Id) || "—";

  return `
    <div class="print-grid">
      <div class="p-card">
        <div class="p-h">Congregación Villa Fiad</div>
        <div class="p-sub">Semana: Jueves ${fmtAR(jue)} (20:00) · Sábado ${fmtAR(sab)} (19:30)</div>

        <div class="p-row"><span class="k">Presidente</span><span class="v">${escapeHtml(pres)}</span></div>
        <div class="p-row"><span class="k">Oración inicial</span><span class="v">${escapeHtml(oi)}</span></div>
        <div class="p-row"><span class="k">Canción</span><span class="v">${escapeHtml(canStr)}</span></div>

        <div style="height:8px;"></div>

        <div class="p-row"><span class="k">Orador público</span><span class="v">${escapeHtml(orador)}</span></div>
        <div class="p-row"><span class="k">Congregación</span><span class="v">${escapeHtml(cong)}</span></div>
        <div class="p-row"><span class="k">Discurso</span><span class="v">${escapeHtml(titulo)}</span></div>
        <div class="p-row"><span class="k">Próxima semana</span><span class="v">${escapeHtml(prox)}</span></div>

        <div style="height:8px;"></div>

        <div class="p-row"><span class="k">Oración final</span><span class="v">${escapeHtml(of)}</span></div>
      </div>

      <div class="p-card">
        <div class="p-h">Asignaciones</div>
        <div class="p-sub">La Atalaya + multimedia + acomodadores</div>

        <div class="p-row"><span class="k">Conductor Atalaya</span><span class="v">${escapeHtml(conductor)}</span></div>
        <div class="p-row"><span class="k">Lector Atalaya</span><span class="v">${escapeHtml(lector)}</span></div>

        <div style="height:8px;"></div>

        <div class="p-row"><span class="k">Multimedia</span><span class="v">${escapeHtml(mm1)} / ${escapeHtml(mm2)}</span></div>
        <div class="p-row"><span class="k">Acomodador plataforma</span><span class="v">${escapeHtml(plat)}</span></div>
        <div class="p-row"><span class="k">Acomodador entrada</span><span class="v">${escapeHtml(ent)}</span></div>
        <div class="p-row"><span class="k">Acomodador auditorio</span><span class="v">${escapeHtml(aud)}</span></div>
        <div class="p-row"><span class="k">Microfonistas</span><span class="v">${escapeHtml(mic1)} / ${escapeHtml(mic2)}</span></div>
      </div>
    </div>
  `;
}

function imprimirSemana(){
  const s = semanaISO();
  if(!s) return setStatus("Elegí una semana primero.", true);
  // usa la asignación cargada actualmente
  const a = formData();

  const host = $("printSemana");
  if(host) host.innerHTML = buildPrintSemanaHTML(s, a);

  document.body.classList.add("print-semana");
  const cleanup = () => document.body.classList.remove("print-semana");
  window.addEventListener("afterprint", cleanup, { once:true });
  window.print();
  setTimeout(cleanup, 1200);
}


// ---------------- Mensajes individuales ----------------
function phoneToWa(phone){
  const raw = String(phone||"").trim();
  const digits = raw.replace(/\D/g, "");
  if(!digits) return "";
  return digits; // wa.me espera solo dígitos, idealmente con código país
}

function buildIndividualMessages(semanaSatISO, a){
  const sab = semanaSatISO;
  const jue = addDaysISO(semanaSatISO, -2);

  const roles = [
    { key: "plataformaId", label: "Plataforma" },
    { key: "acomodadorEntradaId", label: "Acomodador (Entrada)" },
    { key: "acomodadorAuditorio1Id", label: "Acomodador (Auditorio 1)" },
    { key: "multimedia1Id", label: "Multimedia" },
    { key: "multimedia2Id", label: "Multimedia" },
  ];

  const perPerson = new Map(); // id -> {nombre, telefono, roles:Set}
  for(const r of roles){
    const id = a?.[r.key];
    if(!id) continue;
    const p = personas.find(x=>x.id===id);
    const nombre = p?.nombre || personaNameById(id) || "—";
    const tel = p?.telefono || "";
    if(!perPerson.has(id)) perPerson.set(id, { id, nombre, telefono: tel, roles: new Set() });
    perPerson.get(id).roles.add(r.label);
  }

  const out = [];
  for(const item of perPerson.values()){
    const rolesTxt = Array.from(item.roles).join(" y ");
    const text = [
      `Hola ${item.nombre}! 👋`,
      `Esta semana tenés asignado: *${rolesTxt}*.`,
      `Jueves ${fmtAR(jue)} (20:00) y Sábado ${fmtAR(sab)} (19:30).`,
      "Gracias por tu ayuda 🙏"
    ].join("\n");
    out.push({ ...item, text, wa: phoneToWa(item.telefono) });
  }
  // orden alfabético
  out.sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{sensitivity:"base"}));
  return out;
}

function renderIndividualMessages(){ return; }


function setAvisoText(text) {
  const t = $("avisoText");
  if (t) t.value = text || "";
}

async function generarAviso() {
  const s = semanaISO();
  if (!s) {
    setStatus("Elegí una semana (preferentemente el sábado) para generar el aviso.", true);
    return;
  }
  const a = formData();
  const msg = buildAvisoSemanal(s, a);
  setAvisoText(msg);
    setStatus("Aviso generado. Podés copiarlo o abrir WhatsApp Web.");
}

async function copiarAviso() {
  const t = $("avisoText");
  const msg = t?.value || "";
  if (!msg.trim()) {
    setStatus("Primero generá el aviso.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(msg);
    setStatus("Aviso copiado ✅");
  } catch (e) {
    console.error(e);
    try {
      t?.focus();
      t?.select();
      document.execCommand("copy");
      setStatus("Aviso copiado ✅");
    } catch (err) {
      console.error(err);
      setStatus("No pude copiar automáticamente. Copialo manualmente.", true);
    }
  }
}

function whatsappAviso() {
  const t = $("avisoText");
  const msg = t?.value || "";
  if (!msg.trim()) {
    setStatus("Primero generá el aviso.", true);
    return;
  }
  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}

// ---------------- init ----------------
async function init() {
  if ($("semana")) $("semana").value = isoToday();

  await new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      const u = await getUsuario(user.uid);
      usuarioRol = u?.rol || "";
      isAdmin = isAdminRole(usuarioRol);
      resolve(user);
    });
  });

  renderTopbar('asignaciones', usuarioRol);
  applyReadOnlyMode();
  // Usuarios (no admin): solo ver desde hoy en adelante
  if(!isAdmin){
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const hoyISO = hoy.toISOString().slice(0,10);
    const inp = $("semana");
    if(inp){
      inp.min = hoyISO;
      inp.addEventListener("change", ()=>{
        const v = (inp.value||"").slice(0,10);
        if(v && v < hoyISO){
          inp.value = hoyISO;
          setStatus("Solo se muestran asignaciones desde hoy en adelante.");
          // recarga la semana actual
          cargarSemana?.();
        }
      });
      // Si está vacío o en el pasado, ponelo en hoy
      if(!inp.value || (inp.value.slice(0,10) < hoyISO)){
        inp.value = hoyISO;
      }
    }
  }

  $("btnSalir")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
  $("btnCargar")?.addEventListener("click", cargarSemana);
  $("btnGuardar")?.addEventListener("click", guardar);
  $("btnLimpiar")?.addEventListener("click", limpiar);
  $("btnPdfPresidente")?.addEventListener("click", abrirPdfPresidente);

  $("btnImprimir")?.addEventListener("click", imprimirSemana);

  $("btnEstaSemana")?.addEventListener("click", async () => {
    const iso = upcomingSaturdayISO();
    await goToSemana(iso);
  });
  $("btnSemanaAnterior")?.addEventListener("click", async () => {
    const s = semanaISO() || upcomingSaturdayISO();
    await goToSemana(shiftWeekISO(s, -1));
  });
  $("btnSemanaSiguiente")?.addEventListener("click", async () => {
    const s = semanaISO() || upcomingSaturdayISO();
    await goToSemana(shiftWeekISO(s, 1));
  });
  $("btnCopiarAnterior")?.addEventListener("click", copiarSemanaAnterior);
  $("btnActualizarVisitante")?.addEventListener("click", async () => {
    const s = semanaISO();
    if (!s) return setStatus("Elegí una semana para cotejar visitantes.", true);
    const v = await aplicarAutoVisitante(s, { force: true });
    if (v) setStatus(`Visitante actualizado desde Visitantes: ${v.nombre || "sin nombre"}${v.congregacion ? " — " + v.congregacion : ""}.`);
    else setStatus("No encontré visitante cargado para esa fecha en Visitantes.", true);
  });
  $("tipoSemana")?.addEventListener("change", () => {
    updateSemanaEspecialUI();
  });


  $("btnGenerarAviso")?.addEventListener("click", generarAviso);
  $("btnCopiarAviso")?.addEventListener("click", copiarAviso);
  $("btnWhatsappAviso")?.addEventListener("click", whatsappAviso);

  // Sugerencias / rotación
  $("btnSugerirPresidente")?.addEventListener("click", ()=>{ sugerirPresidente(); });
  $("btnSugerirOracionInicial")?.addEventListener("click", ()=>{ sugerirOracionInicial(); });
  $("btnSugerirConductor")?.addEventListener("click", ()=>{ sugerirConductorAtalaya(); });
  $("btnSugerirLectorAtalaya")?.addEventListener("click", ()=>{ sugerirLectorAtalaya(); });
  $("btnSugMultimedia1")?.addEventListener("click", ()=>suggestSelect("multimedia1","multimedia", candidates.multimedia));
  $("btnSugMultimedia2")?.addEventListener("click", ()=>suggestSelect("multimedia2","multimedia", candidates.multimedia));
  $("btnSugPlataforma")?.addEventListener("click", ()=>suggestSelect("plataforma","plataforma", candidates.plataforma));
  $("btnSugAcomEntrada")?.addEventListener("click", ()=>suggestSelect("acomodadorEntrada","acomodadores", candidates.acomodadores));
  $("btnSugAcomAuditorio1")?.addEventListener("click", ()=>suggestSelect("acomodadorAuditorio1","acomodadores", candidates.acomodadores));
  $("btnSugMicrofonista1")?.addEventListener("click", ()=>suggestSelect("microfonista1","microfonista", candidates.microfonistas));
  $("btnSugMicrofonista2")?.addEventListener("click", ()=>suggestSelect("microfonista2","microfonista", candidates.microfonistas));

  $("btnCargarMes")?.addEventListener("click", cargarMes);
  $("btnGuardarMes")?.addEventListener("click", guardarMes);
  $("btnImprimirMes")?.addEventListener("click", imprimirMes);
  $("btnSugerirSemana")?.addEventListener("click", sugerirSemanaEquitativa);
  $("btnSugerirMes")?.addEventListener("click", sugerirMesCompleto);

  $("mes")?.addEventListener("change", () => {
    const mesISO = (getVal("mes") || "").trim();
    renderMesSemanaOptions(mesISO);
    cargarMes();
  });

  $("mesSemana")?.addEventListener("change", () => {
    const mesISO = (getVal("mes") || "").trim();
    if (lastMesDoc) hydrateMesToUI(lastMesDoc);
    renderMesPreview(mesISO, lastMesDoc || null);
  });

  [
    "mesPlataforma",
    "mesAcomodadorEntrada",
    "mesAcomodadorAuditorio1",
    "mesMultimedia1",
    "mesMultimedia2",
    "mesMicrofonista1",
    "mesMicrofonista2",
  ].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      const mesISO = (getVal("mes") || "").trim();
      const wk = currentMesSemana();
      if (!lastMesDoc) lastMesDoc = { semanas: {} };
      if (!lastMesDoc.semanas) lastMesDoc.semanas = {};
      lastMesDoc.semanas[wk] = formMesData();
      renderMesPreview(mesISO, lastMesDoc);
    });
  });

  $("cancionNumero")?.addEventListener("change", aplicarAutoCancion);
  $("discursoNumero")?.addEventListener("input", aplicarAutoDiscurso);
  $("discursoNumero")?.addEventListener("change", aplicarAutoDiscurso);
  $("tituloDiscurso")?.addEventListener("input", () => {
    const cur = String(getVal("tituloDiscurso") || "").trim();
    if (cur !== lastAutoTituloDiscurso) lastAutoTituloDiscurso = cur ? "__MANUAL__" : "";
  });

  try {
    await cargarPersonas();
    poblarSelects();
  // Mantener reglas de oraciones
  const presEl = $("presidente");
  if (presEl) presEl.addEventListener("change", () => { autoOracionInicialIfNeeded(); });
  const conductorEl = $("conductorAtalaya");
  if (conductorEl) conductorEl.addEventListener("change", () => { if(!getVal("lectorAtalaya")) sugerirLectorAtalaya(); });
  const oradorEl = $("oradorPublico");
  const oracionFinalEl = $("oracionFinal");
  if (oracionFinalEl) oracionFinalEl.addEventListener("change", () => { oracionFinalEl.dataset.manual = "1"; });

    await poblarDatalistOradores();
    await ensureRoleHistoryLoaded();
    updateSemanaEspecialUI();
    setStatus("Listo. Elegí una semana y cargá.");
  } catch (e) {
    console.error(e);
    setStatus("No pude cargar personas. Revisá permisos de Firestore.", true);
  }

  $("semana")?.addEventListener("change", async () => {
    const s = semanaISO();
    if (!s) return;
    await cargarSemana();
    // deja el aviso listo (si ya hay asignaciones cargadas)
    generarAviso();
  });

  const params = new URLSearchParams(location.search);
  const semanaParam = params.get("semana");
  if (semanaParam && /^\d{4}-\d{2}-\d{2}$/.test(semanaParam)) {
    setSemanaISO(semanaParam);
  }
  let s0 = semanaISO();
  if (!s0) {
    s0 = upcomingSaturdayISO();
    setSemanaISO(s0);
  }
  if (s0) await cargarSemana();

  if ($("mes")) $("mes").value = monthISOFromDateISO(s0) || isoMonthToday();
  renderMesSemanaOptions(getVal("mes"));
  await cargarMes();
}

init();
