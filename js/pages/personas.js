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

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}


let _deferredInstallPrompt = null;
function initPWAInstall(){
  const btn = document.getElementById("pwaInstallBtn");
  if(!btn) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if(isStandalone){ btn.classList.remove("show"); return; }

  if(!window.__pwa_install_listener){
    window.__pwa_install_listener = true;
    window.addEventListener("beforeinstallprompt", (e)=>{
      e.preventDefault();
      _deferredInstallPrompt = e;
      const b = document.getElementById("pwaInstallBtn");
      if(b) b.classList.add("show");
    });
  }

  btn.addEventListener("click", async ()=>{
    if(!_deferredInstallPrompt){
      alert("En Android: abrí el menú del navegador y tocá “Agregar a pantalla de inicio”.");
      return;
    }
    _deferredInstallPrompt.prompt();
    try{ await _deferredInstallPrompt.userChoice; }catch(_){}
    _deferredInstallPrompt = null;
    btn.classList.remove("show");
  });
}

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;

  const linksAdmin = [
    ["panel.html","panel","Panel"],
    ["asignaciones.html","asignaciones","Asignaciones"],
    ["programa-mensual.html","programa","Programa mensual"],
    ["tablero-acomodadores.html","acomodadores","Acomodadores"],
    ["tablero-multimedia.html","multimedia","Multimedia"],
    ["visitantes.html","visitantes","Visitantes"],
    ["salientes.html","salientes","Salientes"],
    ["personas.html","personas","Personas"],
    ["discursantes.html","discursantes","Discursantes"],
    ["estadisticas.html","estadisticas","Estadísticas"],
    ["doc-presi.html","docpresi","Visitas/Salidas"],
    ["imprimir.html","imprimir","Imprimir"],
    ["importar.html","importar","Importar"],
    ["usuarios.html","usuarios","Usuarios"],
  ];

  const linksUser = [
    ["programa-mensual.html","programa","Asignaciones mensuales"],
    ["visitantes.html","visitantes","Discursantes visitantes"],
    ["salientes.html","salientes","Discursantes salientes"],
  ];

  const links = (isAdmin ? linksAdmin : linksUser)
    .map(([href,key,label]) => `<a href="${href}" class="${active===key?'active':''}">${label}</a>`)
    .join("");

  el.innerHTML = `
    <div class="topbar" id="topbarShell">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>

      <button class="nav-toggle" id="navToggle" aria-label="Menú">☰</button>

      <div class="links" id="navLinks">
        ${links}
      </div>

      <div class="actions">
        <button class="btn pwa-install" id="pwaInstallBtn" type="button">Instalar</button>
        <button class="btn ghost" id="btnLogout" type="button">Salir</button>
      </div>
    </div>
  `;

  const shell = document.getElementById("topbarShell");
  const toggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  if(toggle && shell){
    toggle.addEventListener("click", ()=> shell.classList.toggle("open"));
  }
  if(navLinks && shell){
    navLinks.addEventListener("click", (e)=>{
      const a = e.target?.closest?.("a");
      if(a) shell.classList.remove("open");
    });
  }

  const btnLogout = document.getElementById("btnLogout");
  if(btnLogout){
    btnLogout.addEventListener("click", async ()=>{
      try{ await signOut(auth); }catch(_){}
      window.location.href = "public-login.html";
    });
  }

  initPWAInstall();
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

  const tbody = document.querySelector("#tbl tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  const rows = cache
    .filter(p => (p.nombre || "").toLowerCase().includes(q))
    .filter(p => !filtro || hasRole(p, filtro))
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
        document.getElementById("p_id").value = p.id;
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
  document.getElementById("p_id").value = "";
  document.getElementById("p_nombre").value = "";
  document.getElementById("p_tel").value = "";
  document.getElementById("p_roles").value = "";
}

async function guardar(){
  const nombre = (document.getElementById("p_nombre").value || "").trim();
  const telefono = (document.getElementById("p_tel").value || "").trim();
  const roles = parseRoles(document.getElementById("p_roles").value);
  const id = (document.getElementById("p_id").value || "").trim();

  if(!nombre) return toast("Falta nombre.", true);

  const payload = {
    nombre,
    telefono,
    roles,
    activo: true,
    updatedAt: serverTimestamp()
  };

  try{
    if(id){
      await updateDoc(docRef(db,"personas",id), payload);
      toast("Actualizado.");
    }else{
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db,"personas"), payload);
      toast("Guardado.");
    }
    limpiar();
    await cargar();
  }catch(e){
    console.error(e);
    toast("No pude guardar. Revisá permisos.", true);
  }
}

(async function(){
  const { usuario } = await requireActiveUser("personas");
  const admin = isAdminRole(usuario?.rol);
  IS_ADMIN = admin;

  // hidden id for editing
  if(!document.getElementById("p_id")){
    const hid = document.createElement("input");
    hid.type="hidden"; hid.id="p_id";
    document.body.appendChild(hid);
  }

  if(admin){
    document.getElementById("btnGuardar")?.addEventListener("click", guardar);
    document.getElementById("btnLimpiar")?.addEventListener("click", ()=>{ limpiar(); toast("Formulario limpio."); });
  }else{
    toast("Modo solo lectura: no podés editar Personas.");
    const b1 = document.getElementById("btnGuardar");
    const b2 = document.getElementById("btnLimpiar");
    if(b1) b1.disabled = true;
    if(b2) b2.disabled = true;
    ["p_nombre","p_tel","p_roles"].forEach(id=>{ const el = document.getElementById(id); if(el) el.disabled = true; });
    // Oculta la columna de acciones
    const ths = document.querySelectorAll("#tbl thead th");
    if(ths && ths.length) ths[ths.length-1].style.display = "none";
  }

  document.getElementById("q")?.addEventListener("input", render);
  document.getElementById("filtroRol")?.addEventListener("change", render);

  await cargar();
})();