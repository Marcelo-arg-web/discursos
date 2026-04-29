import { auth, db } from "./firebase-config.js";
import { hasPublicAccess, setPublicAccess } from "./services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const VIEWER_ALLOWED = new Set([
  "resultados.html"
]);
const VIEWER_EMBED_ALLOWED = new Set([
  "programa-mensual.html",
  "tablero-acomodadores.html",
  "doc-presi.html",
  "presidente.html",
  "imprimir.html"
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
  const stamp = pageName() + "|viewer-resultados-only";
  if(lastTopbarStamp === stamp && topbar.dataset.viewerNav === "resultados-only") return;
  lastTopbarStamp = stamp;
  topbar.dataset.viewerNav = "resultados-only";
  document.body.classList.add("viewer-result-mode");
  const name = currentUserDoc?.nombre || currentUserDoc?.email || (hasPublicAccess() ? "Modo consulta" : "Usuario");
  topbar.innerHTML = `
    <div class="topbar viewer-topbar resultados-only">
      <div class="brand"><span class="brand-dot"></span><span>Villa Fiad</span></div>
      <div class="links viewer-links">
        <a href="resultados.html" class="active">Resultados</a>
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
  const isEmbedded = new URLSearchParams(location.search).get("embed") === "1";
  if(isEmbedded && VIEWER_EMBED_ALLOWED.has(pageName())) return;
  if(!VIEWER_ALLOWED.has(pageName())) location.replace("resultados.html");
}
function apply(){
  if(!viewerMode) return;
  redirectIfNeeded();
  renderViewerTopbar();
  document.querySelectorAll(".admin-only, [data-admin-only=\"true\"]").forEach(el=>{ el.style.display = "none"; });
  document.querySelectorAll("form, .admin-panel, .admin-card, #hospBox, #btnRevisarSalientes2026, #btnGuardar, #btnBorrar, #btnNuevo, #btnLimpiar, #btnImport, #btnExport").forEach(el=>{
    if(el && !el.classList.contains("viewer-allowed")) el.style.display = "none";
  });
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
