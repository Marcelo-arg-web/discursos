import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ensureUserDoc, getUserDoc } from "./db.js";
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

function closeSidebarOnMobile(){
  const sb = $("#sidebar");
  if(sb && sb.classList.contains("open")) sb.classList.remove("open");
}

function route(){
  const hash = location.hash || "#/inicio";
  const routeName = hash.replace("#/","").split("?")[0] || "inicio";
  setActive(routeName);

  const ctx = { ...state, setTitle, toast, routeTo };
  closeSidebarOnMobile();

  if(routeName === "inicio") return renderInicio(view, ctx);
  if(routeName === "asignaciones") return renderAsignaciones(view, ctx);
  if(routeName === "personas") return renderPersonas(view, ctx);
  if(routeName === "catalogos") return renderCatalogos(view, ctx);
  if(routeName === "invitaciones") return renderInvitaciones(view, ctx);
  if(routeName === "exportar") return renderExportar(view, ctx);
  if(routeName === "ajustes") return renderAjustes(view, ctx);

  location.hash = "#/inicio";
}

function routeTo(r){ location.hash = "#/" + r; }

// UI buttons
$("#btnLogout")?.addEventListener("click", async ()=>{
  await signOut(auth);
});
$("#btnGoHome")?.addEventListener("click", ()=> routeTo("inicio"));

$("#btnMobileMenu")?.addEventListener("click", ()=>{
  $("#sidebar")?.classList.toggle("open");
});
$("#btnToggleSidebar")?.addEventListener("click", ()=>{
  // desktop collapse simple: hide labels by toggling class
  document.body.classList.toggle("sidebarCollapsed");
  toast(document.body.classList.contains("sidebarCollapsed") ? "Sidebar contraída" : "Sidebar expandida");
});

window.addEventListener("hashchange", route);

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    location.href = "./index.html";
    return;
  }
  state.user = user;

  // Fallback role by email whitelist
  const fallback = roleFromEmail(user.email || "");
  // Ensure user doc exists (also updates email)
  const doc = await ensureUserDoc(user, fallback);

  state.userDoc = doc;
  state.role = (doc?.rol || fallback || "lector");
  // If whitelist says higher than stored, upgrade automatically (helps first run)
  if(fallback === "superadmin" && state.role !== "superadmin"){
    state.role = "superadmin";
  }else if(fallback === "admin" && state.role === "lector"){
    state.role = "admin";
  }
  state.canEdit = canEdit(state.role);

  // Header user card
  $("#userName").textContent = doc?.nombre || user.email || "Usuario";
  $("#userRole").textContent = state.role;
  $("#avatar").textContent = initials(doc?.nombre || user.email || "");
  $("#congLabel").textContent = "Villa Fiad";

  // If user is not active, block
  if(doc?.activo === false){
    view.innerHTML = `<div class="card" style="padding:16px">
      <h2>Cuenta desactivada</h2>
      <p class="muted">Contactá a un administrador para habilitar tu cuenta.</p>
      <button class="btn danger" id="btnOut">Salir</button>
    </div>`;
    document.getElementById("btnOut")?.addEventListener("click", ()=>signOut(auth));
    return;
  }

  route();
});
