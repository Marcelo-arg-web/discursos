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

import { getAncianosOSiervos, getAncianos, getAcomodadores, getPlataforma, getMultimedia, getMicrofonistas, getLectoresAtalaya } from "../roles/getRoleCandidates.js";

// ---------------- UI helpers ----------------
const $ = (id) => document.getElementById(id);
const getVal = (id) => ($ (id)?.value ?? "");
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
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const da=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

function addDaysISO(iso, days){
  const d = new Date(iso+"T00:00:00");
  if(Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

function clearSelect(id){
  const el = $(id);
  if(el) el.innerHTML = "";
}

function addOpt(sel, value, label){
  const opt=document.createElement('option');
  opt.value=value;
  opt.textContent=label;
  sel.appendChild(opt);
}

function normalize(s){
  return String(s||"")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\.\,\;\:]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizeRole(r){
  const n = normalize(r)
    .replace(/_/g,' ')
    .replace(/-/g,' ');
  return n;
}


function displayName(persona){
  return persona?.nombre || "";
}
function rolesSet(persona){
  const arr = Array.isArray(persona?.roles) ? persona.roles : [];
  return new Set(arr.map(normalizeRole));
}

function hasAncianoOrSiervo(persona){
  const rs = rolesSet(persona);
  return rs.has('anciano') || rs.has('siervo ministerial') || rs.has('siervoministerial') || rs.has('siervo');
}

function hasAnciano(persona){
  const rs = rolesSet(persona);
  return rs.has('anciano');
}

// ---------------- Lists (en js/roles/*) ----------------

// ---------------- Data ----------------
let personas = []; // {id, nombre, roles, activo, ...}

// ---------------- Asignaciones mensuales (tablero) ----------------
const COL_MES = "asignaciones_mensuales";

function monthISOFromDateISO(dateISO){
  // "2026-02-28" -> "2026-02"
  if(!dateISO) return "";
  return String(dateISO).slice(0,7);
}

function isoMonthToday(){
  const d = new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}

function personaNameById(id){
  if(!id) return "";
  return (personas.find(p=>p.id===id)?.nombre) || "";
}

function fillSelectByIds(selectId, arrIds){
  const set = new Set((arrIds||[]).map(p=>p.id));
  fillSelect(selectId, (p)=> set.has(p.id));
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

function hydrateMesToUI(m){
  if(!m) return;
  [
    ["mesPlataforma", m.plataformaId],
    ["mesAcomodadorEntrada", m.acomodadorEntradaId],
    ["mesAcomodadorAuditorio", m.acomodadorAuditorioId],
    ["mesMultimedia1", m.multimedia1Id],
    ["mesMultimedia2", m.multimedia2Id],
    ["mesMicrofonista1", m.microfonista1Id],
    ["mesMicrofonista2", m.microfonista2Id],
  ].forEach(([sid, pid])=> ensureOptionById(sid, pid));

  setVal("mesPlataforma", m.plataformaId||"");
  setVal("mesAcomodadorEntrada", m.acomodadorEntradaId||"");
  setVal("mesAcomodadorAuditorio", m.acomodadorAuditorioId||"");
  setVal("mesMultimedia1", m.multimedia1Id||"");
  setVal("mesMultimedia2", m.multimedia2Id||"");
  setVal("mesMicrofonista1", m.microfonista1Id||"");
  setVal("mesMicrofonista2", m.microfonista2Id||"");
}

function renderMesPreview(mesISO, data){
  const box = $("printMes");
  if(!box) return;
  const monthLabel = mesISO ? mesISO : "—";
  const d = data || formMesData();

  box.innerHTML = `
    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
      <h3 style="margin:0 0 8px 0; color:#111827;">Asignaciones del mes: ${monthLabel}</h3>
      <div style="font-size:13px; color:#374151; margin-bottom:12px;">Para tablero de anuncios (Villa Fiad)</div>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tbody>
          <tr><td style="padding:8px; border:1px solid #e5e7eb; width:40%; font-weight:700;">Plataforma</td><td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.plataformaId) || "—"}</td></tr>
          <tr><td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">Acomodador entrada</td><td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.acomodadorEntradaId) || "—"}</td></tr>
          <tr><td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">Acomodador auditorio</td><td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.acomodadorAuditorioId) || "—"}</td></tr>
          <tr><td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">Multimedia 1</td><td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.multimedia1Id) || "—"}</td></tr>
          <tr><td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">Multimedia 2</td><td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.multimedia2Id) || "—"}</td></tr>
          <tr><td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">Microfonista 1</td><td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.microfonista1Id) || "—"}</td></tr>
          <tr><td style="padding:8px; border:1px solid #e5e7eb; font-weight:700;">Microfonista 2</td><td style="padding:8px; border:1px solid #e5e7eb;">${personaNameById(d.microfonista2Id) || "—"}</td></tr>
        </tbody>
      </table>
      <div style="font-size:12px; color:#6b7280; margin-top:10px;">
        Generado desde el panel. (Si falta alguien, completalo arriba y guardá.)
      </div>
    </div>
  `;
}

async function cargarMes(){
  const mesISO = (getVal("mes")||"").trim();
  if(!mesISO) return setStatus("Elegí un mes.", true);
  setStatus("Cargando mes…");
  try{
    const snap = await getDoc(doc(db, COL_MES, mesISO));
    if(snap.exists()){
      const data = snap.data() || {};
      hydrateMesToUI(data);
      renderMesPreview(mesISO, data);
      setStatus("Mes cargado.");
    }else{
      renderMesPreview(mesISO, null);
      setStatus("No hay datos para ese mes. Completá y guardá.");
    }
  }catch(e){
    console.error(e);
    setStatus("Error cargando el mes. Revisá permisos de Firestore.", true);
  }
}

async function guardarMes(){
  const mesISO = (getVal("mes")||"").trim();
  if(!mesISO) return setStatus("Elegí un mes.", true);
  setStatus("Guardando mes…");
  const data = formMesData();
  try{
    await setDoc(doc(db, COL_MES, mesISO), {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    renderMesPreview(mesISO, data);
    setStatus("Mes guardado OK.");
  }catch(e){
    console.error(e);
    setStatus("No pude guardar el mes. Revisá permisos de Firestore.", true);
  }
}

function imprimirMes(){
  const mesISO = (getVal("mes")||"").trim();
  if(!mesISO) return setStatus("Elegí un mes.", true);
  renderMesPreview(mesISO, formMesData());
  document.body.classList.add("print-mes");
  // Quita el modo print al terminar
  const cleanup = ()=> document.body.classList.remove("print-mes");
  window.addEventListener("afterprint", cleanup, { once:true });
  window.print();
  // fallback por si afterprint no dispara
  setTimeout(cleanup, 1200);
}

async function cargarPersonas(){
  const qy = query(collection(db, "personas"), where("activo","==", true));
  const snap = await getDocs(qy);
  personas = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(p=>p?.nombre);
  personas.sort((a,b)=> displayName(a).localeCompare(displayName(b), 'es', {sensitivity:'base'}));
}

function fillSelect(id, filterFn){
  const sel = $(id);
  if(!sel) return;
  sel.innerHTML = "";
  addOpt(sel, "", "— Seleccionar —");
  for(const p of personas){
    if(filterFn(p)) addOpt(sel, p.id, displayName(p));
  }
}

function getSelectedPersona(id){
  const pid = getVal(id);
  if(!pid) return null;
  return personas.find(p=>p.id===pid) || null;
}

function ensureOptionById(selectId, personaId){
  const sel = $(selectId);
  if(!sel || !personaId) return;
  const exists = Array.from(sel.options).some(o=>o.value===personaId);
  if(exists) return;
  const p = personas.find(x=>x.id===personaId);
  if(!p) return;
  addOpt(sel, p.id, displayName(p));
}

function poblarSelects(){
  // Calcula candidatos una sola vez
  const ancSiervos = getAncianosOSiervos(personas);
  const ancianos = getAncianos(personas);
  const acomodadores = getAcomodadores(personas);
  const plataforma = getPlataforma(personas);
  const multimedia = getMultimedia(personas);
  const microfonistas = getMicrofonistas(personas);
  const lectoresAtalaya = getLectoresAtalaya(personas);

  const byIds = (arr)=> {
    const set = new Set((arr||[]).map(p=>p.id));
    return (p)=> set.has(p.id);
  };

  // Presidente / Oraciones / Lector Atalaya
  fillSelect("presidente", byIds(ancSiervos));
  fillSelect("oracionInicial", byIds(ancSiervos));
  fillSelect("oracionFinal", byIds(ancSiervos));
  fillSelect("lectorAtalaya", byIds(lectoresAtalaya));

  // Conductor Atalaya: solo ancianos
  fillSelect("conductorAtalaya", byIds(ancianos));

  // Multimedia
  fillSelect("multimedia1", byIds(multimedia));
  fillSelect("multimedia2", byIds(multimedia));

  // Multimedia mensual
  fillSelect("mesMultimedia1", byIds(multimedia));
  fillSelect("mesMultimedia2", byIds(multimedia));

  // Plataforma
  fillSelect("plataforma", byIds(plataforma));

  // Plataforma mensual
  fillSelect("mesPlataforma", byIds(plataforma));

  // Acomodadores
  fillSelect("acomodadorEntrada", byIds(acomodadores));
  fillSelect("acomodadorAuditorio", byIds(acomodadores));

  // Acomodadores mensual
  fillSelect("mesAcomodadorEntrada", byIds(acomodadores));
  fillSelect("mesAcomodadorAuditorio", byIds(acomodadores));

  // Microfonistas
  fillSelect("microfonista1", byIds(microfonistas));
  fillSelect("microfonista2", byIds(microfonistas));

  // Microfonistas mensual
  fillSelect("mesMicrofonista1", byIds(microfonistas));
  fillSelect("mesMicrofonista2", byIds(microfonistas));
}

//
// ---------------- Autocompletado canción y discurso por número ----------------
const cancionesMap = new Map(Object.entries(canciones).map(([k,v])=>[Number(k), String(v)]));
const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v])=>[Number(k), String(v)]));

function normNumero(v){
  const n = parseInt(String(v||"").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function aplicarAutoCancion(){
  const num = normNumero(getVal("cancionNumero"));
  if(!num) return;
  // no hay campo cancionTitulo en el formulario, pero lo dejamos para imprimir
}

function aplicarAutoDiscurso(){
  const num = normNumero(getVal("discursoNumero"));
  if(!num) return;
  const t = bosquejosMap.get(num);
  if(t && !getVal("tituloDiscurso").trim()) setVal("tituloDiscurso", t);
}

// ---------------- Visitantes (Firestore + fallback local) ----------------
function localVisitanteFor(fechaISO){
  const v = visitantesLocal[fechaISO];
  if(v) return v;
  // tolerancia +/- 1 día
  const plus = addDaysISO(fechaISO, 1);
  const minus = addDaysISO(fechaISO, -1);
  return visitantesLocal[plus] || visitantesLocal[minus] || null;
}

async function firestoreVisitFor(fechaISO){
  // 1) doc id = fecha
  try{
    const snap = await getDoc(doc(db, "visitas", fechaISO));
    if(snap.exists()) return { id: snap.id, ...snap.data() };
  }catch(_){/* ignore */}

  // 2) query por campos comunes
  const fields = ["fecha","fechaISO","semana","dia"]; // probar
  for(const f of fields){
    try{
      const qy = query(collection(db, "visitas"), where(f, "==", fechaISO));
      const s = await getDocs(qy);
      if(!s.empty) return { id: s.docs[0].id, ...s.docs[0].data() };
    }catch(_){/* ignore */}
  }

  // 3) fallback: leer todo (suele ser chico)
  try{
    const s = await getDocs(collection(db, "visitas"));
    for(const d of s.docs){
      const data = d.data() || {};
      const fx = (data.fecha || data.fechaISO || data.semana || data.dia || "").toString().slice(0,10);
      if(fx === fechaISO) return { id:d.id, ...data };
    }
  }catch(_){/* ignore */}

  return null;
}

function extractVisitFields(v){
  if(!v) return null;
  // admitimos varias claves según como venga del excel
  const nombre = v.orador || v.oradorPublico || v.nombre || v.conferenciante || "";
  const congregacion = v.congregacion || v.congregacionVisitante || v.congreg || "";
  const titulo = v.titulo || v.tituloDiscurso || v.tema || "";
  const bosquejo = v.bosquejo || v.numero || v.discursoNumero || v.b || "";
  const cancion = v.cancion || v.cancionNumero || v.c || "";
  return { nombre, congregacion, titulo, bosquejo, cancion };
}

async function aplicarAutoVisitante(semanaISO){
  if(!semanaISO) return;

  // esta semana
  let v = await firestoreVisitFor(semanaISO);
  let vf = extractVisitFields(v);
  if(!vf){
    const local = localVisitanteFor(semanaISO);
    vf = local ? { nombre: local.nombre||"", congregacion: local.congregacion||"", titulo: local.titulo||"", bosquejo: local.bosquejo||"", cancion: local.cancion||"" } : null;
  }

  if(vf){
    if(!getVal("oradorPublico").trim() && vf.nombre) setVal("oradorPublico", vf.nombre);
    if(!getVal("congregacionVisitante").trim() && vf.congregacion) setVal("congregacionVisitante", vf.congregacion);
    if(!getVal("tituloDiscurso").trim() && vf.titulo) setVal("tituloDiscurso", vf.titulo);
    if(!getVal("cancionNumero").trim() && vf.cancion) setVal("cancionNumero", String(vf.cancion));
  }

  // próxima semana: solo título
  const nextISO = addDaysISO(semanaISO, 7);
  if(!getVal("tituloSiguienteSemana").trim() && nextISO){
    let v2 = await firestoreVisitFor(nextISO);
    let v2f = extractVisitFields(v2);
    if(!v2f){
      const local2 = localVisitanteFor(nextISO);
      v2f = local2 ? { titulo: local2.titulo||"" } : null;
    }
    if(v2f?.titulo) setVal("tituloSiguienteSemana", v2f.titulo);
  }
}

async function poblarDatalistOradores(){
  const dl = $("listaOradoresVisitantes");
  if(!dl) return;

  const set = new Set();
  // local
  for(const k of Object.keys(visitantesLocal||{})){
    const v = visitantesLocal[k];
    if(v?.nombre) set.add(v.nombre);
  }
  // firestore
  try{
    const s = await getDocs(collection(db, "visitas"));
    for(const d of s.docs){
      const data = d.data()||{};
      const name = data.orador || data.oradorPublico || data.nombre || data.conferenciante;
      if(name) set.add(String(name));
    }
  }catch(_){/* ignore */}

  dl.innerHTML = "";
  Array.from(set).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).forEach(v=>{
    const opt=document.createElement('option');
    opt.value=v;
    dl.appendChild(opt);
  });
}

// ---------------- Guardar / cargar ----------------
function semanaISO(){
  return (getVal("semana")||"").trim();
}

function formData(){
  // Guardamos IDs de personas para no depender de nombres.
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

function hydrateToUI(a){
  if(!a) return;
  // asegurar opciones presentes
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
  ].forEach(([sid, pid])=> ensureOptionById(sid, pid));

  setVal("presidente", a.presidenteId||"");
  setVal("oracionInicial", a.oracionInicialId||"");
  setVal("oracionFinal", a.oracionFinalId||"");
  setVal("conductorAtalaya", a.conductorAtalayaId||"");
  setVal("lectorAtalaya", a.lectorAtalayaId||"");
  setVal("multimedia1", a.multimedia1Id||"");
  setVal("multimedia2", a.multimedia2Id||"");
  setVal("plataforma", a.plataformaId||"");
  setVal("microfonista1", a.microfonista1Id||"");
  setVal("microfonista2", a.microfonista2Id||"");
  setVal("acomodadorEntrada", a.acomodadorEntradaId||"");
  setVal("acomodadorAuditorio", a.acomodadorAuditorioId||"");

  setVal("cancionNumero", a.cancionNumero||"");
  setVal("oradorPublico", a.oradorPublico||"");
  setVal("congregacionVisitante", a.congregacionVisitante||"");
  setVal("tituloDiscurso", a.tituloDiscurso||"");
  setVal("tituloSiguienteSemana", a.tituloSiguienteSemana||"");
}

function validateNoDuplicates(){
  const fields = [
    { id: "multimedia1", label: "Multimedia 1" },
    { id: "multimedia2", label: "Multimedia 2" },
    { id: "acomodadorEntrada", label: "Acomodador Entrada" },
    { id: "acomodadorAuditorio", label: "Acomodador Auditorio" },
  ];
  const chosen = fields
    .map(f=>({ ...f, value: getVal(f.id)}))
    .filter(x=>x.value);

  const seen = new Map();
  for(const c of chosen){
    if(seen.has(c.value)){
      const a = seen.get(c.value);
      const p = personas.find(pp=>pp.id===c.value);
      const name = p ? displayName(p) : "(persona)";
      return `No podés asignar a ${name} en ${a.label} y ${c.label}.`;
    }
    seen.set(c.value, c);
  }
  return null;
}

async function cargarSemana(){
  const s = semanaISO();
  if(!s) return setStatus("Elegí una semana (fecha).", true);

  setStatus("Cargando…");
  try{
    const snap = await getDoc(doc(db, "asignaciones", s));
    if(snap.exists()){
      const data = snap.data();
      const a = data.asignaciones || data;
      hydrateToUI(a);
      // Completa visitante desde la base (sin pisar lo ya cargado)
      await aplicarAutoVisitante(s);
      setStatus("Datos cargados.");
    }else{
      setStatus("No hay datos guardados para esta semana. Podés cargar y guardar.");
      // sugerencias automáticas
      await aplicarAutoVisitante(s);
    }
  }catch(e){
    console.error(e);
    setStatus("Error cargando datos. Revisá consola (F12) y permisos de Firestore.", true);
  }
}

async function guardar(){
  const s = semanaISO();
  if(!s) return setStatus("Elegí una semana (fecha).", true);

  const dup = validateNoDuplicates();
  if(dup) return setStatus(dup, true);

  setStatus("Guardando…");
  const data = formData();

  try{
    await setDoc(doc(db, "asignaciones", s), {
      asignaciones: data,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    setStatus("Guardado OK.");
  }catch(e){
    console.error(e);
    setStatus("No pude guardar. Revisá permisos de Firestore.", true);
  }
}

function limpiar(){
  [
    "presidente","oracionInicial","oracionFinal","conductorAtalaya","lectorAtalaya",
    "multimedia1","multimedia2","plataforma","microfonista1","microfonista2",
    "acomodadorEntrada","acomodadorAuditorio",
    "cancionNumero","oradorPublico","congregacionVisitante","tituloDiscurso","tituloSiguienteSemana"
  ].forEach(id=> setVal(id, ""));
  setStatus("Formulario limpio.");
}

function abrirPdfPresidente(){
  const s = semanaISO();
  if(!s) return setStatus("Elegí una semana primero.", true);
  window.location.href = `presidente.html?semana=${encodeURIComponent(s)}`;
}

// ---------------- init ----------------
async function init(){
  $("semana") && ( $("semana").value = isoToday() );

  // Auth gate
  await new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href = "index.html"; return; }
      resolve(user);
    });
  });

  // Eventos
  $("btnSalir")?.addEventListener("click", async ()=>{ await signOut(auth); window.location.href="index.html"; });
  $("btnCargar")?.addEventListener("click", cargarSemana);
  $("btnGuardar")?.addEventListener("click", guardar);
  $("btnLimpiar")?.addEventListener("click", limpiar);
  $("btnPdfPresidente")?.addEventListener("click", abrirPdfPresidente);

  // Mensual (tablero)
  $("btnCargarMes")?.addEventListener("click", cargarMes);
  $("btnGuardarMes")?.addEventListener("click", guardarMes);
  $("btnImprimirMes")?.addEventListener("click", imprimirMes);
  $("mes")?.addEventListener("change", cargarMes);

  // Actualiza vista previa al tocar selects
  [
    "mesPlataforma","mesAcomodadorEntrada","mesAcomodadorAuditorio",
    "mesMultimedia1","mesMultimedia2","mesMicrofonista1","mesMicrofonista2"
  ].forEach(id=>{
    $(id)?.addEventListener("change", ()=> renderMesPreview(getVal("mes"), formMesData()));
  });

  // Autocompletado
  $("cancionNumero")?.addEventListener("change", aplicarAutoCancion);
  $("tituloDiscurso")?.addEventListener("blur", ()=>{});

  // cargar personas y poblar selects
  try{
    await cargarPersonas();
    poblarSelects();
    await poblarDatalistOradores();
    setStatus("Listo. Elegí una semana y cargá.");
  }catch(e){
    console.error(e);
    setStatus("No pude cargar personas. Revisá permisos de Firestore.", true);
  }

  // Autocompletar visitante al cambiar semana (sin pisar)
  $("semana")?.addEventListener("change", async ()=>{
    const s = semanaISO();
    if(!s) return;
    await cargarSemana();
  });

  // Primer carga automática
  const s0 = semanaISO();
  if(s0) await cargarSemana();

  // Mes por defecto
  $("mes") && ( $("mes").value = monthISOFromDateISO(s0) || isoMonthToday() );
  renderMesPreview(getVal("mes"), null);
}

init();
