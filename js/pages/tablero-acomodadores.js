
import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, requirePublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 4500);
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}


function renderPublicTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="public-home.html" class="${active==='public'?'active':''}">Inicio</a>
        <a href="tablero-acomodadores.html" class="${active==='tablero'?'active':''}">Tablero</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
      </div>
      <div class="right">
        <span class="badge">Solo lectura</span>
        <button id="btnSalirPublico" class="btn sm">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalirPublico")?.addEventListener("click", ()=>{
    setPublicAccess(false);
    window.location.href = "index.html";
  });
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
        ${admin ? `<a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>` : ``}
        ${admin ? `<a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>` : ``}
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
    window.location.href="index.html";
  });
}


async function requireActiveUser(active){
  // Acceso público (solo lectura) con clave genérica
  if(hasPublicAccess()){
    renderPublicTopbar(active);
    return { user: null, usuario: { rol: "usuario", activo: true, public: true } };
  }
  // Login normal
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      renderTopbar(active, u?.rol);
      resolve({user, usuario:u});
    });
  });
}

function getMonthPairs(mesISO){
  const [y,m] = mesISO.split("-").map(Number);
  const year=y, monthIndex=m-1;
  const th=[], sa=[];
  const d = new Date(year, monthIndex, 1);
  while(d.getMonth()===monthIndex){
    const day=d.getDay();
    if(day===4) th.push(new Date(d));
    if(day===6) sa.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  const weeks = Math.max(th.length, sa.length);
  const pairs=[];
  for(let i=0;i<weeks;i++){
    pairs.push({
      semana: String(i+1),
      jueves: th[i] ? fmt(th[i]) : "",
      sabado: sa[i] ? fmt(sa[i]) : "",
    });
  }
  return pairs;
}
function fmt(dt){
  const dd=String(dt.getDate()).padStart(2,"0");
  const mm=String(dt.getMonth()+1).padStart(2,"0");
  const yyyy=dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function loadMesDoc(mesISO){
  const snap = await getDoc(doc(db, "asignaciones_mensuales", mesISO));
  return snap.exists() ? (snap.data()||{}) : null;
}

function render(mesISO, data){
  const host = $("contenido");
  const pairs = getMonthPairs(mesISO);
  const semanas = (data && data.semanas) ? data.semanas : {};
  const rows = pairs.map(p=>{
    const w = semanas[p.semana] || {};
    return `
      <tr>
        <td>${p.semana}</td>
        <td>${p.jueves || "—"}</td>
        <td>${escapeHtml(w.mesPlataforma || "—")}</td>
        <td>${escapeHtml(w.mesAcomodadorEntrada || "—")}</td>
        <td>${escapeHtml(w.mesAcomodadorAuditorio || "—")}</td>
      </tr>
      <tr>
        <td>${p.semana}</td>
        <td>${p.sabado || "—"}</td>
        <td>${escapeHtml(w.mesPlataforma || "—")}</td>
        <td>${escapeHtml(w.mesAcomodadorEntrada || "—")}</td>
        <td>${escapeHtml(w.mesAcomodadorAuditorio || "—")}</td>
      </tr>
    `;
  }).join("");

  host.innerHTML = `
    <div class="print-header">
      <div class="h2">Congregación Villa Fiad</div>
      <div class="muted">Acomodadores · Mes ${mesISO}</div>
    </div>

    <table class="table" style="width:100%; margin-top:10px;">
      <thead>
        <tr>
          <th style="width:70px;">Sem</th>
          <th style="width:120px;">Fecha</th>
          <th>Plataforma</th>
          <th>Entrada</th>
          <th>Auditorio</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5" class="muted">Sin datos.</td></tr>`}</tbody>
    </table>
  `;
}

function escapeHtml(s){
  return String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

async function cargar(){
  const mesISO = String($("mes")?.value||"").trim();
  if(!mesISO) return toast("Elegí un mes.", true);
  toast("Cargando…");
  try{
    const data = await loadMesDoc(mesISO);
    if(!data) toast("No hay datos guardados para ese mes. Podés igualmente imprimir en blanco.", false);
    render(mesISO, data || { semanas:{} });
  }catch(e){
    console.error(e);
    toast("Error cargando. Revisá permisos.", true);
  }
}

(async function(){
  await requireActiveUser("tablero");
  $("btnPrint")?.addEventListener("click", ()=>window.print());
  $("btnCargar")?.addEventListener("click", cargar);
})();
