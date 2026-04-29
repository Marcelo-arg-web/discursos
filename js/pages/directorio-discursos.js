import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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
        <a href="programa-mensual.html">Programa mensual</a>
        <a href="tablero-acomodadores.html">Asignaciones Villa Fiad</a>
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
function splitLines(text){
  return String(text || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
}
function isActive(u){
  if(u.activo === false) return false;
  const s = String(u.activo ?? true).toLowerCase();
  return !["false","no","inactivo","0"].includes(s);
}
function hasProfile(u){
  return Boolean((u.nombreCompleto || u.nombre) && (u.telefono || u.discursosTiene || u.discursosPreparar || u.responsabilidad));
}
function render(){
  const dir = $("directorio");
  const status = $("directorioStatus");
  if(!dir) return;
  const q = normalize($("q")?.value || "");
  let rows = CACHE.filter(isActive).filter(hasProfile);
  if(q){
    rows = rows.filter(u => normalize([
      u.nombreCompleto, u.nombre, u.email, u.telefono, u.responsabilidad,
      u.discursosTiene, u.discursosPreparar, u.observacionesPerfil
    ].join(" ")).includes(q));
  }
  rows.sort((a,b)=>String(a.nombreCompleto || a.nombre || "").localeCompare(String(b.nombreCompleto || b.nombre || ""),"es"));

  if(status) status.textContent = rows.length ? `Perfiles listos: ${rows.length}.` : "No hay perfiles cargados todavía.";
  if(!rows.length){ dir.innerHTML = ""; return; }

  dir.innerHTML = rows.map(u=>{
    const tiene = splitLines(u.discursosTiene);
    const preparar = splitLines(u.discursosPreparar);
    return `<article class="speaker-card">
      <div class="speaker-head">
        <div>
          <h2>${escapeHtml(u.nombreCompleto || u.nombre || u.email || "Sin nombre")}</h2>
          <p>${escapeHtml(u.responsabilidad || "—")}</p>
        </div>
        <div class="speaker-contact">
          ${u.telefono ? `<strong>Tel:</strong> ${escapeHtml(u.telefono)}<br/>` : ""}
          ${u.email ? `<span>${escapeHtml(u.email)}</span>` : ""}
        </div>
      </div>
      <div class="speaker-grid">
        <div>
          <h3>Discursos que tiene</h3>
          ${tiene.length ? `<ul>${tiene.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p class="muted">Sin datos cargados.</p>`}
        </div>
        <div>
          <h3>Discursos que quiere preparar</h3>
          ${preparar.length ? `<ul>${preparar.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p class="muted">Sin datos cargados.</p>`}
        </div>
      </div>
      ${u.observacionesPerfil ? `<div class="speaker-notes"><strong>Observaciones:</strong> ${escapeHtml(u.observacionesPerfil)}</div>` : ""}
    </article>`;
  }).join("");
}
async function cargar(){
  const status = $("directorioStatus");
  if(status) status.textContent = "Cargando perfiles…";
  const qy = query(collection(db,"usuarios"), orderBy("nombre"));
  const snap = await getDocs(qy);
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
