// js/pages/importar.js
// Importa tu Asignaciones.xlsx (estructura Marcelo) a Firestore.
// - Lee hojas: "Programa", "Acomodadores", "Multimedia"
// - Crea/actualiza docs en /asignaciones/{YYYY-MM-DD} (fecha del sábado de esa semana)
// - NO borra nada. Si existe, solo completa campos vacíos (no pisa lo ya cargado).

import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError = false) {
  const host = $("toastHost");
  if (!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(() => { host.innerHTML = ""; }, 6000);
}

async function getUsuario(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
}

function renderTopbar(active) {
  const el = document.getElementById("topbar");
  if (!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active === 'panel' ? 'active' : ''}">Panel</a>
        <a href="asignaciones.html" class="${active === 'asignaciones' ? 'active' : ''}">Asignaciones</a>
        <a href="personas.html" class="${active === 'personas' ? 'active' : ''}">Personas</a>
        <a href="discursantes.html" class="${active === 'discursantes' ? 'active' : ''}">Discursantes</a>
        <a href="imprimir.html" class="${active === 'imprimir' ? 'active' : ''}">Imprimir</a>
        <a href="importar.html" class="${active === 'importar' ? 'active' : ''}">Importar</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

function ensureTopbarStyles() {
  if (document.getElementById("topbarStyle")) return;
  const s = document.createElement("style");
  s.id = "topbarStyle";
  s.textContent = `
    .topbar{display:flex;justify-content:space-between;align-items:center;gap:14px;
      background:#1a4fa3;color:#fff;padding:10px 14px;border-radius:14px;margin:14px auto;max-width:1100px;}
    .topbar .brand{font-weight:800}
    .topbar .links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .topbar a{color:#fff;text-decoration:none;font-weight:700;font-size:13px;opacity:.92}
    .topbar a.active{text-decoration:underline;opacity:1}
    .topbar .btn.danger{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}
  `;
  document.head.appendChild(s);
}

async function requireActiveAdmin(activePage) {
  ensureTopbarStyles();
  renderTopbar(activePage);

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = "index.html"; return; }
      const u = await getUsuario(user.uid);
      if (!u?.activo) {
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }
      if (!["admin", "superadmin", "editor"].includes((u.rol || "").toLowerCase())) {
        toast("No tenés permisos para importar (necesitás rol admin/superadmin/editor).", true);
        window.location.href = "panel.html";
        return;
      }
      resolve({ user, usuario: u });
    });
  });
}

// --------- Helpers de parsing ---------
function normName(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin acentos
    .replace(/\s+/g, " ");
}

function toISODate(d) {
  // d: Date
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isDate(x) {
  return x instanceof Date && !isNaN(x.getTime());
}

function parseDayFromLabel(label) {
  // "Jueves/5" "Sábado/28" "Sabado/14"
  const m = (label || "").toString().match(/\/\s*(\d{1,2})\s*$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  return Number.isFinite(day) ? day : null;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function setIfPresent(target, key, value) {
  if (value === undefined || value === null) return;
  const s = (typeof value === "string") ? value.trim() : value;
  if (s === "") return;
  target[key] = s;
}

// --------- Carga de personas (para mapear nombres -> IDs) ---------
async function loadPersonasIndex() {
  const snap = await getDocs(collection(db, "personas"));
  const personas = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }))
    .filter(p => p.activo !== false);

  const byId = new Map(); // id->nombre

  const exact = new Map(); // norm(nombre)->id
  const tokensIndex = [];  // {id, tokens[]}

  for (const p of personas) {
    if (p.id && p.nombre) byId.set(p.id, String(p.nombre));
    const n = normName(p.nombre);
    if (!n) continue;
    if (!exact.has(n)) exact.set(n, p.id);
    const tokens = n.split(" ").filter(Boolean);
    tokensIndex.push({ id: p.id, tokens });
  }

  function resolveIdByName(name) {
    const n = normName(name);
    if (!n) return "";
    if (exact.has(n)) return exact.get(n);

    // Fuzzy simple: mismo apellido (último token) y misma inicial del nombre
    const t = n.split(" ").filter(Boolean);
    if (t.length >= 2) {
      const last = t[t.length - 1];
      const firstInitial = t[0][0];
      const candidates = tokensIndex.filter(p => {
        const pt = p.tokens;
        if (pt.length < 2) return false;
        return pt[pt.length - 1] === last && pt[0][0] === firstInitial;
      });
      if (candidates.length === 1) return candidates[0].id;
    }
    return "";
  }

  function nameById(id){ return byId.get(id) || ""; }

  return { resolveIdByName, nameById, personasCount: personas.length };
}

// --------- Parse del Excel de Marcelo ---------
function parsePrograma(sheetRows) {
  // Devuelve: Map<isoSabado, partialAsignaciones>
  const out = new Map();
  let currentDate = null;

  for (const row of sheetRows) {
    const a = row?.[0];
    if (isDate(a)) {
      currentDate = a;
      const iso = toISODate(currentDate);
      if (!out.has(iso)) out.set(iso, {});
      continue;
    }
    if (!currentDate) continue;

    const label = (row?.[0] || "").toString().trim().toLowerCase();
    const b = row?.[1];
    const c = row?.[2];
    const d = row?.[3];

    const rec = out.get(toISODate(currentDate));

    if (label.startsWith("presidente")) {
      setIfPresent(rec, "presidenteNombre", b);
      // "Oración:" en col C, nombre en col D
      if ((c || "").toString().toLowerCase().includes("oración")) {
        setIfPresent(rec, "oracionNombre", d);
      }
    } else if (label.startsWith("discursante")) {
      setIfPresent(rec, "oradorPublico", b);
      if ((c || "").toString().toLowerCase().includes("congreg")) {
        setIfPresent(rec, "congregacionVisitante", d);
      }
    } else if (label.startsWith("titulo")) {
      setIfPresent(rec, "tituloDiscurso", b);
    } else if (label.startsWith("atalaya")) {
      setIfPresent(rec, "conductorAtalayaNombre", b);
      if ((c || "").toString().toLowerCase().includes("lector")) {
        setIfPresent(rec, "lectorAtalayaNombre", d);
      }
    }
  }
  return out;
}

function parseAcomodadores(sheetRows) {
  // Map<isoSabado, {acomodadorEntradaNombre, acomodadorAuditorioNombre}>
  const out = new Map();
  let monthAnchor = null; // Date con año/mes

  for (const row of sheetRows) {
    const a = row?.[0];
    if (isDate(a)) { monthAnchor = a; continue; }
    if (!monthAnchor) continue;

    if (typeof a === "string" && /jueves/i.test(a)) {
      const day = parseDayFromLabel(a);
      if (!day) continue;
      const jueves = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), day);
      const sabado = addDays(jueves, 2);
      const iso = toISODate(sabado);

      const rec = out.get(iso) || {};
      setIfPresent(rec, "acomodadorEntradaNombre", row?.[1]);
      setIfPresent(rec, "acomodadorAuditorioNombre", row?.[2]);
      out.set(iso, rec);
    }
  }
  return out;
}

function parseMultimedia(sheetRows) {
  // Map<isoSabado, {multimedia1Nombre, microfonista1Nombre, plataformaNombre}>
  // Regla: si existe fila de "Sábado", esa manda. Si no, usa "Jueves" (jueves+2).
  const out = new Map();
  let monthAnchor = null;

  for (const row of sheetRows) {
    const a = row?.[0];
    if (isDate(a)) { monthAnchor = a; continue; }
    if (!monthAnchor) continue;

    if (typeof a !== "string") continue;

    const isThu = /jueves/i.test(a);
    const isSat = /s[aá]bado/i.test(a) || /sabado/i.test(a);

    if (!isThu && !isSat) continue;

    const day = parseDayFromLabel(a);
    if (!day) continue;

    const date = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), day);
    const sabado = isSat ? date : addDays(date, 2);
    const iso = toISODate(sabado);

    const rec = out.get(iso) || {};

    // columnas: Semana | Sonido | Micrófonos | Plataforma
    // En tu app: multimedia1Id/multimedia2Id, microfonista1Id/microfonista2Id, plataformaId
    // Usamos: Sonido -> multimedia1, Micrófonos -> microfonista1, Plataforma -> plataforma
    // (microfonista2 y multimedia2 quedan para completar manualmente si hace falta)
    const patch = {};
    setIfPresent(patch, "multimedia1Nombre", row?.[1]);
    setIfPresent(patch, "microfonista1Nombre", row?.[2]);
    setIfPresent(patch, "plataformaNombre", row?.[3]);

    if (isSat) {
      // sábado manda: pisa lo que hubiera de jueves en este mapa (solo en nombres, más abajo resolvemos IDs)
      Object.assign(rec, patch);
    } else {
      // jueves: solo completa si no existe (por si hay sábados con valores)
      for (const k of Object.keys(patch)) {
        if (!rec[k]) rec[k] = patch[k];
      }
    }

    out.set(iso, rec);
  }

  return out;
}

// --------- Merge final y escritura ---------


function parseAsignacionesEditable(rows){
  // Hoja "Asignaciones" exportada desde la base.
  // Columnas esperadas (por nombres):
  // semana, presidente, oracionInicial, oracionFinal, discursoOrador, discursoCongregacion, discursoTitulo,
  // atalayaConductor, atalayaLector, plataforma, entrada, auditorio, microfonista1, microfonista2, multimedia1, multimedia2
  const programa = new Map();
  const acomodadores = new Map();
  const multimedia = new Map();

  for(const r of rows){
    const semanaRaw = r.semana ?? r.Semana ?? r.fecha ?? r.Fecha;
    const iso = normalizeAnyDateToISO(semanaRaw);
    if(!iso) continue;

    programa.set(iso, {
      presidenteNombre: r.presidente ?? "",
      oracionNombre: (r.oracionInicial ?? r.oracion ?? "") || (r.oracionFinal ?? "") || "",
      conductorAtalayaNombre: r.atalayaConductor ?? "",
      lectorAtalayaNombre: r.atalayaLector ?? "",
      oradorPublico: r.discursoOrador ?? "",
      congregacionVisitante: r.discursoCongregacion ?? "",
      tituloDiscurso: r.discursoTitulo ?? ""
    });

    acomodadores.set(iso, {
      acomodadorEntradaNombre: r.entrada ?? "",
      acomodadorAuditorioNombre: r.auditorio ?? ""
    });

    multimedia.set(iso, {
      multimedia1Nombre: r.multimedia1 ?? "",
      plataformaNombre: r.plataforma ?? "",
      microfonista1Nombre: r.microfonista1 ?? "",
      // si vienen segundos:
      multimedia2Nombre: r.multimedia2 ?? "",
      microfonista2Nombre: r.microfonista2 ?? ""
    });
  }

  return { programa, acomodadores, multimedia };
}

function normalizeAnyDateToISO(v){
(v){
  // Acepta: Date, string 'YYYY-MM-DD', string 'DD/MM', etc (en export solo usamos YYYY-MM-DD).
  if(!v) return null;
  if(v instanceof Date && !isNaN(v)) return toISO(v);
  if(typeof v === "number"){
    // Excel date serial
    try{
      const d = XLSX.SSF.parse_date_code(v);
      if(d && d.y && d.m && d.d){
        return `${String(d.y).padStart(4,"0")}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
      }
    }catch(_){}
  }
  if(typeof v === "string"){
    const s = v.trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // intenta DD/MM/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m){
      const dd = m[1].padStart(2,"0"), mm = m[2].padStart(2,"0"), yy = m[3];
      return `${yy}-${mm}-${dd}`;
    }
  }
  return null;
}

function buildMergedRecords({ programa, acomodadores, multimedia }, resolver) {
  // arma Map<iso, asignacionesFinal>
  const allDates = new Set([
    ...programa.keys(),
    ...acomodadores.keys(),
    ...multimedia.keys()
  ]);

  const out = new Map();
  const missing = new Map(); // nombre->count

  function idOrMissing(name) {
    const id = resolver.resolveIdByName(name);
    if (!id && name && name.toString().trim()) {
      const k = name.toString().trim();
      missing.set(k, (missing.get(k) || 0) + 1);
    }
    return id || "";
  }

  for (const iso of Array.from(allDates).sort()) {
    const p = programa.get(iso) || {};
    const a = acomodadores.get(iso) || {};
    const m = multimedia.get(iso) || {};

    const rec = {
      // IDs de personas
      presidenteId: idOrMissing(p.presidenteNombre),
      oracionInicialId: idOrMissing(p.oracionNombre || p.presidenteNombre),
      oracionFinalId: idOrMissing(p.oracionNombre || p.presidenteNombre),

      conductorAtalayaId: idOrMissing(p.conductorAtalayaNombre),
      lectorAtalayaId: idOrMissing(p.lectorAtalayaNombre),

      multimedia1Id: idOrMissing(m.multimedia1Nombre),
      multimedia2Id: "",

      plataformaId: idOrMissing(m.plataformaNombre),

      microfonista1Id: idOrMissing(m.microfonista1Nombre),
      microfonista2Id: "",

      acomodadorEntradaId: idOrMissing(a.acomodadorEntradaNombre),
      acomodadorAuditorioId: idOrMissing(a.acomodadorAuditorioNombre),

      // Textos
      cancionNumero: "",
      oradorPublico: (p.oradorPublico || "").toString().trim(),
      congregacionVisitante: (p.congregacionVisitante || "").toString().trim(),
      tituloDiscurso: (p.tituloDiscurso || "").toString().trim(),
      tituloSiguienteSemana: ""
    };

    out.set(iso, rec);
  }

  return { records: out, missing };
}

function renderPreviewTable(recordsMap) {
  const head = $("tbl")?.querySelector("thead");
  const body = $("tbl")?.querySelector("tbody");
  if (!head || !body) return;

  const cols = [
    "fechaSab",
    "presidenteId",
    "oracionInicialId",
    "conductorAtalayaId",
    "lectorAtalayaId",
    "multimedia1Id",
    "microfonista1Id",
    "plataformaId",
    "acomodadorEntradaId",
    "acomodadorAuditorioId",
    "oradorPublico",
    "congregacionVisitante",
    "tituloDiscurso"
  ];

  head.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

  const rows = Array.from(recordsMap.entries()).slice(0, 20).map(([iso, r]) => {
    const row = { fechaSab: iso, ...r };
    return `<tr>${cols.map(c => `<td>${(row[c] ?? "").toString()}</td>`).join("")}</tr>`;
  }).join("");

  body.innerHTML = rows || `<tr><td colspan="${cols.length}">Sin datos para mostrar.</td></tr>`;
}

async function safeUpsertAsignacion(iso, incoming) {
  // NO pisa lo ya cargado: solo completa campos vacíos.
  const ref = doc(db, "asignaciones", iso);
  const snap = await getDoc(ref);

  const existing = snap.exists() ? (snap.data()?.asignaciones || {}) : {};
  const merged = { ...existing };

  for (const [k, v] of Object.entries(incoming || {})) {
    const ex = existing?.[k];
    const exEmpty = ex === undefined || ex === null || ex === "";
    if (exEmpty && v !== undefined && v !== null && v !== "") {
      merged[k] = v;
    }
  }

  await setDoc(ref, { asignaciones: merged, updatedAt: serverTimestamp() }, { merge: true });
}

function readSheetRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  // header:1 => array de arrays, cellDates true => Date
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

let ctx = null; // { resolveIdByName, personasCount }
let lastRecords = null; // Map
let lastMissing = null; // Map

async function handleFile(file) {
  if (typeof XLSX === "undefined") {
    toast("No se cargó la librería XLSX (SheetJS). Revisá tu conexión o si un bloqueador impide el CDN.", true);
    return;
  }

  if (!file) return;

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  // Si existe la hoja "Asignaciones", es el Excel editable exportado desde la base.
const rowsAsign = readSheetRows(wb, "Asignaciones");
if (rowsAsign) {
  if (!ctx) ctx = await loadPersonasIndex();
  const maps = parseAsignacionesEditable(rowsAsign);
  const { records, missing } = buildMergedRecords(maps, ctx);
  lastRecords = records;
  lastMissing = missing;
  renderPreview(records, missing);
  toast(`Listo: ${records.size} semana(s) detectada(s) desde la hoja "Asignaciones".`);
  return;
}


  // Hojas esperadas (tu Asignaciones.xlsx original)
  const rowsPrograma = readSheetRows(wb, "Programa");
  const rowsAcomod = readSheetRows(wb, "Acomodadores");
  const rowsMulti = readSheetRows(wb, "Multimedia");

  if (!rowsPrograma && !rowsAcomod && !rowsMulti) {
    toast("No encontré hojas 'Programa', 'Acomodadores' o 'Multimedia' en el Excel.", true);
    return;
  }

  // llenar dropdown de hojas (solo informativo)
  const sel = $("sheet");
  if (sel) {
    sel.disabled = false;
    sel.innerHTML = wb.SheetNames.map(n => `<option>${n}</option>`).join("");
  }

  const programa = rowsPrograma ? parsePrograma(rowsPrograma) : new Map();
  const acomodadores = rowsAcomod ? parseAcomodadores(rowsAcomod) : new Map();
  const multimedia = rowsMulti ? parseMultimedia(rowsMulti) : new Map();

  const { records, missing } = buildMergedRecords({ programa, acomodadores, multimedia }, ctx);

  lastRecords = records;
  lastMissing = missing;

  renderPreviewTable(records);

  const total = records.size;
  toast(`Listo: detecté ${total} semana(s) para importar. Personas activas: ${ctx.personasCount}.`);
  if (missing.size) {
    const top = Array.from(missing.entries()).slice(0, 8).map(([n, c]) => `${n} (${c})`).join(" · ");
    toast(`Ojo: faltan ${missing.size} nombre(s) en Personas. Ej: ${top}`, true);
  }
}



async function doExport() {
  if (typeof XLSX === "undefined") {
    toast("No se cargó la librería XLSX (SheetJS).", true);
    return;
  }
  if (!ctx) ctx = await loadPersonasIndex();

  const desde = $("desde")?.value || null;
  const hasta = $("hasta")?.value || null;

  toast("Leyendo asignaciones desde la base…");

  const snap = await getDocs(collection(db, "asignaciones"));
  const rows = [];

  const nm = (id) => id ? (ctx.nameById(id) || "") : "";

  snap.forEach(d => {
    const iso = d.id; // esperamos YYYY-MM-DD
    if (desde && iso < desde) return;
    if (hasta && iso > hasta) return;

    const data = d.data();
    const a = data.asignaciones || data;

    rows.push({
      semana: iso,
      presidente: nm(a.presidenteId),
      oracionInicial: nm(a.oracionInicialId),
      oracionFinal: nm(a.oracionFinalId),
      discursoOrador: (a.oradorPublico || "").toString(),
      discursoCongregacion: (a.congregacionVisitante || "").toString(),
      discursoTitulo: (a.tituloDiscurso || "").toString(),
      atalayaConductor: nm(a.conductorAtalayaId),
      atalayaLector: nm(a.lectorAtalayaId),
      plataforma: nm(a.plataformaId),
      entrada: nm(a.acomodadorEntradaId),
      auditorio: nm(a.acomodadorAuditorioId),
      microfonista1: nm(a.microfonista1Id),
      microfonista2: nm(a.microfonista2Id),
      multimedia1: nm(a.multimedia1Id),
      multimedia2: nm(a.multimedia2Id)
    });
  });

  rows.sort((x, y) => (x.semana || "").localeCompare(y.semana || ""));

  if (!rows.length) {
    toast("No se encontraron asignaciones en ese rango.", true);
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows, { header: [
    "semana","presidente","oracionInicial","oracionFinal",
    "discursoOrador","discursoCongregacion","discursoTitulo",
    "atalayaConductor","atalayaLector",
    "plataforma","entrada","auditorio",
    "microfonista1","microfonista2","multimedia1","multimedia2"
  ]});
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Asignaciones");

  const fname = `Asignaciones_editable_${(desde || "todo")}_a_${(hasta || "todo")}.xlsx`.replaceAll(":", "-");
  XLSX.writeFile(wb, fname);

  toast(`Descargado: ${rows.length} semana(s) en ${fname}`);
}

async function doPreview() {
  const f = $("file")?.files?.[0];
  if (!f) return toast("Elegí el archivo .xlsx primero.", true);
  await handleFile(f);
}

async function doImport() {
  if (!lastRecords || !lastRecords.size) {
    await doPreview();
    if (!lastRecords || !lastRecords.size) return;
  }

  $("btnImport").disabled = true;
  $("btnPreview").disabled = true;

  const dates = Array.from(lastRecords.keys());
  let ok = 0, fail = 0;

  try {
    for (const iso of dates) {
      const rec = lastRecords.get(iso);
      try {
        await safeUpsertAsignacion(iso, rec);
        ok++;
      } catch (e) {
        console.error("Fallo importando", iso, e);
        fail++;
      }
    }
  } finally {
    $("btnImport").disabled = false;
    $("btnPreview").disabled = false;
  }

  toast(`Importación terminada. OK: ${ok} · Fallos: ${fail}.`);
  if (lastMissing?.size) {
    toast(`Recordatorio: faltan ${lastMissing.size} nombre(s) en Personas. Cargalos y volvé a importar (no pisa lo ya cargado).`, true);
  }
}

(async function () {
  try {
    await requireActiveAdmin("importar");

    // Verificar XLSX
    if (typeof XLSX === "undefined") {
      toast("No se cargó la librería XLSX (SheetJS). Si usás bloqueador (uBlock, Brave Shields), permití cdn.sheetjs.com.", true);
      return;
    }

    ctx = await loadPersonasIndex();

    $("btnPreview")?.addEventListener("click", async () => {
      try { await doPreview(); } catch (e) { console.error(e); toast("Error en vista previa: " + (e?.message || e), true); }
    });
    $("btnImport")?.addEventListener("click", async () => {
      try { await doImport(); } catch (e) { console.error(e); toast("Error al importar: " + (e?.message || e), true); }
    });

$("btnExport")?.addEventListener("click", async () => {
  try { await doExport(); } catch (e) { console.error(e); toast("Error al exportar: " + (e?.message || e), true); }
});


    $("file")?.addEventListener("change", async (e) => {
      try {
        const f = e.target?.files?.[0];
        if (f) await handleFile(f);
      } catch (e2) {
        console.error(e2);
        toast("Error al leer el archivo: " + (e2?.message || e2), true);
      }
    });

    toast("Subí tu Asignaciones.xlsx y tocá 'Vista previa'. Luego 'Importar a Firestore'.");
  } catch (e) {
    console.error(e);
    toast("Error al iniciar Importar: " + (e?.message || e), true);
  }
})();