import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}
async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}
function renderAdminTopbar(){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html">Panel</a>
        <a href="asignaciones.html">Asignaciones</a>
        <a href="resultados.html" class="active">Resultados</a>
        <a href="programa-mensual.html">Programa mensual</a>
        <a href="tablero-acomodadores.html">Asignaciones Villa Fiad</a>
        <a href="visitantes.html">Visitantes</a>
        <a href="salientes.html">Salientes</a>
        <a href="personas.html">Personas</a>
        <a href="funciones.html">Funciones</a>
        <a href="directorio-discursos.html">PDF discursantes</a>
        <a href="usuarios.html">Usuarios</a>
        <a href="perfil.html">Mi perfil</a>
      </div>
      <div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div>
    </div>`;
  document.getElementById("btnSalir")?.addEventListener("click", async()=>{ await signOut(auth); location.href="index.html"; });
}
function renderViewerTopbar(name="Usuario"){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar viewer-topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links viewer-links">
        <a href="resultados.html" class="active">Resultados</a>
        <a href="visitantes.html">Visitantes</a>
        <a href="salientes.html">Salientes</a>
        <a href="programa-mensual.html">Programa mensual</a>
        <a href="tablero-acomodadores.html">Acomodadores</a>
        <a href="doc-presi.html">Presidente</a>
        <a href="imprimir.html">Descargar/PDF</a>
        <a href="perfil.html">Mi perfil</a>
      </div>
      <div class="actions">
        <span class="badge">Solo lectura</span>
        <span class="badge soft">${escapeHtml(name)}</span>
        <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>`;
  document.getElementById("btnSalir")?.addEventListener("click", async()=>{
    if(hasPublicAccess()){ setPublicAccess(false); location.href="index.html"; return; }
    await signOut(auth); location.href="index.html";
  });
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function todayISO(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function currentYM(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function formatDate(iso){
  if(!iso) return "—";
  const [y,m,d] = String(iso).slice(0,10).split('-').map(Number);
  if(!y || !m || !d) return iso;
  return new Date(y, m-1, d).toLocaleDateString("es-AR", { weekday:"short", day:"2-digit", month:"2-digit" });
}
function syncLinks(){
  const ym = $("mesResultados")?.value || currentYM();
  const q = `?mes=${encodeURIComponent(ym)}`;
  const map = {
    linkPrograma: "programa-mensual.html" + q,
    linkAcomodadores: "tablero-acomodadores.html" + q,
    linkPresidente: "doc-presi.html" + q,
    linkImprimir: "imprimir.html" + q,
  };
  Object.entries(map).forEach(([id,href])=>{ const a=$(id); if(a) a.href = href; });
}
async function previewVisitantes(){
  const box = $("previewVisitantes");
  if(!box) return;
  try{
    const min = todayISO();
    const snap = await getDocs(collection(db,"visitas"));
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .filter(v=>String(v.id) >= min)
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
      .slice(0,6);
    if(!rows.length){ box.innerHTML = `<div class="muted">No hay visitantes próximos cargados.</div>`; return; }
    box.innerHTML = `<div class="result-list">${rows.map(v=>{
      const n = Number(v.bosquejo);
      const titulo = v.titulo || (Number.isFinite(n) ? bosquejos[n] : "") || "";
      return `<div class="result-line">
        <div><strong>${escapeHtml(formatDate(v.id))}</strong> · ${escapeHtml(v.nombre||"")}</div>
        <div class="muted small">${escapeHtml(v.congregacion||"")} ${v.bosquejo ? `· Bosquejo ${escapeHtml(v.bosquejo)}` : ""} ${titulo ? `· ${escapeHtml(titulo)}` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">No pude cargar los visitantes.</div>`;
  }
}
async function previewSalientes(){
  const box = $("previewSalientes");
  if(!box) return;
  try{
    const min = todayISO();
    const snap = await getDocs(collection(db,"salientes"));
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .filter(s=>String(s.fecha||s.id||"") >= min)
      .sort((a,b)=>String(a.fecha||a.id||"").localeCompare(String(b.fecha||b.id||"")))
      .slice(0,6);
    if(!rows.length){ box.innerHTML = `<div class="muted">No hay salidas próximas cargadas.</div>`; return; }
    box.innerHTML = `<div class="result-list">${rows.map(s=>{
      const fecha = s.fecha || s.id;
      const n = Number(s.bosquejo || s.discurso || s.numero);
      const titulo = s.titulo || (Number.isFinite(n) ? bosquejos[n] : "") || "";
      const nombre = s.nombre || s.orador || s.hermano || "";
      const cong = s.congregacion || s.destino || s.congregacionDestino || "";
      return `<div class="result-line">
        <div><strong>${escapeHtml(formatDate(fecha))}</strong> · ${escapeHtml(nombre)}</div>
        <div class="muted small">${escapeHtml(cong)} ${n ? `· Bosquejo ${escapeHtml(n)}` : ""} ${titulo ? `· ${escapeHtml(titulo)}` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">No pude cargar las salidas.</div>`;
  }
}
async function requireAccess(){
  if(hasPublicAccess()){
    renderViewerTopbar("Modo consulta");
    return;
  }
  return new Promise(resolve=>{
    onAuthStateChanged(auth, async user=>{
      if(!user){ location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){ await signOut(auth); location.href="index.html"; return; }
      if(isAdminRole(u?.rol)) renderAdminTopbar();
      else renderViewerTopbar(u?.nombre || user.email || "Usuario");
      resolve();
    });
  });
}
(async function(){
  await requireAccess();
  const mes = $("mesResultados");
  if(mes){
    const params = new URLSearchParams(location.search);
    mes.value = params.get("mes") || currentYM();
    mes.addEventListener("change", syncLinks);
  }
  syncLinks();
  await Promise.all([previewVisitantes(), previewSalientes()]);
})();
