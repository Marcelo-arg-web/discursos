import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getBosquejoTitle, setBosquejoOverride, clearBosquejoOverride, exportBosquejosOverrides, importBosquejosOverrides } from "../data/bosquejos.js";

const $ = (id) => document.getElementById(id);

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

function initBosquejosUI(usuario){
  const card = document.getElementById("bosquejosCard");
  if(!card) return;

  // Solo admins/superadmin pueden editar títulos
  const rol = (usuario?.rol || "usuario").toLowerCase();
  const canEdit = ["admin","superadmin"].includes(rol);

  if(!canEdit){
    // Si no puede editar, ocultamos la sección para evitar confusión
    card.style.display = "none";
    return;
  }

  const numEl = document.getElementById("bosqNum");
  const titleEl = document.getElementById("bosqTitle");
  const jsonEl = document.getElementById("bosqJson");
  const btnSave = document.getElementById("btnBosqSave");
  const btnClear = document.getElementById("btnBosqClear");
  const btnExport = document.getElementById("btnBosqExport");
  const btnImport = document.getElementById("btnBosqImport");

  function syncTitle(){
    const n = Number(numEl.value);
    if(!Number.isFinite(n)) return;
    titleEl.value = getBosquejoTitle(n) || "";
  }

  numEl?.addEventListener("input", syncTitle);

  btnSave?.addEventListener("click", ()=>{
    const n = Number(numEl.value);
    if(!Number.isFinite(n) || n < 1 || n > 194){
      toast("Número de bosquejo inválido (1–194).", true);
      return;
    }
    try{
      setBosquejoOverride(n, titleEl.value);
      toast("Bosquejo actualizado. Refrescá la página para verlo aplicado en todos lados.");
    }catch(e){
      console.error(e);
      toast("No se pudo guardar el cambio.", true);
    }
  });

  btnClear?.addEventListener("click", ()=>{
    const n = Number(numEl.value);
    if(!Number.isFinite(n)){
      toast("Elegí un número primero.", true);
      return;
    }
    try{
      clearBosquejoOverride(n);
      syncTitle();
      toast("Volvió al título original. Refrescá la página para verlo aplicado en todos lados.");
    }catch(e){
      console.error(e);
      toast("No se pudo revertir.", true);
    }
  });

  btnExport?.addEventListener("click", ()=>{
    jsonEl.value = exportBosquejosOverrides();
    toast("Cambios exportados.");
  });

  btnImport?.addEventListener("click", ()=>{
    try{
      importBosquejosOverrides(jsonEl.value || "{}");
      toast("Cambios importados. Refrescá la página para aplicarlos.");
    }catch(e){
      console.error(e);
      toast("JSON inválido. Revisá el contenido.", true);
    }
  });
}

}(async function(){
  const ctx = await requireActiveUser("importar");
  initBosquejosUI(ctx.usuario);
  toast("Importar Excel: en esta versión falta el script. Si querés, lo integro con tu Asignaciones.xlsx y mapeo de columnas.");
})();