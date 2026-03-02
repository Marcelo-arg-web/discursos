import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, requirePublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";
import { canciones } from "../data/canciones.js";

const $ = (id) => document.getElementById(id);

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

function ensureTopbarStyles(){
  // styles already in css/styles.css; keep for compatibility
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


function parseDateToISO(s){
  s = (s||"").trim();
  if(!s) return "";
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){
    const y=m[1], mo=String(m[2]).padStart(2,"0"), d=String(m[3]).padStart(2,"0");
    return `${y}-${mo}-${d}`;
  }
  // DD/MM/YYYY or D/M/YYYY (también corrige años tipo 0203 -> 2023)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){
    let dd = String(m[1]).padStart(2,"0");
    let mm = String(m[2]).padStart(2,"0");
    let yy = m[3];
    if(yy.length===2) yy = "20"+yy;
    if(yy.length===4 && yy.startsWith("0")) yy = "2"+yy.slice(1); // 0203 -> 2023
    return `${yy}-${mm}-${dd}`;
  }
  return "";
}

function parseTableText(text){
  const rows = (text||"").split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
  const out = [];
  for(const row of rows){
    // soporta tab o muchos espacios
    const cols = row.split(/\t+/).map(c=>c.trim());
    const line = cols.length>=2 ? cols : row.split(/\s{2,}/).map(c=>c.trim());
    if(!line.length) continue;

    const fecha = parseDateToISO(line[0]);
    if(!fecha) continue;

    // Columnas esperadas:
    // 0 Fecha, 1 Orador, 2 Congregación, 3 Bosquejo, 4 Cancion, 5 Titulo, 6 Observaciones, 7 Hospitalidad
    const nombre = (line[1]||"").trim();
    const congregacion = (line[2]||"").trim();
    const bosquejoRaw = (line[3]||"").trim();
    const cancionRaw = (line[4]||"").trim();
    const titulo = (line[5]||"").trim();
    const observaciones = (line[6]||"").trim();
    const hospitalidad = (line[7]||"").trim();

    out.push({
      fecha, nombre, congregacion,
      bosquejo: bosquejoRaw,
      cancion: cancionRaw,
      titulo, observaciones, hospitalidad
    });
  }
  return out;
}

async function importar(){
  if(!isAdmin){ toast("Solo admin/superadmin puede importar.", true); return; }
  const text = $("importText")?.value || "";
  const items = parseTableText(text);
  if(!items.length){ toast("No encontré filas válidas. Pegá la tabla con Fecha al inicio.", true); return; }

  $("importStatus").textContent = `Importando ${items.length}...`;
  let ok=0, fail=0;

  for(const it of items){
    try{
      const bosquejo = normNum(it.bosquejo);
      const cancion = normNum(it.cancion);
      const payload = {
        fecha: it.fecha,
        nombre: it.nombre,
        congregacion: it.congregacion,
        bosquejo: bosquejo===""? "" : bosquejo,
        cancion: cancion===""? "" : cancion,
        titulo: it.titulo || (bosquejo!=="" && bosquejos[bosquejo] ? bosquejos[bosquejo] : ""),
        observaciones: it.observaciones,
        hospitalidad: it.hospitalidad,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db,"visitas", it.fecha), payload, { merge:true });
      ok++;
    }catch(e){
      console.error(e);
      fail++;
    }
  }

  $("importStatus").textContent = `Listo. OK: ${ok} · Fallas: ${fail}`;
  toast(`Importación finalizada. OK: ${ok} · Fallas: ${fail}`, fail>0);
  await load();
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
  let rows = cache.slice();
  const showOld = $("chkAnteriores")?.checked;
  const today = new Date(); today.setHours(0,0,0,0);
  if(!showOld){
    rows = rows.filter(r=>{
      const d = new Date(String(r.fecha||r.id));
      if(isNaN(d.getTime())) return false;
      d.setHours(0,0,0,0);
      return d >= today;
    });
  }
  rows = rows.filter(r=>{
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
  let docs = [];
  try{
    const s = await getDocs(query(collection(db,"visitas"), orderBy("fecha","asc")));
    docs = s.docs.map(d=>({ id:d.id, ...d.data(), fecha: d.data().fecha || d.id }));
  }catch(e){
    console.error(e);
    // Si no hay permisos de lectura (modo público sin reglas), mostramos vacío pero no rompemos.
    toast("No pude leer Visitantes (permisos de Firestore). Si querés que lo vean todos, habilitá lectura de la colección 'visitas' en Rules.", true);
    docs = [];
  }
  cache = docs;
  cache.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  renderTable();
}
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
  await requireActiveUser();

  $("bosquejo")?.addEventListener("blur", applyAuto);
  $("btnNuevo")?.addEventListener("click", clearForm);
  $("btnRefrescar")?.addEventListener("click", load);
  $("filtro")?.addEventListener("input", renderTable);
  $("chkAnteriores")?.addEventListener("change", renderTable);
  $("btnImportar")?.addEventListener("click", importar);
  if($("importBox")) $("importBox").style.display = isAdmin ? "block" : "none";
  $("btnBorrar")?.addEventListener("click", borrar);
  $("form")?.addEventListener("submit", (ev)=>{ ev.preventDefault(); save(); });

  await load();
})();
