import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ensureUserDoc } from "./db.js";
import { roleFromEmail, canEdit } from "./roles.js";
import { $, $$, initials, toast } from "./utils.js";

import { renderInicio } from "./pages/inicio.js";
import { renderPersonas } from "./pages/personas.js";
import { renderCatalogos } from "./pages/catalogos.js";
import { renderAsignaciones } from "./pages/asignaciones.js";
import { renderInvitaciones } from "./pages/invitaciones.js";
import { renderExportar } from "./pages/exportar.js";
import { renderAjustes } from "./pages/ajustes.js";

const view = $("#view");
const pageTitle = $("#pageTitle");
const pageHint = $("#pageHint");

const state = {
  user: null,
  userDoc: null,
  role: "lector",
  canEdit: false
};

function setActive(route){
  $$(".navItem").forEach(a=>{
    a.classList.toggle("active", a.dataset.route === route);
  });
}

function setTitle(t, hint=""){
  pageTitle.textContent = t;
  pageHint.textContent = hint || "";
}

function routeTo(r){ location.hash = "#/" + r; }

function closeSidebarOnMobile(){
  const sb = $("#sidebar");
  if(sb && sb.classList.contains("open")) sb.classList.remove("open");
}

function showFatal(err){
  console.error(err);
  view.innerHTML = `
    <div class="card" style="padding:16px">
      <h2>Error cargando la página</h2>
      <p class="muted small">Esto suele pasar por permisos de Firestore o por un error de JavaScript.</p>
      <pre style="white-space:pre-wrap;font-family:var(--mono);font-size:12px;background:#0b1220;color:#e5e7eb;padding:12px;border-radius:12px;overflow:auto">${String(err?.message || err)}</pre>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="btnReload">Recargar</button>
        <button class="btn danger" id="btnSignOut">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnReload")?.addEventListener("click", ()=>location.reload());
  document.getElementById("btnSignOut")?.addEventListener("click", ()=>signOut(auth));
}

async function route(){
  try{
    const hash = location.hash || "#/inicio";
    const routeName = hash.replace("#/","").split("?")[0] || "inicio";
    setActive(routeName);
    closeSidebarOnMobile();

    const ctx = { ...state, setTitle, toast, routeTo };

    if(routeName === "inicio") return await renderInicio(view, ctx);
    if(routeName === "asignaciones") return await renderAsignaciones(view, ctx);
    if(routeName === "personas") return await renderPersonas(view, ctx);
    if(routeName === "catalogos") return await renderCatalogos(view, ctx);
    if(routeName === "invitaciones") return await renderInvitaciones(view, ctx);
    if(routeName === "exportar") return await renderExportar(view, ctx);
    if(routeName === "ajustes") return await renderAjustes(view, ctx);

    location.hash = "#/inicio";
  }catch(err){
    showFatal(err);
  }
}

// Botones UI (siempre)
$("#btnLogout")?.addEventListener("click", async ()=>{
  try{
    await signOut(auth);
  }catch(e){
    showFatal(e);
  }
});
$("#btnGoHome")?.addEventListener("click", ()=> routeTo("inicio"));

$("#btnMobileMenu")?.addEventListener("click", ()=>{
  $("#sidebar")?.classList.toggle("open");
});
$("#btnToggleSidebar")?.addEventListener("click", ()=>{
  document.body.classList.toggle("sidebarCollapsed");
  toast(document.body.classList.contains("sidebarCollapsed") ? "Sidebar contraída" : "Sidebar expandida");
});

window.addEventListener("hashchange", ()=>{ route(); });

// Capturar errores globales (para que no “mate” el router)
window.addEventListener("error", (e)=> showFatal(e.error || e.message));
window.addEventListener("unhandledrejection", (e)=> showFatal(e.reason || e));

onAuthStateChanged(auth, async (user)=>{
  try{
    if(!user){
      location.href = "./index.html";
      return;
    }
    state.user = user;

    const fallback = roleFromEmail(user.email || "");
    const doc = await ensureUserDoc(user, fallback);

    state.userDoc = doc;
    state.role = (doc?.rol || fallback || "lector");

    // Upgrade por whitelist si corresponde
    if(fallback === "superadmin") state.role = "superadmin";
    else if(fallback === "admin" && state.role === "lector") state.role = "admin";

    state.canEdit = canEdit(state.role);

    $("#userName").textContent = doc?.nombre || user.email || "Usuario";
    $("#userRole").textContent = state.role;
    $("#avatar").textContent = initials(doc?.nombre || user.email || "");
    $("#congLabel").textContent = "Villa Fiad";

    if(doc?.activo === false){
      view.innerHTML = `
        <div class="card" style="padding:16px">
          <h2>Cuenta desactivada</h2>
          <p class="muted">Contactá a un administrador para habilitar tu cuenta.</p>
          <button class="btn danger" id="btnOut">Salir</button>
        </div>`;
      document.getElementById("btnOut")?.addEventListener("click", ()=>signOut(auth));
      return;
    }

    await route();
  }catch(err){
    showFatal(err);
  }
});