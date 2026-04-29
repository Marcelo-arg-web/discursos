import { auth, db } from "./firebase-config.js";
import { hasPublicAccess, setPublicAccess } from "./services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const RESULTADOS_LINKS = [
  ["resultados.html", "Resultados"],
  ["visitantes.html", "Visitantes"],
  ["salientes.html", "Salientes"],
  ["programa-mensual.html", "Programa mensual"],
  ["tablero-acomodadores.html", "Acomodadores"],
  ["doc-presi.html", "Presidente"],
  ["imprimir.html", "Descargar/PDF"],
  ["perfil.html", "Mi perfil"],
];

const ADMIN_ONLY = new Set([
  "panel.html",
  "asignaciones.html",
  "personas.html",
  "funciones.html",
  "discursantes.html",
  "estadisticas.html",
  "importar.html",
  "importar-asignaciones.html",
  "importar-visitantes.html",
  "usuarios.html",
  "directorio-discursos.html",
  "app.html",
]);

let viewerMode = false;
let currentUserDoc = null;
let lastTopbarStamp = "";

function pageName(){
  const p = (location.pathname.split('/').pop() || "index.html").toLowerCase();
  return p || "index.html";
}
function isAdminRole(rol){
  const r = String(rol || "").toLowerCase();
  return r === "admin" || r === "superadmin";
}
function activeForHref(href){ return pageName() === href.toLowerCase() ? "active" : ""; }
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function logout(){
  if(hasPublicAccess()){
    setPublicAccess(false);
    location.href = "index.html";
    return;
  }
  signOut(auth).finally(()=>{ location.href = "index.html"; });
}
function renderViewerTopbar(){
  const topbar = document.getElementById("topbar");
  if(!topbar) return;
  const stamp = pageName() + "|viewer";
  if(lastTopbarStamp === stamp && topbar.dataset.viewerNav === "1") return;
  lastTopbarStamp = stamp;
  topbar.dataset.viewerNav = "1";
  document.body.classList.add("viewer-result-mode");
  const name = currentUserDoc?.nombre || currentUserDoc?.email || (hasPublicAccess() ? "Modo consulta" : "Usuario");
  topbar.innerHTML = `
    <div class="topbar viewer-topbar">
      <div class="brand"><span class="brand-dot"></span><span>Villa Fiad</span></div>
      <div class="links viewer-links">
        ${RESULTADOS_LINKS.map(([href,label])=>`<a href="${href}" class="${activeForHref(href)}">${label}</a>`).join("")}
      </div>
      <div class="actions">
        <span class="badge">Solo lectura</span>
        <span class="badge soft">${escapeHtml(name)}</span>
        <button id="btnSalirViewer" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalirViewer")?.addEventListener("click", logout);
}
function redirectIfNeeded(){
  if(!viewerMode) return;
  if(ADMIN_ONLY.has(pageName())) location.replace("resultados.html");
}
function apply(){
  if(!viewerMode) return;
  redirectIfNeeded();
  renderViewerTopbar();
  document.querySelectorAll(".admin-only, [data-admin-only=\"true\"]").forEach(el=>{ el.style.display = "none"; });
  if(pageName() === "visitantes.html" || pageName() === "salientes.html"){
    document.querySelectorAll("form#form, #hospBox, #btnRevisarSalientes2026").forEach(el=>{ el.style.display = "none"; });
    document.querySelectorAll(".muted").forEach(el=>{
      if(/Guardado en Firestore|editar cuando|Click en una fila para editar/i.test(el.textContent||"")){
        el.textContent = "Vista de consulta. Solo se muestran los arreglos cargados.";
      }
    });
  }
}
const mo = new MutationObserver(()=>apply());
mo.observe(document.documentElement, { childList:true, subtree:true });
if(hasPublicAccess()){
  viewerMode = true;
  currentUserDoc = { nombre: "Modo consulta", rol: "viewer" };
  apply();
}else{
  onAuthStateChanged(auth, async (user)=>{
    if(!user) return;
    try{
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      currentUserDoc = snap.exists() ? snap.data() : { email:user.email, rol:"viewer" };
      viewerMode = !isAdminRole(currentUserDoc?.rol);
      if(viewerMode) apply();
    }catch(e){ console.warn("No pude determinar el rol para modo lectura:", e); }
  });
}
window.addEventListener("DOMContentLoaded", apply);
