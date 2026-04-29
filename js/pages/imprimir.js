import { auth, db } from "../firebase-config.js?v=20260429b71";
import { hasPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function monthTitleLabel(ym){
  const s = String(ym || "").trim();
  if(!/^\d{4}-\d{2}$/.test(s)) return "";
  const [y,m] = s.split('-').map(Number);
  const mes = MESES_ES[(m||0)-1];
  if(!mes || !y) return "";
  return `${mes} ${y}`;
}

function buildPdfTitle(ym){
  const month = monthTitleLabel(ym);
  return month ? `Asignados Villa Fiad - ${month}` : "Asignados Villa Fiad";
}

function syncPrintTitle(){
  const ym = (document.getElementById("mes")?.value || "").trim();
  const title = buildPdfTitle(ym);
  document.title = title;
  const h1 = document.querySelector('.section-title .h1');
  if(h1) h1.textContent = title;
}

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 5000);
}



function buildOracionFinal(oradorPublico, presidente, fallbackOracionFinal){
  const o = String(oradorPublico || "").trim();
  const p = String(presidente || "").trim();
  if(o && p) return `${o}/${p}`; // sin espacios
  if(p) return p;
  if(o) return o;
  return String(fallbackOracionFinal || "").trim();
}

function saturdayOfMonthWeek(mesISO, weekNum){
  const [y,m] = String(mesISO||"").split("-").map(Number);
  if(!y||!m) return null;
  const monthIndex = m-1;
  const sats=[];
  const d=new Date(y, monthIndex, 1);
  while(d.getMonth()===monthIndex){
    if(d.getDay()===6) sats.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  const dt = sats[Math.max(0, weekNum-1)];
  if(!dt) return null;
  const yyyy=dt.getFullYear();
  const mm=String(dt.getMonth()+1).padStart(2,"0");
  const dd=String(dt.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}
function timeoutValue(ms, value){ return new Promise(resolve => setTimeout(()=>resolve(value), ms)); }
async function getUsuarioSeguro(user){
  try{
    const u = await Promise.race([getUsuario(user.uid), timeoutValue(2500, null)]);
    return u || { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _fallback:true };
  }catch(e){
    console.warn("No pude leer /usuarios; sigo con usuario autenticado para no dejar el documento en blanco", e);
    return { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _readError:true };
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


function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

async function requireActiveUser(activePage){
  ensureTopbarStyles();
  renderTopbar(activePage);
  if(hasPublicAccess()) return { user:null, usuario:{ rol:"usuario", activo:true, public:true } };

  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuarioSeguro(user);
      if(u && u.activo === false){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      resolve({ user, usuario:u });
    });
  });
}

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let personasMap = new Map();
async function loadPersonasMap(){
  try{
    const qy = query(collection(db,"personas"), where("activo","==", true));
    const snap = await getDocs(qy);
    personasMap = new Map(snap.docs.map(d=>[d.id, String(d.data()?.nombre||"")]));
  }catch(e){
    console.warn("No pude cargar personas:", e);
    personasMap = new Map();
  }
}
function nombrePorId(id){
  const k = String(id||"").trim();
  if(!k) return "";
  return personasMap.get(k) || "";
}
function resolveNombre(asig, key){
  const v = asig?.[key];
  if(v === undefined || v === null) return "";
  const s = String(v).trim();
  if(!s) return "";
  return nombrePorId(s) || s;
}

function monthPrefix(ym){
  const s = String(ym||"").trim();
  if(!/^\d{4}-\d{2}$/.test(s)) return null;
  return s;
}

function renderItems(items){
  const cont = document.getElementById("contenido");
  if(!cont) return;

  const ym = (document.getElementById("mes")?.value || "").trim();
  const pdfTitle = buildPdfTitle(ym);

  if(!items.length){
    cont.innerHTML = `
      <div class="print-header" style="margin-bottom:12px;">
        <div class="print-title">${pdfTitle}</div>
      </div>
      <div class="muted">No hay asignaciones para ese mes.</div>`;
    return;
  }

  const rows = items.map(it=>{
    const raw = it.data || it;
    const a = raw.asignaciones || raw;

    // Nombres
    const presidente = resolveNombre(a, "presidenteId") || a.presidente || "";
    const conductor = resolveNombre(a, "conductorAtalayaId") || a.conductorAtalaya || "";
    const lector = resolveNombre(a, "lectorAtalayaId") || a.lectorAtalaya || "";
    const acomEnt = resolveNombre(a, "acomodadorEntradaId") || a.acomodadorEntrada || "";
    const acomA1 = resolveNombre(a, "acomodadorAuditorio1Id") || resolveNombre(a, "acomodadorAuditorioId") || a.acomodadorAuditorio1 || a.acomodadorAuditorio || "";
    const acomA2 = resolveNombre(a, "acomodadorAuditorio2Id") || a.acomodadorAuditorio2 || "";
    const mic1 = resolveNombre(a, "microfonista1Id") || a.microfonista1 || "";
    const mic2 = resolveNombre(a, "microfonista2Id") || a.microfonista2 || "";
    const mm1 = resolveNombre(a, "multimedia1Id") || a.multimedia1 || "";
    const mm2 = resolveNombre(a, "multimedia2Id") || a.multimedia2 || "";

    return `
      <tr>
        <td><b>${it.id || it.semana || ""}</b></td>
        <td>${presidente}</td>
        <td>${(a.cancionNumero||"") ? `${a.cancionNumero} — ${a.cancionTitulo||""}` : ""}</td>
        <td>${a.oradorPublico||""}</td>
        <td>${a.congregacionVisitante||""}</td>
        <td>${(a.discursoNumero||"") ? `${a.discursoNumero} — ${a.tituloDiscurso||""}` : (a.tituloDiscurso||"")}</td>
        <td>${conductor}</td>
        <td>${lector}</td>
        <td>${mm1}</td>
        <td>${mm2}</td>
        <td>${acomEnt}</td>
        <td>${acomA1}</td>
        <td>${acomA2}</td>
        <td>${mic1}</td>
        <td>${mic2}</td>
        <td>${buildOracionFinal(a.oradorPublico, presidente, resolveNombre(a,"oracionFinalId") || a.oracionFinal)||""}</td>
      </tr>
    `;
  }).join("");

  cont.innerHTML = `
    <div class="print-header" style="margin-bottom:12px;">
      <div class="print-title">${pdfTitle}</div>
      <div class="small muted">Tomado del programa seleccionado.</div>
    </div>
    <div class="small muted no-print" style="margin-bottom:10px;">
      Tip: imprimí con orientación horizontal y escala “ajustar”.
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>Semana</th>
          <th>Presidente</th>
          <th>Canción</th>
          <th>Orador</th>
          <th>Congregación</th>
          <th>Discurso</th>
          <th>Conductor</th>
          <th>Lector</th>
          <th>MM1</th>
          <th>MM2</th>
          <th>Acom. ent</th>
          <th>Acom. aud 1</th>
          <th>Acom. aud 2</th>
          <th>Mic1</th>
          <th>Mic2</th>
          <th>Oración final</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function cargarMes(){
  try{
    const ym = (document.getElementById("mes").value || "").trim();
    const prefix = monthPrefix(ym);
    if(!prefix) return toast("Escribí el mes como YYYY-MM.", true);

    syncPrintTitle();
    await loadPersonasMap();

    const q = query(
      collection(db,"asignaciones"),
      orderBy(documentId()),
      startAt(prefix),
      endAt(prefix + "\uf8ff")
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d=>({ id:d.id, data:d.data() }));
    renderItems(items);
  }catch(e){
    console.error(e);
    toast("No pude cargar asignaciones. Revisá permisos/índices.", true);
  }
}

(async function(){
  await requireActiveUser("imprimir");

  // mes por defecto = mes actual o mes recibido desde Resultados
  const now = new Date();
  const params = new URLSearchParams(location.search);
  document.getElementById("mes").value = params.get("mes") || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  document.getElementById("btnPrint")?.addEventListener("click", ()=>{
    syncPrintTitle();
    window.print();
  });
  document.getElementById("btnRecargar")?.addEventListener("click", cargarMes);
  document.getElementById("btnTabAcom")?.addEventListener("click", ()=>{ window.location.href = `tablero-acomodadores.html?mes=${encodeURIComponent(document.getElementById("mes")?.value||"")}`; });
  document.getElementById("btnTabMM")?.addEventListener("click", ()=>{ window.location.href = `tablero-acomodadores.html?mes=${encodeURIComponent(document.getElementById("mes")?.value||"")}#av`; });
  document.getElementById("btnProgramaMensual")?.addEventListener("click", ()=>{ window.location.href = `programa-mensual.html?mes=${encodeURIComponent(document.getElementById("mes")?.value||"")}`; });
  document.getElementById("btnPresidente")?.addEventListener("click", ()=>{
    const mesISO = String(document.getElementById("mes")?.value||"").trim();
    const sem = String(document.getElementById("semana")?.value||"1").trim();
    // Abrimos la hoja del presidente por semana (fecha ISO), calculando el sábado de la semana indicada.
    const fecha = saturdayOfMonthWeek(mesISO, parseInt(sem,10) || 1);
    if(!fecha){ toast("No pude calcular la fecha de esa semana.", true); return; }
    window.open(`presidente.html?semana=${encodeURIComponent(fecha)}`, "_blank");
  });
  document.getElementById("mes")?.addEventListener("change", cargarMes);

  await cargarMes();
})();