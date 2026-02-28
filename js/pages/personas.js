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

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Doc Presidente</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
    window.location.href = "index.html";
  });
}

function ensureTopbarStyles(){
  if(document.getElementById("topbarStyle")) return;
  const s = document.createElement("style");
  s.id="topbarStyle";
  s.textContent = `
    .topbar{display:flex;justify-content:space-between;align-items:center;gap:14px;
      background:#1a4fa3;color:#fff;padding:10px 14px;border-radius:14px;margin:14px auto;max-width:1100px;}
    .topbar .brand{font-weight:800}
    .topbar .links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .topbar a{color:#fff;text-decoration:none;font-weight:700;font-size:13px;opacity:.92}
    .topbar a.active{text-decoration:underline;opacity:1}
    .topbar .btn.danger{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}
  `;
  document.head.appendChild(s);
}

async function requireActiveUser(activePage){
  ensureTopbarStyles();
  renderTopbar(activePage);

  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      resolve({ user, usuario:u });
    });
  });
}import {
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
      <td class="no-print">
        <button class="btn" data-act="edit" data-id="${p.id}">Editar</button>
        <button class="btn" data-act="toggle" data-id="${p.id}">${p.activo===false ? "Activar" : "Desactivar"}</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

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
  await requireActiveUser("personas");

  // hidden id for editing
  if(!document.getElementById("p_id")){
    const hid = document.createElement("input");
    hid.type="hidden"; hid.id="p_id";
    document.body.appendChild(hid);
  }

  document.getElementById("btnGuardar")?.addEventListener("click", guardar);
  document.getElementById("btnLimpiar")?.addEventListener("click", ()=>{ limpiar(); toast("Formulario limpio."); });

  document.getElementById("q")?.addEventListener("input", render);
  document.getElementById("filtroRol")?.addEventListener("change", render);

  await cargar();
})();