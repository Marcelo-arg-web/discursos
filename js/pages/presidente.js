import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { canciones } from "../data/canciones.js";

const $ = (id) => document.getElementById(id);

function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

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
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Acom/AV</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
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
  <div class="pres-sheet">
    <div class="pres-title">Asignación Presidencia</div>

    <table class="pres-table">
      <tr><td class="k">Fecha:</td><td class="v">${fmtFechaLarga(semana)}</td></tr>
      <tr><td class="k">Presidente:</td><td class="v">${presidente}</td></tr>
      <tr><td class="k">Canción:</td><td class="v">${canStr}</td></tr>
      <tr><td class="k">Oración:</td><td class="v">${oracionIni}</td></tr>
      <tr><td class="k">Orador público:</td><td class="v">${orador}</td></tr>
      <tr><td class="k">Congregación:</td><td class="v">${cong}</td></tr>
      <tr><td class="k">Tema del discurso:</td><td class="v">${tema}</td></tr>
      <tr><td class="k">Discurso (semana siguiente):</td><td class="v">${prox}</td></tr>
    </table>

    <div class="pres-subtitle">Atalaya</div>

    <table class="pres-table">
      <tr><td class="k">Conductor:</td><td class="v">${conductor}</td></tr>
      <tr><td class="k">Lector:</td><td class="v">${lector}</td></tr>
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
