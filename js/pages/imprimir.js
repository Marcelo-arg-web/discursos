import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);


function renderTopbarBasic(){
  const host = document.getElementById("topbar");
  if(!host) return;
  host.innerHTML = `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="brand">Villa Fiad</div>
        <nav class="nav">
          <a href="panel.html">Panel</a>
          <a href="asignaciones.html">Asignaciones</a>
          <a href="visitantes.html">Visitantes</a>
          <a href="salientes.html">Salientes</a>
          <a href="tablero-acomodadores.html">Tablero mensual</a>
        </nav>
        <button id="btnSalir" class="btn small">Salir</button>
      </div>
    </div>
  `;
}

renderTopbarBasic();
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

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
    window.location.href = "index.html";
  });
}

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

async function requireActiveUser(activePage){
  ensureTopbarStyles();
  renderTopbar(activePage);

  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
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
  orderBy
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

function monthRange(ym){
  const [y,m] = ym.split("-").map(Number);
  if(!y || !m) return null;
  const start = `${y}-${String(m).padStart(2,"0")}-01`;
  const nextM = m===12 ? 1 : m+1;
  const nextY = m===12 ? y+1 : y;
  const end = `${nextY}-${String(nextM).padStart(2,"0")}-01`;
  return { start, end };
}

function renderItems(items){
  const cont = document.getElementById("contenido");
  if(!cont) return;

  if(!items.length){
    cont.innerHTML = `<div class="muted">No hay asignaciones para ese mes.</div>`;
    return;
  }

  const rows = items.map(it=>{
    const a = it.asignaciones || it;
    return `
      <tr>
        <td><b>${it.semana || it.id || ""}</b></td>
        <td>${a.presidente||""}</td>
        <td>${(a.cancionNumero||"") ? `${a.cancionNumero} — ${a.cancionTitulo||""}` : ""}</td>
        <td>${a.oradorPublico||""}</td>
        <td>${a.congregacionVisitante||""}</td>
        <td>${(a.discursoNumero||"") ? `${a.discursoNumero} — ${a.tituloDiscurso||""}` : (a.tituloDiscurso||"")}</td>
        <td>${a.conductorAtalaya||""}</td>
        <td>${a.lectorAtalaya||""}</td>
        <td>${a.multimedia1||""}</td>
        <td>${a.multimedia2||""}</td>
        <td>${a.acomodadorEntrada||""}</td>
        <td>${a.acomodadorAuditorio1||""}</td>
        <td>${a.acomodadorAuditorio2||""}</td>
        <td>${a.microfonista1||""}</td>
        <td>${a.microfonista2||""}</td>
        <td>${buildOracionFinal(a.oradorPublico, a.presidente, a.oracionFinal)||""}</td>
      </tr>
    `;
  }).join("");

  cont.innerHTML = `
    <div class="small muted" style="margin-bottom:10px;">
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
  const ym = (document.getElementById("mes").value || "").trim();
  const r = monthRange(ym);
  if(!r) return toast("Escribí el mes como YYYY-MM.", true);

  const q = query(
    collection(db,"asignacionesSemanales"),
    where("semana", ">=", r.start),
    where("semana", "<", r.end),
    orderBy("semana","asc")
  );

  try{
    const snap = await getDocs(q);
    const items = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderItems(items);
  }catch(e){
    console.error(e);
    toast("No pude cargar asignaciones. Revisá permisos/índices.", true);
  }
}

(async function(){
  await requireActiveUser("imprimir");

  // mes por defecto = mes actual
  const now = new Date();
  document.getElementById("mes").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  document.getElementById("btnPrint")?.addEventListener("click", ()=>window.print());
  document.getElementById("btnRecargar")?.addEventListener("click", cargarMes);
  document.getElementById("btnTabAcom")?.addEventListener("click", ()=>{ window.location.href = "tablero-acomodadores.html"; });
  document.getElementById("btnTabMM")?.addEventListener("click", ()=>{ window.location.href = "tablero-multimedia.html"; });
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