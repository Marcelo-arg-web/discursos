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

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}

function isSuperadmin(rol){
  return String(rol||"").toLowerCase() === "superadmin";
}

function renderTopbar(active, rol){
  const el = document.getElementById("topbar");
  if(!el) return;
  const admin = isAdminRole(rol);
  const superadmin = isSuperadmin(rol);
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
        ${admin ? `<a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>` : ``}
        ${admin ? `<a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>` : ``}
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        ${admin ? `<a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>` : ``}
        ${superadmin ? `<a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>` : ``}
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

  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      renderTopbar(activePage, u?.rol);
      resolve({ user, usuario:u });
    });
  });
}(async function(){
  const { usuario } = await requireActiveUser("panel");
  const who = document.getElementById("who");
  if(who){
    who.textContent = `${usuario?.nombre || usuario?.email || "—"} · rol: ${usuario?.rol || "—"} · activo: ${usuario?.activo ? "sí" : "no"}`;
  }

  // Usuarios (no admin): mostrar solo lo necesario
  if(!isAdminRole(usuario?.rol)){
    const allowed = new Set(["asignaciones.html","visitantes.html","salientes.html"]);
    document.querySelectorAll('a.btn[href]').forEach(a=>{
      const href = a.getAttribute('href') || "";
      if(!allowed.has(href)){
        a.style.display = "none";
      }
    });
    const m = document.createElement("div");
    m.className = "muted";
    m.style.marginTop = "10px";
    m.textContent = "Vista usuario: solo se muestran Asignaciones semanales, Visitantes y Salientes.";
    document.querySelector(".card.pad")?.appendChild(m);
  }

})();