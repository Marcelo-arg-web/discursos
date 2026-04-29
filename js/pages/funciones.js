import { auth, db } from "../firebase-config.js?v=20260429b71";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let cache = [];
let IS_ADMIN = false;

const MANAGED = [
  { key: "presidente", label: "Presidente", aliases: ["presidente"] },
  { key: "oracion", label: "Oración", aliases: ["oracion", "oración"] },
  { key: "conductor", label: "Conductor La Atalaya", aliases: ["conductor", "conductor atalaya", "conductor la atalaya"] },
  { key: "lector", label: "Lector La Atalaya", aliases: ["lector", "lector atalaya", "lector la atalaya"] },
  { key: "multimedia", label: "Audio/Video", aliases: ["multimedia", "audio", "video", "audio/video", "audio y video"] },
  { key: "microfonista", label: "Microfonista", aliases: ["microfonista", "microfonistas"] },
  { key: "acomodador", label: "Acomodador", aliases: ["acomodador", "acomodadores"] },
  { key: "plataforma", label: "Acomodador plataforma", aliases: ["plataforma", "acomodador plataforma", "acomodador de plataforma"] },
];

const BASE_ROLES = [
  { key: "anciano", label: "Anciano", aliases: ["anciano", "ancianos"] },
  { key: "siervo", label: "Siervo ministerial", aliases: ["siervo", "siervo ministerial", "ministerial", "siervos"] },
  { key: "discursante", label: "Discursante", aliases: ["discursante", "orador", "conferenciante"] },
  { key: "visitante", label: "Visitante", aliases: ["visitante"] },
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
        <a href="documentos.html" class="${active==='documentos'?'active':''}">Documentos/PDF</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        ${admin ? `<a href="funciones.html" class="${active==='funciones'?'active':''}">Funciones</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>` : ``}
        <a href="perfil.html" class="${active==='perfil'?'active':''}">Mi perfil</a>
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

function hasRoleByDef(p, def){
  const set = roleSet(p);
  return def.aliases.some(a => set.has(normalize(a)));
}

function aliasesSet(list){
  return new Set(list.flatMap(d => d.aliases).map(normalize));
}
const MANAGED_ALIASES = aliasesSet(MANAGED);
const BASE_ALIASES = aliasesSet(BASE_ROLES);

function removeRolesByAliases(roles, aliases){
  return (Array.isArray(roles) ? roles : [])
    .map(r => String(r || "").trim())
    .filter(Boolean)
    .filter(r => !aliases.has(normalize(r)));
}

function removeManagedRoles(roles){ return removeRolesByAliases(roles, MANAGED_ALIASES); }
function removeBaseRoles(roles){ return removeRolesByAliases(roles, BASE_ALIASES); }

function rolesFromRow(p){
  const keep = removeManagedRoles(p.roles);
  for(const def of MANAGED){
    const cb = document.querySelector(`input[data-id="${CSS.escape(p.id)}"][data-role="${def.key}"]`);
    if(cb?.checked) keep.push(def.key);
  }
  return Array.from(new Set(keep));
}

function baseRolesFromForm(){
  return Array.from(document.querySelectorAll("input[data-base-role]:checked"))
    .map(cb => cb.getAttribute("data-base-role"))
    .filter(Boolean);
}

function setBaseRolesInForm(p){
  document.querySelectorAll("input[data-base-role]").forEach(cb=>{
    const key = cb.getAttribute("data-base-role");
    const def = BASE_ROLES.find(r => r.key === key);
    cb.checked = def ? hasRoleByDef(p, def) : false;
  });
}

function baseLabels(p){
  return BASE_ROLES.filter(r => hasRoleByDef(p, r)).map(r => r.label);
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
    const disabled = IS_ADMIN ? "" : "disabled";
    const activoChecked = p.activo === false ? "" : "checked";
    const base = baseLabels(p).join(" · ");
    tr.innerHTML = `
      <td class="sticky-name"><b>${escapeHtml(p.nombre || "")}</b>${estado}<div class="small muted">${escapeHtml(base || "Sin rol base")}</div></td>
      <td>${escapeHtml(p.telefono || "")}</td>
      <td class="td-center"><input type="checkbox" ${activoChecked} ${disabled} data-id="${escapeHtml(p.id)}" data-active="1" aria-label="Activo para ${escapeHtml(p.nombre || "persona")}"></td>
    ` + MANAGED.map(def => {
      const checked = hasRoleByDef(p, def) ? "checked" : "";
      return `<td class="td-center" title="${escapeHtml(def.label)}"><input type="checkbox" ${checked} ${disabled} data-id="${escapeHtml(p.id)}" data-role="${def.key}" aria-label="${escapeHtml(def.label)} para ${escapeHtml(p.nombre || "persona")}"></td>`;
    }).join("") + `
      ${IS_ADMIN ? `<td class="no-print actions-cell">
        <button class="btn sm" type="button" data-act="edit" data-id="${escapeHtml(p.id)}">Editar</button>
        <button class="btn sm danger" type="button" data-act="delete" data-id="${escapeHtml(p.id)}">Eliminar</button>
      </td>` : ``}
    `;
    tbody.appendChild(tr);
  }

  if(IS_ADMIN){
    tbody.querySelectorAll("button[data-act]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const p = cache.find(x => x.id === id);
        if(!p) return;
        if(act === "edit") editarPersona(p);
        if(act === "delete") await eliminarPersona(p);
      });
    });
  }
}

async function cargar(){
  const snap = await getDocs(collection(db,"personas"));
  cache = snap.docs.map(d=>({ id:d.id, ...d.data() })).filter(p=>p?.nombre);
  render();
  setStatus(`Personas cargadas: ${cache.length}. Podés agregar, editar, eliminar y marcar funciones desde esta página.`);
}

function activeFromRow(p){
  const cb = document.querySelector(`input[data-id="${CSS.escape(p.id)}"][data-active="1"]`);
  return cb ? !!cb.checked : p.activo !== false;
}

function limpiarPersona(){
  $("p_id").value = "";
  $("p_nombre").value = "";
  $("p_tel").value = "";
  $("p_activo").checked = true;
  document.querySelectorAll("input[data-base-role]").forEach(cb => cb.checked = false);
  const del = $("btnEliminarPersona");
  if(del) del.disabled = true;
  $("p_nombre")?.focus();
}

function editarPersona(p){
  $("p_id").value = p.id || "";
  $("p_nombre").value = p.nombre || "";
  $("p_tel").value = p.telefono || "";
  $("p_activo").checked = p.activo !== false;
  setBaseRolesInForm(p);
  const del = $("btnEliminarPersona");
  if(del) del.disabled = false;
  document.getElementById("personaFormCard")?.scrollIntoView({ behavior:"smooth", block:"start" });
  toast(`Editando: ${p.nombre || "persona"}`);
}

async function guardarPersona(){
  if(!IS_ADMIN) return toast("Modo solo lectura.", true);
  const nombre = ($("p_nombre")?.value || "").trim();
  const telefono = ($("p_tel")?.value || "").trim();
  const id = ($("p_id")?.value || "").trim();
  const activo = !!$("p_activo")?.checked;
  if(!nombre) return toast("Falta nombre y apellido.", true);

  const actual = id ? cache.find(p => p.id === id) : null;
  const currentRoleState = actual ? rolesFromRow(actual) : [];
  const preservedRoles = removeBaseRoles(currentRoleState);
  const roles = Array.from(new Set([...preservedRoles, ...baseRolesFromForm()]));
  const payload = { nombre, telefono, roles, activo, updatedAt: serverTimestamp() };

  const btn = $("btnGuardarPersona");
  if(btn){ btn.disabled = true; btn.textContent = "Guardando…"; }
  try{
    if(id){
      await updateDoc(doc(db,"personas",id), payload);
      toast("Persona actualizada.");
    }else{
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db,"personas"), payload);
      toast("Persona agregada.");
    }
    limpiarPersona();
    await cargar();
  }catch(e){
    console.error(e);
    toast("No pude guardar la persona. Revisá permisos de Firestore.", true);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = "Guardar persona"; }
  }
}

async function eliminarPersona(p){
  if(!IS_ADMIN) return toast("Modo solo lectura.", true);
  const ok = confirm(`¿Eliminar a ${p.nombre || "esta persona"}?\n\nEsto borra la persona de la lista de funciones y sugerencias.`);
  if(!ok) return;
  try{
    await deleteDoc(doc(db,"personas",p.id));
    if(($("p_id")?.value || "") === p.id) limpiarPersona();
    await cargar();
    toast("Persona eliminada.");
  }catch(e){
    console.error(e);
    toast("No pude eliminar. Revisá permisos de Firestore.", true);
  }
}

async function eliminarPersonaActual(){
  const id = ($("p_id")?.value || "").trim();
  if(!id) return;
  const p = cache.find(x => x.id === id);
  if(p) await eliminarPersona(p);
}

async function guardarFunciones(){
  if(!IS_ADMIN) return toast("Modo solo lectura.", true);
  const btn = $("btnGuardarFunciones");
  if(btn){ btn.disabled = true; btn.textContent = "Guardando…"; }
  try{
    let cambios = 0;
    for(const p of cache){
      const roles = rolesFromRow(p);
      const activo = activeFromRow(p);
      const before = JSON.stringify((Array.isArray(p.roles) ? p.roles : []).map(String).sort());
      const after = JSON.stringify(roles.map(String).sort());
      const activoAntes = p.activo !== false;
      if(before === after && activoAntes === activo) continue;
      await updateDoc(doc(db,"personas",p.id), { roles, activo, updatedAt: serverTimestamp() });
      cambios++;
    }
    await cargar();
    toast(cambios ? `Funciones/estado guardados: ${cambios} persona(s) actualizada(s).` : "No había cambios para guardar.");
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
  $("btnGuardarPersona")?.addEventListener("click", guardarPersona);
  $("btnLimpiarPersona")?.addEventListener("click", ()=>{ limpiarPersona(); toast("Formulario limpio."); });
  $("btnEliminarPersona")?.addEventListener("click", eliminarPersonaActual);
  await cargar();
})();
