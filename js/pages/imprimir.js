import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

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


let _deferredInstallPrompt = null;
function initPWAInstall(){
  const btn = document.getElementById("pwaInstallBtn");
  if(!btn) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if(isStandalone){ btn.classList.remove("show"); return; }

  if(!window.__pwa_install_listener){
    window.__pwa_install_listener = true;
    window.addEventListener("beforeinstallprompt", (e)=>{
      e.preventDefault();
      _deferredInstallPrompt = e;
      const b = document.getElementById("pwaInstallBtn");
      if(b) b.classList.add("show");
    });
  }

  btn.addEventListener("click", async ()=>{
    if(!_deferredInstallPrompt){
      alert("En Android: abrí el menú del navegador y tocá “Agregar a pantalla de inicio”.");
      return;
    }
    _deferredInstallPrompt.prompt();
    try{ await _deferredInstallPrompt.userChoice; }catch(_){}
    _deferredInstallPrompt = null;
    btn.classList.remove("show");
  });
}

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;

  const linksAdmin = [
    ["panel.html","panel","Panel"],
    ["asignaciones.html","asignaciones","Asignaciones"],
    ["programa-mensual.html","programa","Programa mensual"],
    ["tablero-acomodadores.html","acomodadores","Acomodadores"],
    ["tablero-multimedia.html","multimedia","Multimedia"],
    ["visitantes.html","visitantes","Visitantes"],
    ["salientes.html","salientes","Salientes"],
    ["personas.html","personas","Personas"],
    ["discursantes.html","discursantes","Discursantes"],
    ["estadisticas.html","estadisticas","Estadísticas"],
    ["doc-presi.html","docpresi","Visitas/Salidas"],
    ["imprimir.html","imprimir","Imprimir"],
    ["importar.html","importar","Importar"],
    ["usuarios.html","usuarios","Usuarios"],
  ];

  const linksUser = [
    ["programa-mensual.html","programa","Asignaciones mensuales"],
    ["visitantes.html","visitantes","Discursantes visitantes"],
    ["salientes.html","salientes","Discursantes salientes"],
  ];

  const links = (isAdmin ? linksAdmin : linksUser)
    .map(([href,key,label]) => `<a href="${href}" class="${active===key?'active':''}">${label}</a>`)
    .join("");

  el.innerHTML = `
    <div class="topbar" id="topbarShell">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>

      <button class="nav-toggle" id="navToggle" aria-label="Menú">☰</button>

      <div class="links" id="navLinks">
        ${links}
      </div>

      <div class="actions">
        <button class="btn pwa-install" id="pwaInstallBtn" type="button">Instalar</button>
        <button class="btn ghost" id="btnLogout" type="button">Salir</button>
      </div>
    </div>
  `;

  const shell = document.getElementById("topbarShell");
  const toggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  if(toggle && shell){
    toggle.addEventListener("click", ()=> shell.classList.toggle("open"));
  }
  if(navLinks && shell){
    navLinks.addEventListener("click", (e)=>{
      const a = e.target?.closest?.("a");
      if(a) shell.classList.remove("open");
    });
  }

  const btnLogout = document.getElementById("btnLogout");
  if(btnLogout){
    btnLogout.addEventListener("click", async ()=>{
      try{ await signOut(auth); }catch(_){}
      window.location.href = "public-login.html";
    });
  }

  initPWAInstall();
}



function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

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
  orderBy,
  startAt,
  endAt,
  documentId
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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

  if(!items.length){
    cont.innerHTML = `<div class="muted">No hay asignaciones para ese mes.</div>`;
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
  try{
    const ym = (document.getElementById("mes").value || "").trim();
    const prefix = monthPrefix(ym);
    if(!prefix) return toast("Escribí el mes como YYYY-MM.", true);

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

  // mes por defecto = mes actual
  const now = new Date();
  document.getElementById("mes").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  document.getElementById("btnPrint")?.addEventListener("click", ()=>window.print());
  document.getElementById("btnRecargar")?.addEventListener("click", cargarMes);
  document.getElementById("btnTabAcom")?.addEventListener("click", ()=>{ window.location.href = "tablero-acomodadores.html"; });
  document.getElementById("btnTabMM")?.addEventListener("click", ()=>{ window.location.href = "tablero-multimedia.html"; });
  document.getElementById("btnProgramaMensual")?.addEventListener("click", ()=>{ window.location.href = "programa-mensual.html"; });
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