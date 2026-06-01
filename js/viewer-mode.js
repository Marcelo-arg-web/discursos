import { auth, db } from "./firebase-config.js?v=20260429b75";
import { hasPublicAccess, setPublicAccess } from "./services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const VIEWER_ALLOWED = new Set([
  "resultados.html",
  "perfil.html"
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

const ADMIN_NAV_MAIN = [
  {href:'asignaciones.html', label:'Asignaciones', icon:'✓'},
  {href:'visitantes.html', label:'Visitantes', icon:'⇢'},
  {href:'salientes.html', label:'Salientes', icon:'⇠'},
  {href:'resultados.html', label:'Resultados', icon:'◉'}
];
const ADMIN_NAV_GROUPS = [
  {label:'Carga y roles', icon:'☑', items:[
    {href:'funciones.html', label:'Funciones / roles'},
    {href:'discursantes.html', label:'Discursantes'},
    {href:'personas.html', label:'Personas'},
    {href:'directorio-discursos.html', label:'Directorio de discursos'},
    {href:'preparar-semana.html', label:'Preparar semana'}
  ]},
  {label:'PDF e impresión', icon:'📄', items:[
    {href:'documentos.html', label:'Centro de documentos/PDF'},
    {href:'programa-mensual.html', label:'Programa mensual'},
    {href:'doc-presi.html', label:'Presidente: mes'},
    {href:'presidente.html', label:'Presidente: semana'},
    {href:'tablero-acomodadores.html', label:'Acomodadores y asignaciones'},
    {href:'tablero-multimedia.html', label:'Multimedia'},
    {href:'imprimir.html', label:'Resumen / imprimir'}
  ]},
  {label:'Administración', icon:'⚙', items:[
    {href:'panel.html', label:'Panel'},
    {href:'usuarios.html', label:'Usuarios'},
    {href:'importar.html', label:'Importar'},
    {href:'importar-visitantes.html', label:'Importar visitantes'},
    {href:'importar-asignaciones.html', label:'Importar asignaciones'},
    {href:'estadisticas.html', label:'Estadísticas'},
    {href:'perfil.html', label:'Mi perfil'}
  ]}
];
function isCurrentHref(href){
  const h = String(href || '').toLowerCase().split('?')[0].split('#')[0].replace(/^\.\//,'');
  return h === pageName();
}
function adminNavLink(item, cls='navQuick'){
  const active = isCurrentHref(item.href) ? ' active' : '';
  return `<a href="${item.href}" class="${cls}${active}" title="${escapeHtml(item.label)}"><span class="navIcon" aria-hidden="true">${item.icon || '•'}</span><span class="navText">${escapeHtml(item.label)}</span></a>`;
}
function renderAdminTopbar(){
  const topbar = document.getElementById('topbar');
  if(!topbar) return;
  document.body.classList.add('pro-online','has-topbar');
  document.body.classList.remove('public-view');
  const name = currentUserDoc?.nombre || currentUserDoc?.email || 'Admin';
  const main = ADMIN_NAV_MAIN.map(item => adminNavLink(item)).join('');
  const groups = ADMIN_NAV_GROUPS.map(group => {
    const active = group.items.some(item => isCurrentHref(item.href));
    const links = group.items.map(item => adminNavLink(item, 'navDropLink')).join('');
    return `<details class="navGroup${active ? ' active' : ''}"><summary title="${escapeHtml(group.label)}"><span class="navIcon" aria-hidden="true">${group.icon}</span><span>${escapeHtml(group.label)}</span></summary><div class="navGroupMenu">${links}</div></details>`;
  }).join('');
  topbar.innerHTML = `
    <div class="topbar organized-topbar">
      <div class="brand"><span class="brand-dot"></span><span class="brand-copy"><span class="brand-title">Discursos</span><span class="brand-sub">Arreglos · Villa Fiad</span></span></div>
      <div class="links nav-organized">${main}${groups}</div>
      <div class="actions"><span class="badge soft">${escapeHtml(name)}</span><button id="btnSalirViewer" class="btn danger sm" type="button">Salir</button></div>
    </div>
  `;
  document.getElementById('btnSalirViewer')?.addEventListener('click', logout);
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
  document.body.classList.add("pro-online", "has-topbar", "viewer-result-mode");
  document.body.classList.toggle("public-view", hasPublicAccess());
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
        <a href="resultados.html" class="${pageName() === 'resultados.html' ? 'active' : ''}">Resultados</a>
        ${hasPublicAccess() ? "" : `<a href="perfil.html" class="${pageName() === 'perfil.html' ? 'active' : ''}">Mi perfil</a>`}
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
  if(hasPublicAccess() && pageName() === "perfil.html"){ location.replace("resultados.html"); return; }
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

onAuthStateChanged(auth, async (user)=>{
  if(user){
    // Si estaba prendido el modo consulta público de una sesión anterior,
    // se limpia para que el usuario autenticado pueda usar Mi perfil y leer datos.
    if(hasPublicAccess()) setPublicAccess(false);
    try{
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      currentUserDoc = snap.exists() ? snap.data() : { email:user.email, rol:"viewer" };
      viewerMode = !isAdminRole(currentUserDoc?.rol);
      if(viewerMode) apply();
      else renderAdminTopbar();
    }catch(e){
      console.warn("No pude determinar el rol para modo lectura:", e);
      currentUserDoc = { email:user.email, nombre:user.email, rol:"viewer" };
      viewerMode = true;
      apply();
    }
    return;
  }
  if(hasPublicAccess()){
    viewerMode = true;
    currentUserDoc = { nombre: "Modo consulta", rol: "viewer" };
    apply();
  }
});
window.addEventListener("DOMContentLoaded", apply);
