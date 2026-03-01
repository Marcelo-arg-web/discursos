// js/pages/asignaciones.js
// Admin: carga personas, guarda asignaciones semanales, y autocompleta visitante/títulos.
// NO modifica Firebase.

import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
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

import { canciones } from "../data/canciones.js";
import { bosquejos } from "../data/bosquejos.js";
import { visitantes as visitantesLocal } from "../data/visitantes.js";

import {
  getAncianosOSiervos,
  getAncianos,
  getAcomodadores,
  getPlataforma,
  getMultimedia,
  getMicrofonistas,
  getLectoresAtalaya
} from "../roles/getRoleCandidates.js";

// ---------------- UI helpers ----------------
const $ = (id) => document.getElementById(id);
const getVal = (id) => ($(id)?.value ?? "");
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
  "acomodadorAuditorio2Id",
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
  box.style.background = isError ? "#fff1f2" : "#f8fafc";
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
};

async function getUsuario(uid){
  try{
    const snap = await getDoc(doc(db,"usuarios",uid));
    return snap.exists() ? snap.data() : null;
  }catch(e){
    console.error(e);
    return null;
  }
}


function renderTopbar(active, rol){
  const el = document.getElementById("topbar");
  if(!el) return;
  const admin = isAdminRole(rol);
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        ${admin ? `<a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>` : ``}
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
      </div>
      <div class="actions">
        <span class="chip">${rol || 'usuario'}</span>
        <button class="btn small" type="button" id="btnSalir">Salir</button>
      </div>
    </div>
  `;
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
    "acomodadorAuditorio2",
    "microfonista1","microfonista2","oracionFinal",
    // mensuales
    "mes","mesSemana","mesPlataforma","mesAcomodadorEntrada","mesAcomodadorAuditorio",
    "mesMultimedia1","mesMultimedia2","mesMicrofonista1","mesMicrofonista2"
  ];
  disableIds.forEach(id=>{ const el = $(id); if(el) el.disabled = true; });

  // Botones sugerir
  [
    "btnSugerirPresidente","btnSugerirConductor","btnSugMultimedia1","btnSugMultimedia2","btnSugPlataforma",
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
  return personas.find((p) => p.id === id)?.nombre || "";
}

function formMesData() {
  return {
    plataformaId: getVal("mesPlataforma"),
    acomodadorEntradaId: getVal("mesAcomodadorEntrada"),
    acomodadorAuditorioId: getVal("mesAcomodadorAuditorio"),
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
    acomodadorAuditorioId: "",
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
    ["mesAcomodadorAuditorio", dataWeek.acomodadorAuditorioId],
    ["mesMultimedia1", dataWeek.multimedia1Id],
    ["mesMultimedia2", dataWeek.multimedia2Id],
    ["mesMicrofonista1", dataWeek.microfonista1Id],
    ["mesMicrofonista2", dataWeek.microfonista2Id],
  ].forEach(([sid, pid]) => ensureOptionById(sid, pid));

  setVal("mesPlataforma", dataWeek.plataformaId || "");
  setVal("mesAcomodadorEntrada", dataWeek.acomodadorEntradaId || "");
  setVal("mesAcomodadorAuditorio", dataWeek.acomodadorAuditorioId || "");
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
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.acomodadorAuditorioId) || "—"}</td>
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
      ["acomodadorAuditorio1",
    "acomodadorAuditorio2", w.acomodadorAuditorioId],
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

  const acomAud = getVal("mesAcomodadorAuditorio") || pickFairCandidate(candidates.acomodadores, counts, "acomodadorAuditorio1",
    "acomodadorAuditorio2", used);
  used.add(acomAud);

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
    ["mesAcomodadorAuditorio", acomAud],
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
  markLastUsed("acomodadorAuditorio1",
    "acomodadorAuditorio2", acomAud);
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
  const qy = query(collection(db, "personas"), where("activo", "==", true));
  const snap = await getDocs(qy);
  personas = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p?.nombre);
  personas.sort((a, b) =>
    displayName(a).localeCompare(displayName(b), "es", { sensitivity: "base" })
  );
}

function fillSelect(id, filterFn) {
  const sel = $(id);
  if (!sel) return;
  sel.innerHTML = "";
  addOpt(sel, "", "— Seleccionar —");
  for (const p of personas) {
    if (filterFn(p)) addOpt(sel, p.id, displayName(p));
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

  const byIds = (arr) => {
    const set = new Set((arr || []).map((p) => p.id));
    return (p) => set.has(p.id);
  };

  fillSelect("presidente", byIds(ancSiervos));
  fillSelect("oracionInicial", byIds(ancSiervos));
  fillSelect("oracionFinal", byIds(ancSiervos));
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
  fillSelect("acomodadorAuditorio2", byIds(acomodadores));

  fillSelect("mesAcomodadorEntrada", byIds(acomodadores));
  fillSelect("mesAcomodadorAuditorio1", byIds(acomodadores));
  fillSelect("mesAcomodadorAuditorio2", byIds(acomodadores));

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
  if(!isAdmin) return;
  const sel = $(selectId);
  if(!sel) return;
  const current = sel.value;
  let chosen = nextFromRotation(key, ids);
  // evita sugerir el mismo si hay más de 1
  if(chosen && chosen === current && (ids||[]).length > 1){
    chosen = nextFromRotation(key, ids);
  }
  if(chosen) sel.value = chosen;
}

// ---------------- Autocompletado canción y discurso por número ----------------
const cancionesMap = new Map(Object.entries(canciones).map(([k, v]) => [Number(k), String(v)]));
const bosquejosMap = new Map(Object.entries(bosquejos).map(([k, v]) => [Number(k), String(v)]));

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
  if (!num) {
    if (elOut) elOut.textContent = "—";
    return;
  }
  const t = bosquejosMap.get(num) || "";
  if (elOut) elOut.textContent = t ? `Bosquejo ${num}: ${t}` : "No encontrado";
  if (t && !getVal("tituloDiscurso").trim()) setVal("tituloDiscurso", t);
}


// ---------------- Visitantes (Firestore + fallback local) ----------------
function localVisitanteFor(fechaISO) {
  const v = visitantesLocal[fechaISO];
  if (v) return v;
  const plus = addDaysISO(fechaISO, 1);
  const minus = addDaysISO(fechaISO, -1);
  return visitantesLocal[plus] || visitantesLocal[minus] || null;
}

async function firestoreVisitFor(fechaISO) {
  try {
    const snap = await getDoc(doc(db, "visitas", fechaISO));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch (_) {
    /* ignore */
  }

  const fields = [
    { id: "multimedia1", label: "Multimedia 1" },
    { id: "multimedia2", label: "Multimedia 2" },
    { id: "acomodadorEntrada", label: "Acomodador Entrada" },
    { id: "acomodadorAuditorio1", label: "Acomodador Auditorio 1" },
    { id: "acomodadorAuditorio2", label: "Acomodador Auditorio 2" },
  ];
  const exclNames = new Set([normName("Marcelo Palavecino")]);
  const conductorId = getVal("conductorAtalaya");
  const oracionInicialId = getVal("oracionInicial");

  const candidatos = anc.filter(p=>{
    if(!p) return false;
    const n = normName(p.nombre || "");
    if(!n) return false;
    if(exclNames.has(n)) return false;
    if(conductorId && p.id === conductorId) return false;
    if(oracionInicialId && p.id === oracionInicialId) return false; // presidente distinto de oración inicial
    return true;
  });

  const elegidoId = pickNextFrom(candidatos.map(p=>p.id), "vf_last_presidente_idx");
  if(elegidoId) setVal("presidente", elegidoId);

  // Ajusta oración inicial si quedó igual al presidente
  autoOracionInicialIfNeeded();
  autoOracionFinal();
}

function sugerirConductorAtalaya(){
  if(!window.__personasCache) return;
  const anc = getAncianos(window.__personasCache) || [];

  const presidenteId = getVal("presidente");
  const oracionInicialId = getVal("oracionInicial");
  const lectorId = getVal("lectorAtalaya");

  const candidatos = anc
    .filter(p=>p && p.id && p.nombre)
    .filter(p=>{
      if(presidenteId && p.id === presidenteId) return false;
      if(oracionInicialId && p.id === oracionInicialId) return false;
      if(lectorId && p.id === lectorId) return false;
      return true;
    });

  const elegidoId = pickNextFrom(candidatos.map(p=>p.id), "vf_last_conductor_atalaya_idx");
  if(elegidoId) setVal("conductorAtalaya", elegidoId);
}




function autoPresidenteIfNeeded(){
  if(getVal("presidente").trim()) return;
  sugerirPresidente();
}

function sugerirOracionInicial(){
  if(!window.__personasCache) return;
  const pool = (getAncianosOSiervos(window.__personasCache) || []);
  const presidenteId = getVal("presidente");
  const candidatos = pool
    .filter(p=>p && p.id && p.nombre)
    .filter(p=>!presidenteId || p.id !== presidenteId);

  const elegidoId = pickNextFrom(candidatos.map(p=>p.id), "vf_last_oracion_inicial_idx");
  if(elegidoId) setVal("oracionInicial", elegidoId);
}

function autoOracionInicialIfNeeded(){
  const pres = getVal("presidente");
  const oi = getVal("oracionInicial");
  // Si está vacía, sugerimos
  if(!oi){
    return sugerirOracionInicial();
  }
  // Si quedó igual al presidente, forzamos que sea distinta
  if(pres && oi && pres === oi){
    setVal("oracionInicial", "");
    return sugerirOracionInicial();
  }
}


function updateOracionFinalVisitorOptionLabel(){
  const ofSel = $("oracionFinal");
  if(!ofSel) return;
  const opt = Array.from(ofSel.options).find(o => o.value === "__VISITANTE__");
  if(!opt) return;

  const visitante = (getVal("oradorPublico") || "").trim();
  const presId = getVal("presidente");
  const presName = personaNameById(presId);

  if(visitante && presName){
    opt.textContent = `Visitante ${visitante}/${presName}`;
  }else if(visitante){
    opt.textContent = `Visitante ${visitante}`;
  }else{
    opt.textContent = "Orador visitante";
  }
}

function autoOracionFinal(){
  // Regla: Oración final = Orador público/Presidente (sin espacios).
  // Si no hay orador público, queda Presidente.
  const o = (getVal("oradorPublico") || "").trim();
  const pid = (getVal("presidente") || "").trim();
  const p = (personaNameById(pid) || pid).trim();

  let v = "";
  if(o && p) v = `${o}/${p}`;
  else if(p) v = p;
  else if(o) v = o;

  // Asegura que el <select> tenga esta opción y la seleccione
  const sel = document.getElementById("oracionFinal");
  if(!sel) return;

  // Si existe la opción exacta, seleccionarla
  let opt = Array.from(sel.options).find(x => (x.value || "").trim() === v);
  if(v && !opt){
    opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }

  // Si v está vacío, limpiamos selección
  if(!v){
    sel.value = "";
    return;
  }
  sel.value = v;
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
    await aplicarAutoVisitante(s);
    setStatus("Listo: copié la semana anterior. Revisá y Guardá.");
    generarAviso();
  } catch (e) {
    console.error(e);
    setStatus("No pude copiar. Revisá consola (F12) y permisos.", true);
  }
}


function formData() {
  return {
    presidenteId: getVal("presidente"),
    oracionInicialId: getVal("oracionInicial"),
    oracionFinalId: getVal("oracionFinal"),
    conductorAtalayaId: getVal("conductorAtalaya"),
    lectorAtalayaId: getVal("lectorAtalaya"),
    multimedia1Id: getVal("multimedia1"),
    multimedia2Id: getVal("multimedia2"),
    plataformaId: getVal("plataforma"),
    microfonista1Id: getVal("microfonista1"),
    microfonista2Id: getVal("microfonista2"),
    acomodadorEntradaId: getVal("acomodadorEntrada"),
    acomodadorAuditorio1Id: getVal("acomodadorAuditorio1"),
    acomodadorAuditorio2Id: getVal("acomodadorAuditorio2"),

    cancionNumero: getVal("cancionNumero"),
    oradorPublico: getVal("oradorPublico"),
    congregacionVisitante: getVal("congregacionVisitante"),
    tituloDiscurso: getVal("tituloDiscurso"),
    tituloSiguienteSemana: getVal("tituloSiguienteSemana"),
  };
}

function hydrateToUI(a) {
  if (!a) return;

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
    ["acomodadorAuditorio1",
    "acomodadorAuditorio2", a.acomodadorAuditorioId],
  ].forEach(([sid, pid]) => ensureOptionById(sid, pid));

  setVal("presidente", a.presidenteId || "");
  setVal("oracionInicial", a.oracionInicialId || "");
  setVal("oracionFinal", a.oracionFinalId || "");
  setVal("conductorAtalaya", a.conductorAtalayaId || "");
  setVal("lectorAtalaya", a.lectorAtalayaId || "");
  setVal("multimedia1", a.multimedia1Id || "");
  setVal("multimedia2", a.multimedia2Id || "");
  setVal("plataforma", a.plataformaId || "");
  setVal("microfonista1", a.microfonista1Id || "");
  setVal("microfonista2", a.microfonista2Id || "");
  setVal("acomodadorEntrada", a.acomodadorEntradaId || "");
  setVal("acomodadorAuditorio1",
    "acomodadorAuditorio2", a.acomodadorAuditorioId || "");

  setVal("cancionNumero", a.cancionNumero || "");
  setVal("oradorPublico", a.oradorPublico || "");
  setVal("congregacionVisitante", a.congregacionVisitante || "");
  setVal("tituloDiscurso", a.tituloDiscurso || "");
  setVal("tituloSiguienteSemana", a.tituloSiguienteSemana || "");
}


function validateRequired() {
  // Ajustá acá qué campos querés obligatorios
  const required = [
    { id: "plataforma", label: "Plataforma" },
    { id: "acomodadorEntrada", label: "Acomodador Entrada" },
    { id: "acomodadorAuditorio1", label: "Acomodador Auditorio 1" },
    { id: "acomodadorAuditorio2", label: "Acomodador Auditorio 2" },
    { id: "multimedia1", label: "Multimedia 1" },
    { id: "multimedia2", label: "Multimedia 2" },
  ];
  const missing = required.filter((r) => !getVal(r.id));
  if (missing.length) {
    return "Faltan campos: " + missing.map((m) => m.label).join(", ") + ".";
  }
    const pres = getVal("presidente");
  const oi = getVal("oracionInicial");
  if (pres && oi && pres === oi) {
    return "La oración inicial debe ser distinta del presidente.";
  }
  return "";
}

function validateNoDuplicates() {
  const fields = [
    { id: "multimedia1", label: "Multimedia 1" },
    { id: "multimedia2", label: "Multimedia 2" },
    { id: "acomodadorEntrada", label: "Acomodador Entrada" },
    { id: "acomodadorAuditorio1",
    "acomodadorAuditorio2", label: "Acomodador Auditorio" },
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
      await aplicarAutoVisitante(s);
      try{ autoPresidenteIfNeeded(); }catch(_e){}
      try{ autoOracionFinal(); }catch(_e){}
      // refresca aviso
      try{ await generarAviso(); }catch(_e){}
      setStatus("Datos cargados.");
    } else {
      setStatus("No hay datos guardados para esta semana. Podés cargar y guardar.");
      await aplicarAutoVisitante(s);
      try{ autoPresidenteIfNeeded(); }catch(_e){}
      try{ autoOracionFinal(); }catch(_e){}
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

  autoOracionFinal();

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

setStatus("Guardado OK.");
    // deja el aviso listo para WhatsApp
    generarAviso();
  } catch (e) {
    console.error(e);
    setStatus("No pude guardar. Revisá permisos de Firestore.", true);
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
    "acomodadorAuditorio2",
    "cancionNumero",
    "oradorPublico",
    "congregacionVisitante",
    "tituloDiscurso",
    "tituloSiguienteSemana",
  ].forEach((id) => setVal(id, ""));
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

  const m1 = personaNameById(a?.multimedia1Id) || "—";
  const m2 = personaNameById(a?.multimedia2Id) || "—";
  const plat = personaNameById(a?.plataformaId) || "—";
  const ent = personaNameById(a?.acomodadorEntradaId) || "—";
  const aud = personaNameById(a?.acomodadorAuditorioId) || "—";
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
  const aud = personaNameById(a?.acomodadorAuditorioId) || "—";
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
  // asegúrate de aplicar regla de oración final
  autoOracionFinal();

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
    { key: "acomodadorAuditorioId", label: "Acomodador (Auditorio)" },
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
  $("oradorPublico")?.addEventListener("change", ()=>{ try{ autoOracionFinal(); }catch(_e){} });
  $("presidente")?.addEventListener("change", ()=>{ try{ autoOracionFinal(); }catch(_e){} });
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


  $("btnGenerarAviso")?.addEventListener("click", generarAviso);
  $("btnCopiarAviso")?.addEventListener("click", copiarAviso);
  $("btnWhatsappAviso")?.addEventListener("click", whatsappAviso);

  // Sugerencias / rotación
  $("btnSugerirPresidente")?.addEventListener("click", ()=>{ sugerirPresidente(); });
  $("btnSugerirConductor")?.addEventListener("click", ()=>{ sugerirConductorAtalaya(); autoOracionFinal(); });
  $("btnSugMultimedia1")?.addEventListener("click", ()=>suggestSelect("multimedia1","multimedia", candidates.multimedia));
  $("btnSugMultimedia2")?.addEventListener("click", ()=>suggestSelect("multimedia2","multimedia", candidates.multimedia));
  $("btnSugPlataforma")?.addEventListener("click", ()=>suggestSelect("plataforma","plataforma", candidates.plataforma));
  $("btnSugAcomEntrada")?.addEventListener("click", ()=>suggestSelect("acomodadorEntrada","acomodadores", candidates.acomodadores));
  $("btnSugAcomAuditorio1")?.addEventListener("click", ()=>suggestSelect("acomodadorAuditorio1","acomodadores", candidates.acomodadores));
  $("btnSugAcomAuditorio2")?.addEventListener("click", ()=>suggestSelect("acomodadorAuditorio2","acomodadores", candidates.acomodadores));
      "acomodadorAuditorio2","acomodadores", candidates.acomodadores));

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
    "mesAcomodadorAuditorio",
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

  try {
    await cargarPersonas();
    poblarSelects();
  // Mantener reglas de oraciones
  const presEl = $("presidente");
  if (presEl) presEl.addEventListener("change", () => { autoOracionInicialIfNeeded(); autoOracionFinal(); });
  const oiEl = $("oracionInicial");
  if (oiEl) oiEl.addEventListener("change", () => { autoOracionInicialIfNeeded(); });
  const oradorEl = $("oradorPublico");
  if (oradorEl) oradorEl.addEventListener("input", () => { autoOracionFinal(); });

    await poblarDatalistOradores();
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