import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, requirePublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc, getDoc, deleteDoc,
  collection, getDocs, addDoc, updateDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);

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
  return r === "admin" || r === "superadmin";
}


function applyReadOnly(rol){
  if(isAdminRole(rol)) return;
  // Oculta formulario de alta/edición si existe
  document.querySelectorAll(".admin-only").forEach(el=>el.style.display="none");
  document.querySelectorAll("input, select, textarea, button").forEach(el=>{
    if(el.id==="btnSalir") return;
    if(el.classList.contains("allow-readonly")) return;
    // permitir imprimir/filtrar
    const keep = ["btnPrint","btnExport","btnImport","btnRecargar","buscar"].includes(el.id);
    if(!keep) el.disabled = true;
  });
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
        <a href="tablero-acomodadores.html" class="${active==='tableros'?'active':''}">Tableros</a>
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
function renderTopbar(active, rol){
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
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", ()=>signOut(auth));
}


async function requireActiveUser(){
  // Acceso público (solo lectura)
  if(hasPublicAccess()){
    renderPublicTopbar("salientes");
    return { user: null, usuario: { rol: "usuario", activo: true, public: true } };
  }
  // Login normal
  renderTopbar("salientes");
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

let cache=[];

function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

function fillFromDoc(id, d){
  $("editId").value = id;
  $("fecha").value = d.fecha || "";
  $("orador").value = d.orador || d.oradorNombre || "";
  $("bosquejo").value = d.bosquejo ?? "";
  $("destino").value = d.destino || d.congregacionDestino || "";
  $("notas").value = d.notas || "";
  $("btnBorrar").disabled = !id;
}

function clearForm(){
  $("editId").value = "";
  $("fecha").value = "";
  $("orador").value = "";
  $("bosquejo").value = "";
  $("destino").value = "";
  $("notas").value = "";
  $("btnBorrar").disabled = true;
  $("fecha").focus();
}

function renderTable(){
  const q = ($("filtro").value||"").trim().toLowerCase();
  const rows = cache.filter(r=>{
    if(!q) return true;
    return String(r.orador||"").toLowerCase().includes(q) || String(r.destino||"").toLowerCase().includes(q);
  });
  const tbody = $("tbody");
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin registros.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r=>`
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.fecha||"")}</td>
      <td>${escapeHtml(r.orador||"")}</td>
      <td>${r.bosquejo ?? ""}</td>
      <td>${escapeHtml(r.destino||"")}</td>
      <td>${escapeHtml(r.notas||"")}</td>
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

async function load(){
  const s = await getDocs(query(collection(db,"salientes"), orderBy("fecha","asc")));
  cache = s.docs.map(d=>({ id:d.id, ...d.data() }));
  cache.sort((a,b)=>String(a.fecha||"").localeCompare(String(b.fecha||"")));
  renderTable();
}

async function save(){
  const fecha = normISO($("fecha").value);
  if(!fecha) return toast("Fecha inválida. Usá formato YYYY-MM-DD.", true);
  const orador = ($("orador").value||"").trim();
  const destino = ($("destino").value||"").trim();
  if(!orador || !destino) return toast("Completá orador y destino.", true);

  const bosquejo = normNum($("bosquejo").value);
  const notas = ($("notas").value||"").trim();

  const payload = {
    fecha,
    orador,
    bosquejo: bosquejo===""? "" : bosquejo,
    destino,
    notas,
    updatedAt: new Date().toISOString(),
  };

  try{
    const id = $("editId").value;
    if(id){
      await updateDoc(doc(db,"salientes",id), payload);
    }else{
      await addDoc(collection(db,"salientes"), payload);
    }
    toast("Guardado OK.");
    clearForm();
    await load();
  }catch(e){
    console.error(e);
    toast("No pude guardar. Revisá permisos.", true);
  }
}

async function borrar(){
  const id = $("editId").value;
  if(!id) return;
  if(!confirm("¿Borrar este registro de saliente?")) return;
  try{
    await deleteDoc(doc(db,"salientes",id));
    toast("Borrado.");
    clearForm();
    await load();
  }catch(e){
    console.error(e);
    toast("No pude borrar.", true);
  }
}

(async function(){
  await requireActiveUser();

  $("btnNuevo")?.addEventListener("click", clearForm);
  $("btnRefrescar")?.addEventListener("click", load);
  $("filtro")?.addEventListener("input", renderTable);
  $("btnBorrar")?.addEventListener("click", borrar);
  $("form")?.addEventListener("submit", (ev)=>{ ev.preventDefault(); save(); });

  // ayuda: autocompletar título en placeholder si existe
  $("bosquejo")?.addEventListener("blur", ()=>{
    const b = normNum($("bosquejo").value);
    const t = b ? bosquejosMap.get(b) : "";
    if(t && !$("notas").value.trim()){
      // no tocamos notas, solo sugerimos en placeholder
      $("notas").placeholder = `Ej: Bosquejo ${b} — ${t}`;
    }
  });

  await load();
})();
