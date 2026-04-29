import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let cache = [];
let IS_ADMIN = false;

const MANAGED = [
  { key: "presidente", label: "Presidente", aliases: ["presidente"] },
  { key: "oracion", label: "Oración", aliases: ["oracion", "oración"] },
  { key: "conductor", label: "Conductor La Atalaya", aliases: ["conductor", "conductor atalaya", "conductor la atalaya"] },
  { key: "lector", label: "Lector La Atalaya", aliases: ["lector", "lector atalaya", "lector la atalaya"] },
  { key: "microfonista", label: "Microfonista", aliases: ["microfonista", "microfonistas"] },
  { key: "acomodador", label: "Acomodador", aliases: ["acomodador", "acomodadores"] },
  { key: "plataforma", label: "Acomodador plataforma", aliases: ["plataforma", "acomodador plataforma", "acomodador de plataforma"] },
];

function normalize(s){
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\.\,\;\:]+$/g, "")
    .replace(/\s+/g, " ");
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${escapeHtml(msg)}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 5000);
}

function setStatus(msg, isError=false){
  const box = $("status");
  if(!box) return;
  box.textContent = msg;
  box.style.display = "block";
  box.style.background = isError ? "#fff1f2" : "#f8fafc";
  box.style.border = `1px solid ${isError ? "#fecdd3" : "#e5e7eb"}`;
  box.style.color = isError ? "#9f1239" : "#111827";
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}

function renderTopbar(active, rol){
  const admin = isAdminRole(rol);
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
        ${admin ? `<a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
        <a href="funciones.html" class="${active==='funciones'?'active':''}">Funciones</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>` : `<a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>`}
      </div>
      <div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch(e){}
    window.location.href = "index.html";
  });
}

async function requireActiveUser(activePage){
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      renderTopbar(activePage, u?.rol);
      resolve({ user, usuario:u });
    });
  });
}

function roleSet(p){
  const roles = Array.isArray(p?.roles) ? p.roles : [];
  return new Set(roles.map(normalize));
}

function hasManagedRole(p, def){
  const set = roleSet(p);
  return def.aliases.some(a => set.has(normalize(a)));
}

function removeManagedRoles(roles){
  const managedAliases = new Set(MANAGED.flatMap(d => d.aliases).map(normalize));
  return (Array.isArray(roles) ? roles : [])
    .map(r => String(r || "").trim())
    .filter(Boolean)
    .filter(r => !managedAliases.has(normalize(r)));
}

function rolesFromRow(p){
  const keep = removeManagedRoles(p.roles);
  for(const def of MANAGED){
    const cb = document.querySelector(`input[data-id="${CSS.escape(p.id)}"][data-role="${def.key}"]`);
    if(cb?.checked) keep.push(def.key);
  }
  return Array.from(new Set(keep));
}

function render(){
  const q = normalize($("q")?.value || "");
  const filtro = $("filtro")?.value || "";
  const tbody = document.querySelector("#tblFunciones tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  const rows = cache
    .filter(p => !q || normalize(p.nombre).includes(q))
    .filter(p => filtro !== "activos" || p.activo !== false)
    .filter(p => filtro !== "inactivos" || p.activo === false)
    .sort((a,b)=> (a.nombre||"").localeCompare(b.nombre||"","es"));

  for(const p of rows){
    const tr = document.createElement("tr");
    const estado = p.activo===false ? ' <span class="pill" style="background:#fff1f2;border-color:#fecdd3;color:#9f1239">inactivo</span>' : "";
    tr.innerHTML = `<td><b>${escapeHtml(p.nombre || "")}</b>${estado}</td>` + MANAGED.map(def => {
      const checked = hasManagedRole(p, def) ? "checked" : "";
      const disabled = IS_ADMIN ? "" : "disabled";
      return `<td class="td-center"><input type="checkbox" ${checked} ${disabled} data-id="${escapeHtml(p.id)}" data-role="${def.key}" aria-label="${escapeHtml(def.label)} para ${escapeHtml(p.nombre || "persona")}"></td>`;
    }).join("");
    tbody.appendChild(tr);
  }
}

async function cargar(){
  const snap = await getDocs(collection(db,"personas"));
  cache = snap.docs.map(d=>({ id:d.id, ...d.data() })).filter(p=>p?.nombre);
  render();
  setStatus(`Funciones cargadas: ${cache.length} personas.`);
}

async function guardarFunciones(){
  if(!IS_ADMIN) return toast("Modo solo lectura.", true);
  const btn = $("btnGuardarFunciones");
  if(btn){ btn.disabled = true; btn.textContent = "Guardando…"; }
  try{
    let cambios = 0;
    for(const p of cache){
      const roles = rolesFromRow(p);
      const before = JSON.stringify((Array.isArray(p.roles) ? p.roles : []).map(String).sort());
      const after = JSON.stringify(roles.map(String).sort());
      if(before === after) continue;
      await updateDoc(doc(db,"personas",p.id), { roles, updatedAt: serverTimestamp() });
      cambios++;
    }
    await cargar();
    toast(cambios ? `Funciones guardadas: ${cambios} persona(s) actualizada(s).` : "No había cambios para guardar.");
  }catch(e){
    console.error(e);
    toast("No pude guardar funciones. Revisá permisos de Firestore.", true);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = "Guardar funciones"; }
  }
}

(async function(){
  const { usuario } = await requireActiveUser("funciones");
  IS_ADMIN = isAdminRole(usuario?.rol);
  if(!IS_ADMIN){
    const b = $("btnGuardarFunciones");
    if(b) b.disabled = true;
    toast("Modo solo lectura.");
  }
  $("q")?.addEventListener("input", render);
  $("filtro")?.addEventListener("change", render);
  $("btnGuardarFunciones")?.addEventListener("click", guardarFunciones);
  await cargar();
})();
