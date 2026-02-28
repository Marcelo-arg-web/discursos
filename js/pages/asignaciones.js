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
const setVal = (id, v) => {
  const el = $(id);
  if (el) el.value = v ?? "";
};

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

  const byIds = (arr) => {
    const set = new Set((arr || []).map((p) => p.id));
    return (p) => set.has(p.id);
  };

  fillSelect("presidente", byIds(ancSiervos));
  fillSelect("oracionInicial", byIds(ancSiervos));
  fillSelect("oracionFinal", byIds(ancSiervos));
  fillSelect("lectorAtalaya", byIds(lectoresAtalaya));

  fillSelect("conductorAtalaya", byIds(ancianos));

  fillSelect("multimedia1", byIds(multimedia));
  fillSelect("multimedia2", byIds(multimedia));

  fillSelect("mesMultimedia1", byIds(multimedia));
  fillSelect("mesMultimedia2", byIds(multimedia));

  fillSelect("plataforma", byIds(plataforma));
  fillSelect("mesPlataforma", byIds(plataforma));

  fillSelect("acomodadorEntrada", byIds(acomodadores));
  fillSelect("acomodadorAuditorio", byIds(acomodadores));

  fillSelect("mesAcomodadorEntrada", byIds(acomodadores));
  fillSelect("mesAcomodadorAuditorio", byIds(acomodadores));

  fillSelect("microfonista1", byIds(microfonistas));
  fillSelect("microfonista2", byIds(microfonistas));

  fillSelect("mesMicrofonista1", byIds(microfonistas));
  fillSelect("mesMicrofonista2", byIds(microfonistas));
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
  const num = normNumero(getVal("discursoNumero"));
  if (!num) return;
  const t = bosquejosMap.get(num);
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

  const fields = ["fecha", "fechaISO", "semana", "dia"];
  for (const f of fields) {
    try {
      const qy = query(collection(db, "visitas"), where(f, "==", fechaISO));
      const s = await getDocs(qy);
      if (!s.empty) return { id: s.docs[0].id, ...s.docs[0].data() };
    } catch (_) {
      /* ignore */
    }
  }

  try {
    const s = await getDocs(collection(db, "visitas"));
    for (const d of s.docs) {
      const data = d.data() || {};
      const fx = (data.fecha || data.fechaISO || data.semana || data.dia || "")
        .toString()
        .slice(0, 10);
      if (fx === fechaISO) return { id: d.id, ...data };
    }
  } catch (_) {
    /* ignore */
  }

  return null;
}

function extractVisitFields(v) {
  if (!v) return null;
  const nombre = v.orador || v.oradorPublico || v.nombre || v.conferenciante || "";
  const congregacion = v.congregacion || v.congregacionVisitante || v.congreg || "";
  const titulo = v.titulo || v.tituloDiscurso || v.tema || "";
  const bosquejo = v.bosquejo || v.numero || v.discursoNumero || v.b || "";
  const cancion = v.cancion || v.cancionNumero || v.c || "";
  return { nombre, congregacion, titulo, bosquejo, cancion };
}

async function aplicarAutoVisitante(semanaISO) {
  if (!semanaISO) return;

  let v = await firestoreVisitFor(semanaISO);
  let vf = extractVisitFields(v);
  if (!vf) {
    const local = localVisitanteFor(semanaISO);
    vf = local
      ? {
          nombre: local.nombre || "",
          congregacion: local.congregacion || "",
          titulo: local.titulo || "",
          bosquejo: local.bosquejo || "",
          cancion: local.cancion || "",
        }
      : null;
  }

  if (vf) {
    if (!getVal("oradorPublico").trim() && vf.nombre) setVal("oradorPublico", vf.nombre);
    if (!getVal("congregacionVisitante").trim() && vf.congregacion)
      setVal("congregacionVisitante", vf.congregacion);
    if (!getVal("tituloDiscurso").trim() && vf.titulo) setVal("tituloDiscurso", vf.titulo);
    if (!getVal("cancionNumero").trim() && vf.cancion) setVal("cancionNumero", String(vf.cancion));
  }

  const nextISO = addDaysISO(semanaISO, 7);
  if (!getVal("tituloSiguienteSemana").trim() && nextISO) {
    let v2 = await firestoreVisitFor(nextISO);
    let v2f = extractVisitFields(v2);
    if (!v2f) {
      const local2 = localVisitanteFor(nextISO);
      v2f = local2 ? { titulo: local2.titulo || "" } : null;
    }
    if (v2f?.titulo) setVal("tituloSiguienteSemana", v2f.titulo);
  }
}

async function poblarDatalistOradores() {
  const dl = $("listaOradoresVisitantes");
  if (!dl) return;

  const set = new Set();

  for (const k of Object.keys(visitantesLocal || {})) {
    const v = visitantesLocal[k];
    if (v?.nombre) set.add(v.nombre);
  }

  try {
    const s = await getDocs(collection(db, "visitas"));
    for (const d of s.docs) {
      const data = d.data() || {};
      const name = data.orador || data.oradorPublico || data.nombre || data.conferenciante;
      if (name) set.add(String(name));
    }
  } catch (_) {
    /* ignore */
  }

  dl.innerHTML = "";
  Array.from(set)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      dl.appendChild(opt);
    });
}

// ---------------- Guardar / cargar ----------------
function semanaISO() {
  return (getVal("semana") || "").trim();
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
    acomodadorAuditorioId: getVal("acomodadorAuditorio"),

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
    ["acomodadorAuditorio", a.acomodadorAuditorioId],
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
  setVal("acomodadorAuditorio", a.acomodadorAuditorioId || "");

  setVal("cancionNumero", a.cancionNumero || "");
  setVal("oradorPublico", a.oradorPublico || "");
  setVal("congregacionVisitante", a.congregacionVisitante || "");
  setVal("tituloDiscurso", a.tituloDiscurso || "");
  setVal("tituloSiguienteSemana", a.tituloSiguienteSemana || "");
}

function validateNoDuplicates() {
  const fields = [
    { id: "multimedia1", label: "Multimedia 1" },
    { id: "multimedia2", label: "Multimedia 2" },
    { id: "acomodadorEntrada", label: "Acomodador Entrada" },
    { id: "acomodadorAuditorio", label: "Acomodador Auditorio" },
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
      setStatus("Datos cargados.");
    } else {
      setStatus("No hay datos guardados para esta semana. Podés cargar y guardar.");
      await aplicarAutoVisitante(s);
    }
  } catch (e) {
    console.error(e);
    setStatus("Error cargando datos. Revisá consola (F12) y permisos de Firestore.", true);
  }
}

async function guardar() {
  const s = semanaISO();
  if (!s) return setStatus("Elegí una semana (fecha).", true);

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
    "acomodadorAuditorio",
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
  window.location.href = `presidente.html?semana=${encodeURIComponent(s)}`;
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

  const lines = [];
  lines.push(`*Asignaciones de esta semana*`);
  lines.push(`Jueves ${fmtAR(jue)} (20:00) y Sábado ${fmtAR(sab)} (19:30)`);
  lines.push("");
  lines.push(`*Acomodadores*`);
  lines.push(`• Plataforma: ${plat}`);
  lines.push(`• Entrada: ${ent}`);
  lines.push(`• Auditorio: ${aud}`);
  lines.push("");
  lines.push(`*Multimedia*`);
  lines.push(`• ${m1} / ${m2}`);
  return lines.join("\n");
}

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
      resolve(user);
    });
  });

  $("btnSalir")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
  $("btnCargar")?.addEventListener("click", cargarSemana);
  $("btnGuardar")?.addEventListener("click", guardar);
  $("btnLimpiar")?.addEventListener("click", limpiar);
  $("btnPdfPresidente")?.addEventListener("click", abrirPdfPresidente);

  $("btnGenerarAviso")?.addEventListener("click", generarAviso);
  $("btnCopiarAviso")?.addEventListener("click", copiarAviso);
  $("btnWhatsappAviso")?.addEventListener("click", whatsappAviso);

  $("btnCargarMes")?.addEventListener("click", cargarMes);
  $("btnGuardarMes")?.addEventListener("click", guardarMes);
  $("btnImprimirMes")?.addEventListener("click", imprimirMes);

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

  try {
    await cargarPersonas();
    poblarSelects();
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

  const s0 = semanaISO();
  if (s0) await cargarSemana();

  if ($("mes")) $("mes").value = monthISOFromDateISO(s0) || isoMonthToday();
  renderMesSemanaOptions(getVal("mes"));
  await cargarMes();
}

init();