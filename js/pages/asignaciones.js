// js/pages/asignaciones.js
// Parche de reparación - 2026-03-24
// Corrige:
// 1) error de sintaxis en renderMesPreview()
// 2) resolución de nombres usando TODAS las personas, no solo activas
// 3) selectores mostrando solo activas
// 4) oración inicial libre entre hermanos activos
// 5) mejor compatibilidad con asignaciones mensuales por semana

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
import { getAncianosOSiervos, getAncianos, getAcomodadores, getPlataforma, getMultimedia, getMicrofonistas, getLectoresAtalaya } from "../roles/getRoleCandidates.js";

const $ = (id) => document.getElementById(id);
const getVal = (id) => ($(id)?.value ?? "");
const setVal = (id, v) => { const el = $(id); if (el) el.value = v ?? ""; };

function setStatus(msg, isError=false){
  const box = $("status");
  if(!box) return;
  box.textContent = msg;
  box.style.background = isError ? "#fff1f2" : "#f8fafc";
  box.style.borderColor = isError ? "#fecdd3" : "#e5e7eb";
  box.style.color = isError ? "#9f1239" : "#111827";
}

function isoToday(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function addDaysISO(iso, days){
  const d = new Date(`${iso}T00:00:00`);
  if(Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

function addOpt(sel, value, label){
  if(!sel) return;
  const opt = document.createElement("option");
  opt.value = value ?? "";
  opt.textContent = label ?? "";
  sel.appendChild(opt);
}

function normalize(s){
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\.\,\;\:]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizeRole(r){
  return normalize(r).replace(/_/g, " ").replace(/-/g, " ");
}

function displayName(persona){
  return persona?.nombre || "";
}

function rolesSet(persona){
  const arr = Array.isArray(persona?.roles) ? persona.roles : [];
  return new Set(arr.map(normalizeRole));
}

function isMale(persona){
  const g = normalize(persona?.genero || persona?.sexo || persona?.gender || "");
  return g === "masculino" || g === "male" || g === "varon" || g === "hombre" || g === "m";
}

let personas = [];        // todas
let personasActivas = []; // solo activas

const COL_MES = "asignaciones_mensuales";
let lastMesDoc = null;

function monthParts(mesISO){
  const [yS,mS] = String(mesISO || "").split("-");
  const y = parseInt(yS,10);
  const m = parseInt(mS,10);
  if(!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { y, m };
}

function saturdaysInMonth(mesISO){
  const p = monthParts(mesISO);
  if(!p) return [];
  const { y, m } = p;
  const d = new Date(y, m-1, 1);
  const out = [];
  while(d.getMonth() === (m-1)){
    if(d.getDay() === 6){
      out.push(`${y}-${String(m).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    }
    d.setDate(d.getDate()+1);
  }
  return out;
}

function renderMesSemanaOptions(mesISO){
  const sel = $("mesSemana");
  if(!sel) return;
  const sats = saturdaysInMonth(mesISO);
  sel.innerHTML = "";
  if(!mesISO){
    addOpt(sel, "", "— Elegí un mes —");
    return;
  }
  if(!sats.length){
    addOpt(sel, "1", "Semana 1");
    return;
  }
  sats.forEach((iso, idx)=>{
    addOpt(sel, String(idx+1), `Semana ${idx+1} (sáb ${iso.slice(8,10)})`);
  });
  if(!getVal("mesSemana")) setVal("mesSemana", "1");
}

function currentMesSemana(){
  const n = parseInt(String(getVal("mesSemana") || "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "1";
}

function personaNameById(id){
  if(!id) return "";
  return personas.find(p => p.id === id)?.nombre || "";
}

function formMesData(){
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

function emptyMesData(){
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

function ensureOptionById(selectId, personaId){
  const sel = $(selectId);
  if(!sel || !personaId || !sel.options) return;
  const exists = Array.from(sel.options).some(o => o.value === personaId);
  if(exists) return;
  const p = personas.find(x => x.id === personaId);
  if(!p) return;
  addOpt(sel, p.id, displayName(p));
}

function hydrateMesToUI(m){
  if(!m) return;
  const w = currentMesSemana();
  const dataWeek = (m.semanas && m.semanas[w]) ? m.semanas[w] : (m.semanas ? emptyMesData() : m);

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

function renderMesPreview(mesISO, docData){
  const box = $("printMes");
  if(!box) return;

  const monthLabel = mesISO || "—";
  const sats = saturdaysInMonth(mesISO);
  const totalWeeks = Math.max(1, sats.length || 1);
  const semanas = (docData && docData.semanas) ? docData.semanas : null;
  const fallback = (docData && !docData.semanas) ? docData : null;

  const rows = [];

  for(let i=1; i<=totalWeeks; i++){
    const key = String(i);
    const d = (semanas && semanas[key]) ? semanas[key] : (i===1 && fallback ? fallback : emptyMesData());
    const satISO = sats[i-1] || "";
    const thuISO = satISO ? addDaysISO(satISO, -2) : "";

    const fechaLabel = (thuISO && satISO)
      ? `Jue ${thuISO.slice(8,10)} / Sab ${satISO.slice(8,10)}`
      : `Semana ${i}`;

    rows.push(`
      <tr>
        <td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">${i}</td>
        <td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">${fechaLabel}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.plataformaId) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.acomodadorEntradaId) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.acomodadorAuditorioId) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.multimedia1Id) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.multimedia2Id) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.microfonista1Id) || "—"}</td>
        <td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.microfonista2Id) || "—"}</td>
      </tr>
    `);
  }

  box.innerHTML = `
    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
      <h3 style="margin:0 0 8px 0; color:#111827;">Asignaciones del mes: ${monthLabel}</h3>
      <div style="font-size:13px; color:#374151; margin-bottom:12px;">Para tablero de anuncios (Villa Fiad)</div>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Sem.</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Fecha</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Plataforma</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Acom. entrada</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Acom. auditorio</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Multimedia 1</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Multimedia 2</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Micro 1</th>
            <th style="text-align:left; padding:8px; border:1px solid #e5e7eb;">Micro 2</th>
          </tr>
        </thead>
        <tbody>${rows.join("\n")}</tbody>
      </table>
      <div style="font-size:12px; color:#6b7280; margin-top:10px;">
        Generado desde el panel. Seleccioná semana, guardá e imprimí.
      </div>
    </div>
  `;
}

async function cargarMes(){
  const mesISO = String(getVal("mes") || "").trim();
  if(!mesISO) return setStatus("Elegí un mes.", true);
  setStatus("Cargando mes…");
  try{
    const snap = await getDoc(doc(db, COL_MES, mesISO));
    if(snap.exists()){
      const data = snap.data() || {};
      lastMesDoc = data;
      hydrateMesToUI(data);
      renderMesPreview(mesISO, data);
      setStatus("Mes cargado.");
    }else{
      lastMesDoc = { semanas: {} };
      hydrateMesToUI(lastMesDoc);
      renderMesPreview(mesISO, null);
      setStatus("No hay datos para ese mes. Completá y guardá.");
    }
  }catch(e){
    console.error(e);
    setStatus("Error cargando el mes. Revisá permisos de Firestore.", true);
  }
}

async function guardarMes(){
  const mesISO = String(getVal("mes") || "").trim();
  if(!mesISO) return setStatus("Elegí un mes.", true);

  const weekKey = currentMesSemana();
  const weekData = formMesData();
  setStatus("Guardando mes…");

  try{
    await setDoc(doc(db, COL_MES, mesISO), {
      semanas: { [weekKey]: weekData },
      updatedAt: serverTimestamp(),
    }, { merge: true });

    const snap = await getDoc(doc(db, COL_MES, mesISO));
    const data = snap.exists() ? (snap.data() || {}) : { semanas: { [weekKey]: weekData } };
    lastMesDoc = data;
    hydrateMesToUI(data);
    renderMesPreview(mesISO, data);
    setStatus("Mes guardado OK.");
  }catch(e){
    console.error(e);
    setStatus("No pude guardar el mes. Revisá permisos de Firestore.", true);
  }
}

async function cargarPersonas(){
  const snap = await getDocs(collection(db, "personas"));
  personas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p?.nombre);
  personas.sort((a,b) => displayName(a).localeCompare(displayName(b), "es", { sensitivity:"base" }));
  personasActivas = personas.filter(p => p.activo === true);
}

function fillSelect(id, filterFn){
  const sel = $(id);
  if(!sel) return;
  sel.innerHTML = "";
  addOpt(sel, "", "— Seleccionar —");
  for(const p of personasActivas){
    if(filterFn(p)) addOpt(sel, p.id, displayName(p));
  }
}

function poblarSelects(){
  const ancSiervos = getAncianosOSiervos(personasActivas);
  const ancianos = getAncianos(personasActivas);
  const acomodadores = getAcomodadores(personasActivas);
  const plataforma = getPlataforma(personasActivas);
  const multimedia = getMultimedia(personasActivas);
  const microfonistas = getMicrofonistas(personasActivas);
  const lectoresAtalaya = getLectoresAtalaya(personasActivas);

  const byIds = (arr) => {
    const set = new Set((arr || []).map(p => p.id));
    return (p) => set.has(p.id);
  };

  // Libre para cualquier hermano activo
  fillSelect("oracionInicial", (p) => isMale(p));

  // Resto según reglas existentes
  fillSelect("presidente", byIds(ancSiervos));
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

const cancionesMap = new Map(Object.entries(canciones).map(([k,v]) => [Number(k), String(v)]));
const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v]) => [Number(k), String(v)]));

function normNumero(v){
  const n = parseInt(String(v || "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function aplicarAutoDiscurso(){
  const num = normNumero(getVal("discursoNumero"));
  if(!num) return;
  const t = bosquejosMap.get(num);
  if(t && !getVal("tituloDiscurso").trim()) setVal("tituloDiscurso", t);
}

function localVisitanteFor(fechaISO){
  const v = visitantesLocal[fechaISO];
  if(v) return v;
  const plus = addDaysISO(fechaISO, 1);
  const minus = addDaysISO(fechaISO, -1);
  return visitantesLocal[plus] || visitantesLocal[minus] || null;
}

async function firestoreVisitFor(fechaISO){
  try{
    const snap = await getDoc(doc(db, "visitas", fechaISO));
    if(snap.exists()) return { id: snap.id, ...snap.data() };
  }catch(_){}

  const fields = ["fecha", "fechaISO", "semana", "dia"];
  for(const f of fields){
    try{
      const qy = query(collection(db, "visitas"), where(f, "==", fechaISO));
      const s = await getDocs(qy);
      if(!s.empty) return { id: s.docs[0].id, ...s.docs[0].data() };
    }catch(_){}
  }

  try{
    const s = await getDocs(collection(db, "visitas"));
    for(const d of s.docs){
      const data = d.data() || {};
      const fx = String(data.fecha || data.fechaISO || data.semana || data.dia || "").slice(0,10);
      if(fx === fechaISO) return { id: d.id, ...data };
    }
  }catch(_){}

  return null;
}

function extractVisitFields(v){
  if(!v) return null;
  return {
    nombre: v.orador || v.oradorPublico || v.nombre || v.conferenciante || "",
    congregacion: v.congregacion || v.congregacionVisitante || v.congreg || "",
    titulo: v.titulo || v.tituloDiscurso || v.tema || "",
    bosquejo: v.bosquejo || v.numero || v.discursoNumero || v.b || "",
    cancion: v.cancion || v.cancionNumero || v.c || "",
  };
}

async function aplicarAutoVisitante(semanaISO){
  if(!semanaISO) return;

  let vf = extractVisitFields(await firestoreVisitFor(semanaISO));
  if(!vf){
    const local = localVisitanteFor(semanaISO);
    vf = local ? {
      nombre: local.nombre || "",
      congregacion: local.congregacion || "",
      titulo: local.titulo || "",
      bosquejo: local.bosquejo || "",
      cancion: local.cancion || "",
    } : null;
  }

  if(vf){
    if(!getVal("oradorPublico").trim() && vf.nombre) setVal("oradorPublico", vf.nombre);
    if(!getVal("congregacionVisitante").trim() && vf.congregacion) setVal("congregacionVisitante", vf.congregacion);
    if(!getVal("tituloDiscurso").trim() && vf.titulo) setVal("tituloDiscurso", vf.titulo);
    if(!getVal("cancionNumero").trim() && vf.cancion) setVal("cancionNumero", String(vf.cancion));
  }

  const nextISO = addDaysISO(semanaISO, 7);
  if(!getVal("tituloSiguienteSemana").trim() && nextISO){
    let v2f = extractVisitFields(await firestoreVisitFor(nextISO));
    if(!v2f){
      const local2 = localVisitanteFor(nextISO);
      v2f = local2 ? { titulo: local2.titulo || "" } : null;
    }
    if(v2f?.titulo) setVal("tituloSiguienteSemana", v2f.titulo);
  }
}

// Mantener export vacío para evitar errores si el proyecto lo importa.
export {};
