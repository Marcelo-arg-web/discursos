import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, requirePublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, query, orderBy
  , FieldPath, startAt
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";
import { canciones } from "../data/canciones.js";

const $ = (id) => document.getElementById(id);

// Estado de sesión/permiso
// (evita ReferenceError en navegadores estrictos)
let currentRol = "";
let isAdmin = false;

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host){ alert(msg); return; }
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " err" : "");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r==="admin" || r==="superadmin";
}

function applyReadOnlyMode(){
  if(isAdmin) return;
  // Deshabilitar formulario y acciones de edición
  ["btnGuardar","btnBorrar","btnNuevo"].forEach(id=>{ const b=$(id); if(b) b.disabled=true; });
  ["fecha","nombre","congregacion","bosquejo","titulo","cancion"].forEach(id=>{ const el=$(id); if(el) el.disabled=true; });
}


function hoyISO(){
  const h=new Date(); h.setHours(0,0,0,0);
  return h.toISOString().slice(0,10);
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function renderPublicTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="public-home.html" class="${active==='public'?'active':''}">Inicio</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
      </div>
      <div class="right">
        <span class="badge">Solo lectura</span>
        <button id="btnSalirPublico" class="btn sm">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalirPublico")?.addEventListener("click", ()=>{
    setPublicAccess(false);
    window.location.href = "index.html";
  });
}

function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

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
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Acomodadores</a>
        <a href="tablero-multimedia.html" class="${active==='multimedia'?'active':''}">Multimedia</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
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


async function requireActiveUser(){
  ensureTopbarStyles();

  if(hasPublicAccess()){
    renderPublicTopbar("visitantes");
    currentRol = "public";
    isAdmin = false;
    applyReadOnlyMode();
    return;
  }

  renderTopbar("visitantes");

  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      currentRol = u?.rol || "";
      isAdmin = isAdminRole(currentRol);
      applyReadOnlyMode();
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      resolve({ user, usuario:u });
    });
  });
}

function normISO(s){
  const v=(s||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  return v;
}
function normNum(v){
  const n = String(v||"").trim();
  if(!n) return "";
  const x = Number(n);
  return Number.isFinite(x) ? x : "";
}

const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v])=>[Number(k), String(v)]));
const cancionesMap = new Map(Object.entries(canciones).map(([k,v])=>[Number(k), String(v)]));

function fillFromDoc(id, d){
  $("editId").value = id;
  $("fecha").value = id || d.fecha || "";
  $("nombre").value = d.nombre || d.discursante || "";
  $("congregacion").value = d.congregacion || "";
  $("bosquejo").value = d.bosquejo ?? "";
  $("titulo").value = d.titulo || "";
  $("cancion").value = d.cancion ?? "";
  $("hospitalidad").value = d.hospitalidad || "";
  $("observaciones").value = d.observaciones || "";
  $("btnBorrar").disabled = !id;
}

function clearForm(){
  $("editId").value = "";
  $("fecha").value = "";
  $("nombre").value = "";
  $("congregacion").value = "";
  $("bosquejo").value = "";
  $("titulo").value = "";
  $("cancion").value = "";
  $("hospitalidad").value = "";
  $("observaciones").value = "";
  $("btnBorrar").disabled = true;
  $("fecha").focus();
}

function applyAuto(){
  const b = normNum($("bosquejo").value);
  if(b && !$("titulo").value.trim()){
    const t = bosquejosMap.get(b);
    if(t) $("titulo").value = t;
  }
  const c = normNum($("cancion").value);
  if(c && !$("cancion").value.trim()){
    const t = cancionesMap.get(c);
    if(t) $("cancion").value = String(c);
  }
}

let cache = []; // {id, ...data}

function renderTable(){
  const q = ($("filtro").value||"").trim().toLowerCase();
  const rows = cache.filter(r=>{
    if(!q) return true;
    return String(r.nombre||"").toLowerCase().includes(q) || String(r.congregacion||"").toLowerCase().includes(q);
  });

  const tbody = $("tbody");
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Sin registros.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r=>`
    <tr data-id="${r.id}">
      <td>${r.id}</td>
      <td>${escapeHtml(r.nombre||"")}</td>
      <td>${escapeHtml(r.congregacion||"")}</td>
      <td>${r.bosquejo ?? ""}</td>
      <td>${escapeHtml(r.titulo||"")}</td>
      <td>${r.cancion ?? ""}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const id = tr.getAttribute("data-id");
      const r = cache.find(x=>x.id===id);
      if(r) fillFromDoc(r.id, r);
      window.scrollTo({top:0, behavior:"smooth"});
    });
  });
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

async function load(){
  const showAll = !!$("chkHistorial")?.checked;
  const desde = hoyISO();
  try{
    // Usamos documentId() porque el ID es la fecha ISO (YYYY-MM-DD) y ordena perfecto.
    // Por defecto mostramos desde hoy; si el usuario marca historial completo, cargamos todo.
    const q = showAll
      ? query(collection(db,"visitas"), orderBy(FieldPath.documentId(),"asc"))
      : query(collection(db,"visitas"), orderBy(FieldPath.documentId(),"asc"), startAt(desde));
    const s = await getDocs(q);
    cache = s.docs.map(d=>({ id:d.id, ...d.data(), fecha: d.data().fecha || d.id }));
  }catch(e){
    console.error(e);
    toast("No pude cargar Visitantes. Revisá permisos de Firestore para 'visitas' o la consola (F12).", true);
    cache = [];
  }

  // normaliza y ordena
  cache = (cache||[]).map(r=>({
    ...r,
    fecha: r.fecha || r.id,
  }));

  cache.sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  renderTable();
}

async function save(){
  const fecha = normISO($("fecha").value);
  if(!fecha) return toast("Fecha inválida. Usá formato YYYY-MM-DD.", true);
  const nombre = ($("nombre").value||"").trim();
  const congregacion = ($("congregacion").value||"").trim();
  if(!nombre || !congregacion) return toast("Completá nombre y congregación.", true);

  const bosquejo = normNum($("bosquejo").value);
  const titulo = ($("titulo").value||"").trim();
  const cancion = normNum($("cancion").value);
  const hospitalidad = ($("hospitalidad").value||"").trim();
  const observaciones = ($("observaciones").value||"").trim();

  const payload = {
    fecha, // ayuda para orderBy
    nombre,
    congregacion,
    bosquejo: bosquejo===""? "" : bosquejo,
    titulo,
    cancion: cancion===""? "" : cancion,
    hospitalidad,
    observaciones,
    updatedAt: new Date().toISOString(),
  };

  try{
    await setDoc(doc(db,"visitas",fecha), payload, { merge:true });
    toast("Guardado OK.");
    clearForm();
    await load();
  }catch(e){
    console.error(e);
    toast("No pude guardar. Revisá permisos de Firestore.", true);
  }
}

async function borrar(){
  const id = $("editId").value;
  if(!id) return;
  if(!confirm(`¿Borrar visitante del ${id}?`)) return;
  try{
    await deleteDoc(doc(db,"visitas",id));
    toast("Borrado.");
    clearForm();
    await load();
  }catch(e){
    console.error(e);
    toast("No pude borrar. Revisá permisos.", true);
  }
}

(async function(){
  try{
    await requireActiveUser();
  }catch(e){
    console.error(e);
    // Muestra al menos un menú básico para no quedar sin navegación
    try{ renderTopbar("visitantes"); }catch(_){ }
    toast("Error iniciando Visitantes. Revisá consola (F12).", true);
    return;
  }

  $("bosquejo")?.addEventListener("blur", applyAuto);
  $("btnNuevo")?.addEventListener("click", clearForm);
  $("btnRefrescar")?.addEventListener("click", load);
  $("chkHistorial")?.addEventListener("change", load);
  $("filtro")?.addEventListener("input", renderTable);
  $("btnBorrar")?.addEventListener("click", borrar);
  $("form")?.addEventListener("submit", (ev)=>{ ev.preventDefault(); save(); });

  await load();
})();
