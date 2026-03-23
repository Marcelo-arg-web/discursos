import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 5000);
}

function setSaveMsg(msg, isError=false){
  const box = $("saveMsg");
  if(!box) return;
  box.textContent = msg || "";
  box.style.color = isError ? "#9f1239" : "#166534";
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "editor" || r === "admin" || r === "superadmin";
}

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
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Acom/AV</a>
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


function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

async function requireActiveUser(activePage){
  ensureTopbarStyles();
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

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc as docRef,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let cache = []; // {id, nombre, telefono, roles[], activo}
let IS_ADMIN = false;

function parseRoles(raw){
  return (raw || "")
    .split(",")
    .map(s=>s.trim())
    .filter(Boolean);
}

function hasRole(p, role){
  const roles = Array.isArray(p.roles) ? p.roles : [];
  return roles.map(r=>String(r).toLowerCase()).includes(String(role).toLowerCase());
}

function render(){
  const q = (document.getElementById("q")?.value || "").toLowerCase();
  const filtro = (document.getElementById("filtroRol")?.value || "").toLowerCase();
  const filtroEstado = (document.getElementById("filtroEstado")?.value || "").toLowerCase();

  const tbody = document.querySelector("#tbl tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  const rows = cache
    .filter(p => (p.nombre || "").toLowerCase().includes(q))
    .filter(p => !filtro || hasRole(p, filtro))
    .filter(p => {
      if(!filtroEstado) return true;
      const activo = p.activo !== false;
      if(filtroEstado === "activos") return activo;
      if(filtroEstado === "inactivos") return !activo;
      return true;
    })
    .sort((a,b)=> (a.nombre||"").localeCompare(b.nombre||"","es"));

  for(const p of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.nombre || ""}${p.activo===false ? ' <span class="pill" style="background:#fff1f2;border-color:#fecdd3;color:#9f1239">inactivo</span>' : ""}</td>
      <td>${p.telefono || ""}</td>
      <td class="small">${(p.roles||[]).join(", ")}</td>
      ${IS_ADMIN ? `
        <td class="no-print">
          <button class="btn" data-act="edit" data-id="${p.id}">Editar</button>
          <button class="btn" data-act="toggle" data-id="${p.id}">${p.activo===false ? "Activar" : "Desactivar"}</button>
        </td>
      ` : ``}
    `;
    tbody.appendChild(tr);
  }

  if(!IS_ADMIN) return;
  tbody.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      const p = cache.find(x=>x.id===id);
      if(!p) return;

      if(act==="edit"){
        document.getElementById("p_nombre").value = p.nombre || "";
        document.getElementById("p_tel").value = p.telefono || "";
        document.getElementById("p_roles").value = (p.roles||[]).join(", ");
        document.getElementById("p_activo").checked = p.activo !== false;
        document.getElementById("p_id").value = p.id;
        setSaveMsg("Editando: " + (p.nombre||""));
        toast("Editando: "+(p.nombre||""), false);
      }

      if(act==="toggle"){
        const nuevo = !(p.activo===false);
        await updateDoc(docRef(db,"personas",id), { activo: !nuevo, updatedAt: serverTimestamp() });
        await cargar();
        toast((!nuevo) ? "Activado." : "Desactivado.");
      }
    });
  });
}

async function cargar(){
  // Traemos todo, incluidos inactivos (para editar sin borrarlos)
  const snap = await getDocs(collection(db,"personas"));
  cache = snap.docs.map(d=>({ id:d.id, ...d.data() })).filter(p=>p?.nombre);
  render();
}

function limpiar(){
  const pid = document.getElementById("p_id");
  if(pid) pid.value = "";
  document.getElementById("p_nombre").value = "";
  document.getElementById("p_tel").value = "";
  document.getElementById("p_roles").value = "";
  const activo = document.getElementById("p_activo");
  if(activo) activo.checked = true;
}

async function guardar(){
  const nombre = (document.getElementById("p_nombre").value || "").trim();
  const telefono = (document.getElementById("p_tel").value || "").trim();
  const roles = parseRoles(document.getElementById("p_roles").value);
  const id = (document.getElementById("p_id").value || "").trim();
  const activo = document.getElementById("p_activo")?.checked !== false;

  if(!nombre) return toast("Falta nombre.", true);

  setSaveMsg("Guardando…");

  const payload = {
    nombre,
    telefono,
    roles,
    activo,
    updatedAt: serverTimestamp()
  };

  try{
    if(id){
      await updateDoc(docRef(db,"personas",id), payload);
      setSaveMsg("Guardado con éxito.");
      toast("Guardado con éxito.");
    }else{
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db,"personas"), payload);
      setSaveMsg("Guardado con éxito.");
      toast("Guardado con éxito.");
    }
    limpiar();
    await cargar();
  }catch(e){
    console.error(e);
    const detail = e?.message ? ` ${e.message}` : "";
    setSaveMsg("No pude guardar." + detail, true);
    toast("No pude guardar." + detail, true);
  }
}

(async function(){
  const { usuario } = await requireActiveUser("personas");
  const admin = isAdminRole(usuario?.rol);
  IS_ADMIN = admin;

    if(admin){
    document.getElementById("btnGuardar")?.addEventListener("click", (e)=>{ e.preventDefault(); guardar(); });
    document.getElementById("btnLimpiar")?.addEventListener("click", (e)=>{ e.preventDefault(); limpiar(); setSaveMsg("Formulario limpio."); toast("Formulario limpio."); });
  }else{
    toast("Modo solo lectura: no podés editar Personas.");
    const b1 = document.getElementById("btnGuardar");
    const b2 = document.getElementById("btnLimpiar");
    if(b1) b1.disabled = true;
    if(b2) b2.disabled = true;
    ["p_nombre","p_tel","p_roles","p_activo"].forEach(id=>{ const el = document.getElementById(id); if(el) el.disabled = true; });
    // Oculta la columna de acciones
    const ths = document.querySelectorAll("#tbl thead th");
    if(ths && ths.length) ths[ths.length-1].style.display = "none";
  }

  document.getElementById("q")?.addEventListener("input", render);
  document.getElementById("filtroRol")?.addEventListener("change", render);
  document.getElementById("filtroEstado")?.addEventListener("change", render);

  ["p_nombre","p_tel","p_roles"].forEach(id=>{
    document.getElementById(id)?.addEventListener("keydown", (e)=>{
      if(e.key === "Enter" && IS_ADMIN){
        e.preventDefault();
        guardar();
      }
    });
  });

  await cargar();
})();