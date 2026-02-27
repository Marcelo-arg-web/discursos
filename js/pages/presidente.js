import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { canciones } from "../data/canciones.js";

const $ = (id) => document.getElementById(id);

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
      resolve(user);
    });
  });
}

function safe(v){
  return (v ?? "").toString();
}

function render(semana, a){
  const canNum = safe(a.cancionNumero).trim();
  const canTit = canNum && canciones[Number(canNum)] ? canciones[Number(canNum)] : safe(a.cancionTitulo);
  const canStr = canNum ? `${canNum} — ${canTit || ""}` : "";

  const presidente = safe(a.presidente);
  const oracionIni = safe(a.oracionInicial);
  const oracionFin = safe(a.oracionFinal);

  const orador = safe(a.oradorPublico);
  const cong = safe(a.congregacionVisitante);
  const titulo = safe(a.tituloDiscurso);
  const prox = safe(a.tituloSiguienteSemana);

  const conductor = safe(a.conductorAtalaya);
  const lector = safe(a.lectorAtalaya);
  const obs = safe(a.obs || a.observaciones || "");

  const html = `
    <div class="hdr">
      <div class="img"><img src="assets/jw-header.jpg" alt=""/></div>
      <div class="t">
        <div class="cong">Congregación Villa Fiad</div>
        <div class="doc">Asignación Presidencia</div>
        <div class="fecha">Fecha: <span class="big">${fmtFechaLarga(semana)}</span></div>
      </div>
    </div>

    <div class="body">
      <table class="tbl">
        <tr><td class="k">Presidente</td><td class="v">${presidente}</td></tr>
        <tr><td class="k">Oración inicial</td><td class="v">${oracionIni}</td></tr>
        <tr><td class="k">Canción</td><td class="v">${canStr}</td></tr>
        <tr><td class="k">Texto bíblico</td><td class="muted2">(completar)</td></tr>
        <tr><td class="k">Conferenciante</td><td class="v">${orador}</td></tr>
        <tr><td class="k">Congregación</td><td class="v">${cong}</td></tr>
        <tr><td class="k">Título (discurso)</td><td class="v">${titulo}</td></tr>
        <tr><td class="k">Discurso próxima semana</td><td class="v">${prox}</td></tr>
        <tr><td class="k">Oración final</td><td class="v">${oracionFin}</td></tr>
        <tr><td class="k">Obs.</td><td>${obs}</td></tr>
      </table>

      <div class="sec-title">Atalaya</div>
      <table class="tbl">
        <tr><td class="k">Conductor</td><td class="v">${conductor}</td></tr>
        <tr><td class="k">Lector</td><td class="v">${lector}</td></tr>
        <tr><td class="k">Título</td><td class="muted2">(completar)</td></tr>
      </table>
    </div>
  `;

  $("contenido").innerHTML = html;
}

async function load(){
  const semana = qp("semana");
  if(!semana){
    $("contenido").innerHTML = `<div class="card pad"><b>Falta la semana.</b><div class="muted">Abrí esta hoja desde Asignaciones (PDF Presidente).</div></div>`;
    return;
  }

  try{
    const snap = await getDoc(doc(db, "asignacionesSemanales", semana));
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
