import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);

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



async function requireActiveUser(){
  renderTopbar("docpresi");
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

function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

function monthRange(ym){
  // ym: YYYY-MM
  const [y,m]=ym.split("-").map(Number);
  if(!y||!m) return null;
  const start = `${y}-${String(m).padStart(2,"0")}-01`;
  const dt = new Date(y, m, 0); // last day of month
  const end = `${y}-${String(m).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  return { start, end };
}

async function loadForMonth(ym){
  const rng = monthRange(ym);
  if(!rng) return { visitas:[], salientes:[] };

  // Visitas: doc id = fecha ISO (YYYY-MM-DD). Filtramos por id.
  const visitasSnap = await getDocs(collection(db,"visitas"));
  const visitas = visitasSnap.docs
    .map(d=>({ id:d.id, ...d.data() }))
    .filter(v=>v.id >= rng.start && v.id <= rng.end)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)));

  // Salientes: filtramos por campo fecha
  const salSnap = await getDocs(query(collection(db,"salientes"), orderBy("fecha","asc")));
  const salientes = salSnap.docs
    .map(d=>({ id:d.id, ...d.data() }))
    .filter(s=>(s.fecha||"") >= rng.start && (s.fecha||"") <= rng.end)
    .sort((a,b)=>String(a.fecha||"").localeCompare(String(b.fecha||"")));

  return { visitas, salientes, rng };
}

function renderDoc(ym, visitas, salientes, rng){
  const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v])=>[Number(k), String(v)]));
  const monthTitle = ym ? ym : "";

  const visitasHtml = visitas.length ? `
    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Visitante</th>
          <th>Congregación</th>
          <th>Bosquejo</th>
          <th>Título</th>
          <th>Hospitalidad</th>
        </tr>
      </thead>
      <tbody>
        ${visitas.map(v=>{
          const b = Number(v.bosquejo);
          const titulo = v.titulo || (Number.isFinite(b)? bosquejosMap.get(b) : "") || "";
          return `<tr>
            <td>${escapeHtml(v.id)}</td>
            <td>${escapeHtml(v.nombre||"")}</td>
            <td>${escapeHtml(v.congregacion||"")}</td>
            <td>${escapeHtml(v.bosquejo ?? "")}</td>
            <td>${escapeHtml(titulo)}</td>
            <td>${escapeHtml(v.hospitalidad||"")}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  ` : `<div class="muted">No hay visitantes cargados en este mes.</div>`;

  const salientesHtml = salientes.length ? `
    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Orador</th>
          <th>Destino</th>
          <th>Bosquejo</th>
          <th>Título</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${salientes.map(s=>{
          const b = Number(s.bosquejo);
          const titulo = Number.isFinite(b) ? (bosquejosMap.get(b)||"") : "";
          return `<tr>
            <td>${escapeHtml(s.fecha||"")}</td>
            <td>${escapeHtml(s.orador||"")}</td>
            <td>${escapeHtml(s.destino||"")}</td>
            <td>${escapeHtml(s.bosquejo ?? "")}</td>
            <td>${escapeHtml(titulo)}</td>
            <td>${escapeHtml(s.notas||"")}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  ` : `<div class="muted">No hay salientes cargados en este mes.</div>`;

  $("contenido").innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:baseline;">
      <div>
        <div class="h1" style="margin:0;">Villa Fiad</div>
        <div class="muted">Documento del Presidente · ${escapeHtml(monthTitle)}</div>
      </div>
      <div class="small muted">Rango: ${escapeHtml(rng.start)} a ${escapeHtml(rng.end)}</div>
    </div>

    <hr class="sep"/>

    <div class="h2">Visitantes</div>
    ${visitasHtml}

    <div style="height:14px"></div>

    <div class="h2">Salientes</div>
    ${salientesHtml}
  `;
}

(async function(){
  await requireActiveUser();

  const mesEl = $("mes");
  // default: mes actual
  const dt = new Date();
  mesEl.value = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;

  $("btnPrint")?.addEventListener("click", ()=>window.print());
  $("btnGenerar")?.addEventListener("click", async ()=>{
    const ym = mesEl.value;
    $("contenido").innerHTML = `<div class="muted">Cargando…</div>`;
    try{
      const { visitas, salientes, rng } = await loadForMonth(ym);
      renderDoc(ym, visitas, salientes, rng);
    }catch(e){
      console.error(e);
      $("contenido").innerHTML = `<div class="muted"><b>Error cargando.</b> Revisá consola y permisos.</div>`;
    }
  });
})();
