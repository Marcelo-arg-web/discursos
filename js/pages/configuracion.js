import { auth, db } from "../firebase-config.js?v=20260429b75";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getGeneralConfig, saveGeneralConfig } from "../services/configService.js?v=20260429b75";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : "ok"}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML = ""; }, 4500);
}

function isEditorRole(rol){
  const r = String(rol || "").toLowerCase();
  return ["editor", "admin", "administrador", "superadmin"].includes(r);
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
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
        <a href="documentos.html" class="${active==='documentos'?'active':''}">Documentos/PDF</a>
        <a href="configuracion.html" class="${active==='configuracion'?'active':''}">Configuración</a>
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

async function requireEditor(){
  renderTopbar("configuracion");
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href = "index.html"; return; }
      const u = await getUsuario(user.uid);
      if(u?.activo === false){
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }
      if(!isEditorRole(u?.rol)){
        document.querySelector(".card.pad")?.insertAdjacentHTML("afterbegin", `<div class="toast err">Solo un administrador puede cambiar la configuración.</div>`);
        $("formConfig")?.querySelectorAll("input,button").forEach(el=>el.disabled = true);
        return resolve({ user, usuario:u, canEdit:false });
      }
      resolve({ user, usuario:u, canEdit:true });
    });
  });
}

async function loadConfig(){
  const cfg = await getGeneralConfig();
  $("nombreViajante").value = cfg.nombreViajante || "";
}

(async function init(){
  const ctx = await requireEditor();
  await loadConfig();

  $("btnRecargarConfig")?.addEventListener("click", async ()=>{
    await loadConfig();
    toast("Configuración recargada.");
  });

  $("formConfig")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!ctx.canEdit) return toast("No tenés permiso para guardar configuración.", true);
    const btn = $("btnGuardarConfig");
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Guardando…";
    try{
      await saveGeneralConfig({ nombreViajante: $("nombreViajante").value });
      toast("Configuración guardada.");
    }catch(err){
      console.error(err);
      toast(`No pude guardar configuración: ${err?.message || err}`, true);
    }finally{
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
})();
