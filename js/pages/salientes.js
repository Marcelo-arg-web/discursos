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

function pad2(n){ return String(n).padStart(2,"0"); }
function toISOFromInput(s){
  const v=(s||"").trim();
  if(!v) return "";
  // acepta YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // acepta DD/MM/YYYY
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const dd=pad2(m[1]); const mm=pad2(m[2]); const yyyy=m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}
function toDMY(iso){
  const v=(iso||"").trim();
  const m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function normNum(v){
  const n = String(v||"").trim();
  if(!n) return "";
  const x = Number(n);
  return Number.isFinite(x) ? x : "";
}
const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v])=>[Number(k), String(v)]));

function updateBosquejoTitulo(){
  const el = document.getElementById('bosquejoTitulo');
  if(!el) return;
  const b = normNum(document.getElementById("bosquejo")?.value);
  const t = b ? (bosquejosMap.get(Number(b)) || "") : "";
  el.textContent = t ? `Bosquejo ${b}: ${t}` : "—";
}

let cache=[];
const INITIAL_SALIENTES = [
  { fecha:"2025-11-15", orador:"Marcelo Palavecino", bosquejo:181, destino:"Ranchillos", notas:"" },
  { fecha:"2025-12-06", orador:"Daniel Galarzo", bosquejo:15, destino:"Oeste, Tucum\u00e1n", notas:"" },
  { fecha:"2025-12-13", orador:"Marcelo Palavecino", bosquejo:28, destino:"Oeste, Tucum\u00e1n", notas:"" },
  { fecha:"2025-12-20", orador:"Sergio Salda\u00f1a", bosquejo:55, destino:"Oeste, Tucum\u00e1n", notas:"" },
  { fecha:"2026-02-07", orador:"Sergio Salda\u00f1a", bosquejo:55, destino:"El Cha\u00f1ar", notas:"" },
  { fecha:"2026-02-14", orador:"Marcelo Palavecino", bosquejo:28, destino:"El Cha\u00f1ar", notas:"" },
  { fecha:"2026-02-21", orador:"Leonardo Araya", bosquejo:135, destino:"El Cha\u00f1ar", notas:"" },
  { fecha:"2026-02-28", orador:"Juan Calos Fresia", bosquejo:183, destino:"El Cha\u00f1ar", notas:"" },
  { fecha:"2026-03-01", orador:"Luis Navarro", bosquejo:146, destino:"Este, Tucum\u00e1n", notas:"" },
  { fecha:"2026-03-15", orador:"Juan Calos Fresia", bosquejo:103, destino:"Este, Tucum\u00e1n", notas:"" },
  { fecha:"2026-03-21", orador:"Marcelo Palavecino", bosquejo:88, destino:"Echeverria", notas:"" },
  { fecha:"2026-03-28", orador:"", bosquejo:"", destino:"", notas:"" },
  { fecha:"2026-04-05", orador:"Marcelo Palavecino", bosquejo:180, destino:"Este, Tucum\u00e1n", notas:"" },
  { fecha:"2026-04-12", orador:"", bosquejo:"", destino:"", notas:"" },
  { fecha:"2026-04-19", orador:"Leonardo Araya", bosquejo:100, destino:"Este, Tucum\u00e1n", notas:"" },
  { fecha:"2026-04-25", orador:"", bosquejo:"", destino:"", notas:"" },
  { fecha:"2026-05-02", orador:"", bosquejo:"", destino:"", notas:"" },
  { fecha:"2026-05-09", orador:"", bosquejo:"", destino:"", notas:"" },
  { fecha:"2026-05-16", orador:"", bosquejo:"", destino:"", notas:"" },
  { fecha:"2026-05-23", orador:"", bosquejo:"", destino:"", notas:"" },
  { fecha:"2026-05-31", orador:"Leonardo Araya", bosquejo:181, destino:"Los Ralos", notas:"" },
  { fecha:"2026-06-06", orador:"Luis Navarro", bosquejo:10, destino:"Banda del R\u00edo Sal\u00ed", notas:"" },
  { fecha:"2026-06-13", orador:"Marcelo Palavecino", bosquejo:"", destino:"Banda del R\u00edo Sal\u00ed", notas:"" },
  { fecha:"2026-06-20", orador:"Sergio Salda\u00f1a", bosquejo:55, destino:"Banda del R\u00edo Sal\u00ed", notas:"" },
  { fecha:"2026-06-27", orador:"Leonardo Araya", bosquejo:189, destino:"Banda del R\u00edo Sal\u00ed", notas:"" },
  { fecha:"2026-07-18", orador:"Leonardo Araya", bosquejo:181, destino:"Colombres", notas:"" },
  { fecha:"2026-07-25", orador:"Sergio Salda\u00f1a", bosquejo:77, destino:"Colombres", notas:"" },
  { fecha:"2026-08-01", orador:"Marcelo Palavecino", bosquejo:88, destino:"Colombres", notas:"" },
  { fecha:"2026-08-08", orador:"Luis Navarro", bosquejo:165, destino:"Colombres", notas:"" },
  { fecha:"2026-09-05", orador:"Leonardo Araya", bosquejo:100, destino:"Lules espa\u00f1ol", notas:"" },
  { fecha:"2026-09-12", orador:"Sergio Salda\u00f1a", bosquejo:77, destino:"Lules espa\u00f1ol", notas:"" },
  { fecha:"2026-09-19", orador:"Marcelo Palavecino", bosquejo:51, destino:"Lules espa\u00f1ol", notas:"" },
  { fecha:"2026-09-26", orador:"Luis Navarro", bosquejo:68, destino:"Lules espa\u00f1ol", notas:"" },
  { fecha:"2026-10-04", orador:"Sergio Salda\u00f1a", bosquejo:55, destino:"Los Ralos", notas:"" },
  { fecha:"2026-10-11", orador:"Marcelo Palavecino", bosquejo:28, destino:"Los Ralos", notas:"" },
  { fecha:"2026-10-18", orador:"Luis Navarro", bosquejo:7, destino:"Los Ralos", notas:"" },
  { fecha:"2026-10-25", orador:"Marcelo Rodrigez", bosquejo:15, destino:"Los Ralos", notas:"" }
];


function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

function fillFromDoc(id, d){
  $("editId").value = id;
  $("fecha").value = toDMY(d.fecha || "");
  $("orador").value = d.orador || d.oradorNombre || "";
  $("bosquejo").value = d.bosquejo ?? "";
  updateBosquejoTitulo();
  $("destino").value = d.destino || d.congregacionDestino || "";
  $("notas").value = d.notas || "";
  $("btnBorrar").disabled = !id;
}

function clearForm(){
  $("editId").value = "";
  $("fecha").value = "";
  $("orador").value = "";
  $("bosquejo").value = "";
  updateBosquejoTitulo();
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
      <td>${escapeHtml(toDMY(r.fecha||""))}</td>
      <td>${escapeHtml(r.orador||"")}</td>
      <td>${(r.bosquejo!=="" && r.bosquejo!=null) ? (r.bosquejo + " — " + escapeHtml(bosquejosMap.get(Number(r.bosquejo))||"")) : ""}</td>
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

async function seedIfEmpty(usuario){
  try{
    const key="salientesSeeded_v1";
    if(localStorage.getItem(key)==="1") return;
    if(!isAdminRole(usuario?.rol)) return;
    const s0 = await getDocs(collection(db,"salientes"));
    if(!s0.empty) { localStorage.setItem(key,"1"); return; }
    for(const r of INITIAL_SALIENTES){
      await addDoc(collection(db,"salientes"), { ...r, updatedAt:new Date().toISOString() });
    }
    localStorage.setItem(key,"1");
    toast("Cargué la lista inicial de salientes.");
  }catch(e){
    console.error(e);
    toast("No pude cargar la lista inicial. Revisá permisos.", true);
  }
}

async function load(){
  const s = await getDocs(query(collection(db,"salientes"), orderBy("fecha","asc")));
  cache = s.docs.map(d=>({ id:d.id, ...d.data() }));
  cache.sort((a,b)=>String(a.fecha||"").localeCompare(String(b.fecha||"")));
  renderTable();
}

async function save(){
  const fecha = toISOFromInput($("fecha").value);
  if(!fecha) return toast("Fecha inválida. Usá DD/MM/AAAA o YYYY-MM-DD.", true);
  const orador = ($("orador").value||"").trim();
  const destino = ($("destino").value||"").trim();

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
  const { usuario } = await requireActiveUser();
  await seedIfEmpty(usuario);

  $("btnNuevo")?.addEventListener("click", clearForm);
  $("btnRefrescar")?.addEventListener("click", load);
  $("filtro")?.addEventListener("input", renderTable);
  $("btnBorrar")?.addEventListener("click", borrar);
  $("form")?.addEventListener("submit", (ev)=>{ ev.preventDefault(); save(); });

  $("bosquejo")?.addEventListener("input", updateBosquejoTitulo);
  updateBosquejoTitulo();

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
