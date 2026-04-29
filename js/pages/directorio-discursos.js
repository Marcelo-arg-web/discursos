import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id)=>document.getElementById(id);
let CACHE = [];

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function normalize(s){
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}
async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}
function renderTopbar(){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html">Panel</a>
        <a href="asignaciones.html">Asignaciones</a>
        <a href="resultados.html">Resultados</a>
        <a href="documentos.html">Documentos/PDF</a>
        <a href="visitantes.html">Visitantes</a>
        <a href="salientes.html">Salientes</a>
        <a href="personas.html">Personas</a>
        <a href="funciones.html">Funciones</a>
        <a href="discursantes.html">Discursantes</a>
        <a href="directorio-discursos.html" class="active">PDF discursantes</a>
        <a href="usuarios.html">Usuarios</a>
        <a href="perfil.html">Mi perfil</a>
      </div>
      <div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div>
    </div>
  `;
  $("btnSalir")?.addEventListener("click", async()=>{ await signOut(auth); location.href="index.html"; });
}
async function requireAdmin(){
  return new Promise(resolve=>{
    onAuthStateChanged(auth, async user=>{
      if(!user){ location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){ await signOut(auth); location.href="index.html"; return; }
      if(!isAdminRole(u?.rol)){ location.href="resultados.html"; return; }
      renderTopbar();
      resolve();
    });
  });
}
function isActive(u){
  if(u.activo === false) return false;
  const s = String(u.activo ?? true).toLowerCase();
  return !["false","no","inactivo","0"].includes(s);
}
function isApprovedForOutgoing(u){
  return u.aprobadoSalida === true || u.aprobadoParaSalir === true || String(u.aprobadoSalida || "").toLowerCase() === "true";
}
function isLocalOnly(u){
  return u.soloLocalmente === true || u.soloLocal === true || String(u.soloLocalmente || "").toLowerCase() === "true";
}
function isElderOrMinisterial(u){
  const r = normalize(u.responsabilidad || u.privilegio || "");
  return r === "anciano" || r === "siervo ministerial" || r === "ministerial";
}
function normalizeBosquejoItem(item){
  if(!item) return null;
  if(typeof item === "string"){
    const m = item.trim().match(/^(\d{1,3})\s*[-–—:.]?\s*(.*)$/);
    if(!m) return null;
    return { num:String(Number(m[1])), titulo:String(m[2]||"").trim() };
  }
  const m = String(item.num || item.numero || item.bosquejo || item.id || "").trim().match(/\d{1,3}/);
  if(!m) return null;
  return { num:String(Number(m[0])), titulo:String(item.titulo || item.nombre || item.title || "").trim() };
}
function splitLegacyBosquejos(text){
  return String(text || "").split(/\r?\n/).map(normalizeBosquejoItem).filter(Boolean);
}
function getBosquejos(u){
  let arr = [];
  if(Array.isArray(u.perfilBosquejos)) arr = u.perfilBosquejos.map(normalizeBosquejoItem).filter(Boolean);
  else if(Array.isArray(u.bosquejosPerfil)) arr = u.bosquejosPerfil.map(normalizeBosquejoItem).filter(Boolean);
  else arr = splitLegacyBosquejos(u.discursosTiene);
  const seen = new Set();
  return arr.filter(x=>{
    if(!x.num || seen.has(x.num)) return false;
    seen.add(x.num);
    return true;
  }).sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0));
}
function getCongregacion(u){
  return String(u.congregacionPerfil || u.congregacion || "Villa Fiad").trim() || "Villa Fiad";
}
function getNombre(u){
  return String(u.nombreCompleto || u.nombre || u.email || "Sin nombre").trim();
}
function render(){
  const dir = $("directorio");
  const status = $("directorioStatus");
  if(!dir) return;
  const q = normalize($("q")?.value || "");

  const base = CACHE
    .filter(isActive)
    .filter(isElderOrMinisterial)
    .filter(isApprovedForOutgoing)
    .filter(u=>!isLocalOnly(u));

  const sinBosquejos = base.filter(u=>getBosquejos(u).length === 0).length;
  let rows = base.filter(u=>getBosquejos(u).length > 0);
  if(q){
    rows = rows.filter(u => normalize([
      getNombre(u), u.email, u.telefono, u.responsabilidad, getCongregacion(u),
      getBosquejos(u).map(b=>`${b.num} ${b.titulo}`).join(" "),
      u.observacionesPerfil
    ].join(" ")).includes(q));
  }
  rows.sort((a,b)=>getNombre(a).localeCompare(getNombre(b),"es"));

  if(status){
    const extra = sinBosquejos ? ` (${sinBosquejos} aprobado/s sin bosquejos cargados no se incluyen).` : ".";
    status.textContent = rows.length ? `Discursantes aprobados para enviar: ${rows.length}${extra}` : "No hay discursantes aprobados para salir con bosquejos cargados.";
  }
  if(!rows.length){ dir.innerHTML = ""; return; }

  dir.innerHTML = rows.map(u=>{
    const bosquejos = getBosquejos(u);
    const nombre = getNombre(u);
    const privilegio = u.responsabilidad || u.privilegio || "—";
    const tel = u.telefono || u.telefonoPerfil || "";
    const cong = getCongregacion(u);
    return `<article class="speaker-card approved-speaker-card">
      <div class="speaker-head">
        <div>
          <h2>${escapeHtml(nombre)}</h2>
          <p>${escapeHtml(privilegio)} · ${escapeHtml(cong)}</p>
        </div>
        <div class="speaker-contact">
          ${tel ? `<strong>Tel:</strong> ${escapeHtml(tel)}<br/>` : ""}
          <strong>Congregación:</strong> ${escapeHtml(cong)}
        </div>
      </div>
      <table class="table speaker-talk-table">
        <thead><tr><th style="width:90px;">Bosquejo</th><th>Título del discurso</th></tr></thead>
        <tbody>
          ${bosquejos.map(b=>`<tr><td style="font-family:var(--mono);">${escapeHtml(b.num)}</td><td>${escapeHtml(b.titulo || "")}</td></tr>`).join("")}
        </tbody>
      </table>
      ${u.observacionesPerfil ? `<div class="speaker-notes"><strong>Observaciones internas:</strong> ${escapeHtml(u.observacionesPerfil)}</div>` : ""}
    </article>`;
  }).join("");
}
async function cargar(){
  const status = $("directorioStatus");
  if(status) status.textContent = "Cargando perfiles aprobados…";
  // No usamos orderBy("nombre") para no excluir perfiles sin nombre cargado.
  const snap = await getDocs(collection(db,"usuarios"));
  CACHE = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  render();
}

(async function(){
  await requireAdmin();
  const fecha = $("fechaPDF");
  if(fecha) fecha.textContent = new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"long", year:"numeric" });
  $("q")?.addEventListener("input", render);
  $("btnRefrescar")?.addEventListener("click", cargar);
  $("btnImprimir")?.addEventListener("click", ()=>window.print());
  await cargar();
})();
