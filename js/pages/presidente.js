import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { canciones } from "../data/canciones.js";

const $ = (id) => document.getElementById(id);

function ensureTopbarStyles(){
  if(document.getElementById("topbarStyle")) return;
  const s = document.createElement("style");
  s.id="topbarStyle";
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

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  ensureTopbarStyles();
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html">Panel</a>
        <a href="asignaciones.html">Asignaciones</a>
        <a href="imprimir.html">Imprimir</a>
        <a href="salientes.html">Salientes</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
    window.location.href = "index.html";
  });
}


function qp(name){
  const u = new URL(window.location.href);
  return (u.searchParams.get(name) || "").trim();
}

function isoToDate(iso){
  const [y,m,d] = iso.split("-").map(Number);
  if(!y||!m||!d) return null;
  return new Date(y, m-1, d);
}

function fmtFechaLarga(iso){
  const dt = isoToDate(iso);
  if(!dt) return iso;
  const dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${dias[dt.getDay()]} ${dt.getDate()} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}`;
}

async function requireActive(){
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href = "index.html"; return; }
      // No hacemos validación extra acá para no depender de reglas; si llegó hasta aquí, está logueado.
      renderTopbar('presidente');
      resolve(user);
    });
  });
}

function safe(v){
  return (v ?? "").toString();
}

let personasMap = new Map();
async function loadPersonasMap(){
  try{
    const qy = query(collection(db,"personas"), where("activo","==", true));
    const snap = await getDocs(qy);
    personasMap = new Map(snap.docs.map(d=>[d.id, (d.data()?.nombre||"").toString()]));
  }catch(e){
    console.warn("No pude cargar personas para nombres:", e);
    personasMap = new Map();
  }
}
function nameById(id){
  return personasMap.get(id) || "";
}

function render(semana, a){
  const canNum = safe(a.cancionNumero);
const canTit = canNum && canciones[Number(canNum)] ? canciones[Number(canNum)] : safe(a.cancionTitulo);
const canStr = canNum ? `${canNum} — ${canTit || ""}` : "";

const presidente = safe(a.presidente || nameById(a.presidenteId));
// Por defecto la oración inicial la hace el presidente (si no está cargada, usamos el presidente)
const oracionIni = safe(a.oracionInicial || nameById(a.oracionInicialId) || presidente);

const orador = safe(a.oradorPublico);
const cong = safe(a.congregacionVisitante);
const tema = safe(a.tituloDiscurso); // campo existente en tu BD
const prox = safe(a.tituloSiguienteSemana);

const conductor = safe(a.conductorAtalaya || nameById(a.conductorAtalayaId));
const lector = safe(a.lectorAtalaya || nameById(a.lectorAtalayaId));

// Documento semanal para enviar al presidente (NO incluye oración final)
const html = `
  <div class="hdr">
    <div class="img"><img src="assets/jw-header.jpg" alt=""/></div>
    <div class="t">
      <div class="cong">Congregación Villa Fiad</div>
      <div class="doc">Asignación Presidente</div>
      <div class="fecha">Fecha: <span class="big">${fmtFechaLarga(semana)}</span></div>
    </div>
  </div>

  <div class="body">
    <table class="tbl">
      <tr><td class="k">Presidente</td><td class="v">${presidente}</td></tr>
      <tr><td class="k">Canción</td><td class="v">${canStr}</td></tr>
      <tr><td class="k">Oración inicial</td><td class="v">${oracionIni}</td></tr>
      <tr><td class="k">Orador público</td><td class="v">${orador}</td></tr>
      <tr><td class="k">Congregación (de donde viene)</td><td class="v">${cong}</td></tr>
      <tr><td class="k">Tema del discurso</td><td class="v">${tema}</td></tr>
      <tr><td class="k">Título del discurso de la semana siguiente</td><td class="v">${prox}</td></tr>
      <tr><td class="k">Conductor La Atalaya</td><td class="v">${conductor}</td></tr>
      <tr><td class="k">Lector de La Atalaya</td><td class="v">${lector}</td></tr>
    </table>
  </div>
`;

  $("contenido").innerHTML = html;

  // Impresión automática si viene con &auto=1 (ideal para enviar por WhatsApp)
  if (qp("auto") === "1") {
    setTimeout(()=>{ try{ window.print(); }catch(e){} }, 250);
  }
}

async function load(){
  await loadPersonasMap();

  const semana = qp("semana");
  if(!semana){
    $("contenido").innerHTML = `<div class="card pad"><b>Falta la semana.</b><div class="muted">Abrí esta hoja desde Asignaciones (PDF Presidente).</div></div>`;
    return;
  }

  try{
    const snap = await getDoc(doc(db, "asignaciones", semana));
    if(!snap.exists()){
      $("contenido").innerHTML = `<div class="card pad"><b>No hay datos guardados para ${semana}.</b><div class="muted">Primero guardá la semana en Asignaciones.</div></div>`;
      return;
    }
    const data = snap.data();
    const a = data.asignaciones || data;
    render(semana, a);
  }catch(e){
    console.error(e);
    $("contenido").innerHTML = `<div class="card pad"><b>Error cargando datos.</b><div class="muted">Revisá consola (F12) y permisos de Firestore.</div></div>`;
  }
}

(async function(){
  await requireActive();
  $("btnPrint")?.addEventListener("click", ()=>window.print());
  await load();
})();
