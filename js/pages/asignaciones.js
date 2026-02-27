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

// ---------------- Lists (según lo que me pasaste) ----------------
const LISTA_ACOMODADORES = [
  "Marcelo Rodríguez","Omar Santucho","Epifanio Pedraza","Hugo García","Eduardo Rivadeneira",
  "Marcelo Palavecino","Leonardo Araya","Luis Navarro","Sergio Saldaña","Sergio Lazarte",
  "Roberto Lazarte","Rodolfo Santucho"
].map(normalize);

const LISTA_PLATAFORMA = [
  "Brian Torres","Braian Torres",
  "Brian Rivadeneira","Braian Rivadeneira",
  "Martin Zerda Jr","Martin Zerda (hijo)","Martin Zerda hijo",
  "Omar Santucho",
  // Facundo Reinoso lo querés en plataforma también
  "Facundo Reinoso"
].map(normalize);

const LISTA_MULTIMEDIA = [
  "Marcelo Rodríguez","Eduardo Rivadeneira","Hugo García","Marcelo Palavecino","Sergio Saldaña",
  "Brian Rivadeneira","Braian Rivadeneira","Isaías Schell","Isaias Schel","Martin Zerda","Roberto Lazarte",
  "Facundo Reinoso","Brian Torres","Braian Torres"
].map(normalize);

const LISTA_MICROFONISTAS = [
  "David Salica","Emanuel Salica","Facundo Reinoso","Maxi Navarro","Eduar Salinas","Misael Salinas",
  "Isaías Schell","Isaias Schel","Roberto Lazarte","Eduardo Rivadeneira","Hugo García",
  "Brian Rivadeneira","Braian Rivadeneira","Martin Zerda (padre)","Martin Zerda padre","Martin Zerda (hijo)","Martin Zerda hijo"
].map(normalize);

// IDs especiales (para distinguir Martin padre/hijo)
const ID_MARTIN_PADRE = "OIz2KC7o6VwzvjZCqliA";
const ID_MARTIN_HIJO  = "UQqyIWnjmCkHJlnjnKTH";
const ID_ISAIAS       = "3mdo5EMtQxj5t5Yqgp84";

function displayName(persona){
  if(persona?.id === ID_MARTIN_PADRE) return "Martin Zerda (padre)";
  if(persona?.id === ID_MARTIN_HIJO) return "Martin Zerda Jr";
  if(persona?.id === ID_ISAIAS) return "Isaías Schel";
  return persona?.nombre || "";
}

function inListByNameOrId(persona, listNorm){
  const nm = normalize(persona?.nombre);
  if(listNorm.includes(nm)) return true;
  // soporte Brian/Braian por normalización adicional
  const nm2 = nm.replace(/^brian /,'braian ');
  const nm3 = nm.replace(/^braian /,'brian ');
  return listNorm.includes(nm2) || listNorm.includes(nm3);
}

// ---------------- Data ----------------
let personas = []; // {id, nombre, roles, activo, ...}

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
  // Presidente / Oraciones / Lector: anciano o siervo
  const base = (p)=> hasAncianoOrSiervo(p);
  fillSelect("presidente", base);
  fillSelect("oracionInicial", base);
  fillSelect("oracionFinal", base);
  fillSelect("lectorAtalaya", base);

  // Conductor Atalaya: solo ancianos
  fillSelect("conductorAtalaya", (p)=> hasAnciano(p));

  // Multimedia: lista + anciano/siervo
  fillSelect("multimedia1", (p)=> hasAncianoOrSiervo(p) || inListByNameOrId(p, LISTA_MULTIMEDIA));
  fillSelect("multimedia2", (p)=> hasAncianoOrSiervo(p) || inListByNameOrId(p, LISTA_MULTIMEDIA));

  // Plataforma: SOLO lista plataforma (como pediste)
  fillSelect("plataforma", (p)=> inListByNameOrId(p, LISTA_PLATAFORMA) || p.id === ID_MARTIN_HIJO);

  // Acomodadores: lista + anciano/siervo
  fillSelect("acomodadorEntrada", (p)=> hasAncianoOrSiervo(p) || inListByNameOrId(p, LISTA_ACOMODADORES));
  fillSelect("acomodadorAuditorio", (p)=> hasAncianoOrSiervo(p) || inListByNameOrId(p, LISTA_ACOMODADORES));

  // Microfonistas: lista + anciano/siervo
  fillSelect("microfonista1", (p)=> hasAncianoOrSiervo(p) || inListByNameOrId(p, LISTA_MICROFONISTAS));
  fillSelect("microfonista2", (p)=> hasAncianoOrSiervo(p) || inListByNameOrId(p, LISTA_MICROFONISTAS));
}

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
    if(s) await aplicarAutoVisitante(s);
  });

  // Primer carga sugerida
  const s0 = semanaISO();
  if(s0) await aplicarAutoVisitante(s0);
}

init();
