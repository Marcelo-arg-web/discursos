import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, requirePublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, query, orderBy,
  documentId, startAt
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

// ------------------------------
// Hospitalidad (rotación + excepciones)
// Base definida por Marcelo: 2026-03-07 = Bracho
// Rotación semanal: Bracho -> Santa Rosa -> Villa Fiad -> Pala Pala -> ...
// Con "skips" (asambleas) que NO avanzan la rotación.
// ------------------------------

const HOSP_GRUPOS = ["Santa Rosa", "Villa Fiad", "Pala Pala", "Bracho"];
const DEFAULT_HOSP_CONFIG = {
  baseDate: "2026-03-07",
  baseGrupo: "Bracho",
  skips: []
};

let hospConfig = { ...DEFAULT_HOSP_CONFIG };
let hospSkips = new Set();
let hospExceptions = new Map(); // fechaISO -> grupo

function parseISODate(iso){
  // Interpretación local a medianoche (suficiente para comparar por semanas)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||""))) return null;
  const d = new Date(`${iso}T00:00:00`);
  if(Number.isNaN(d.getTime())) return null;
  d.setHours(0,0,0,0);
  return d;
}

function addDays(d, n){
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0,0,0,0);
  return x;
}

function isoOf(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x.toISOString().slice(0,10);
}

function nextSaturdayISO(){
  const t = new Date();
  t.setHours(0,0,0,0);
  const day = t.getDay(); // 0 dom ... 6 sab
  const delta = (6 - day + 7) % 7; // sáb=6
  return isoOf(addDays(t, delta));
}

function countSkipsBetweenExclusiveInclusive(fromISO, toISO){
  // Cuenta skips en (from, to] (solo si to >= from)
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if(!a || !b) return 0;
  if(b < a) return 0;
  let c = 0;
  for(const s of hospSkips){
    const ds = parseISODate(s);
    if(!ds) continue;
    if(ds > a && ds <= b) c++;
  }
  return c;
}

function stepsBetween(baseISO, targetISO){
  // pasos de rotación desde base (0 en base). Los skips NO cuentan como paso.
  const base = parseISODate(baseISO);
  const target = parseISODate(targetISO);
  if(!base || !target) return 0;
  if(target.getTime() === base.getTime()) return 0;

  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

  if(target > base){
    const diffWeeks = Math.floor((target - base) / MS_WEEK);
    const skipped = countSkipsBetweenExclusiveInclusive(baseISO, targetISO);
    return diffWeeks - skipped;
  }
  // target < base
  // pasos negativos: - pasos desde target a base
  return -stepsBetween(targetISO, baseISO);
}

function computeHospAuto(targetISO){
  const baseISO = hospConfig.baseDate || DEFAULT_HOSP_CONFIG.baseDate;
  const baseGrupo = hospConfig.baseGrupo || DEFAULT_HOSP_CONFIG.baseGrupo;
  const baseIdx = Math.max(0, HOSP_GRUPOS.indexOf(baseGrupo));
  const step = stepsBetween(baseISO, targetISO);
  const idx = ((baseIdx + step) % HOSP_GRUPOS.length + HOSP_GRUPOS.length) % HOSP_GRUPOS.length;
  return HOSP_GRUPOS[idx];
}

function hospForDate(iso){
  const dISO = normISO(iso);
  if(!dISO) return { value: "", label: "" };
  if(hospSkips.has(dISO)) return { value: "", label: "Asamblea" };
  if(hospExceptions.has(dISO)) return { value: hospExceptions.get(dISO), label: hospExceptions.get(dISO), isException: true };
  const g = computeHospAuto(dISO);
  return { value: g, label: g };
}

async function loadHospitalidadState(){
  // config
  try{
    const ref = doc(db, "hospitalidad_config", "config");
    const snap = await getDoc(ref);
    if(!snap.exists()){
      await setDoc(ref, { ...DEFAULT_HOSP_CONFIG }, { merge: true });
      hospConfig = { ...DEFAULT_HOSP_CONFIG };
    }else{
      const d = snap.data() || {};
      hospConfig = {
        baseDate: d.baseDate || DEFAULT_HOSP_CONFIG.baseDate,
        baseGrupo: d.baseGrupo || DEFAULT_HOSP_CONFIG.baseGrupo,
        skips: Array.isArray(d.skips) ? d.skips.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x))) : []
      };
    }
  }catch(e){
    console.warn("No pude cargar hospitalidad_config", e);
    hospConfig = { ...DEFAULT_HOSP_CONFIG };
  }

  hospSkips = new Set(hospConfig.skips || []);

  // excepciones
  hospExceptions = new Map();
  try{
    const s = await getDocs(collection(db, "hospitalidad_excepciones"));
    s.docs.forEach(d=>{
      const v = d.data() || {};
      const g = String(v.grupo || "").trim();
      if(g) hospExceptions.set(d.id, g);
    });
  }catch(e){
    console.warn("No pude cargar hospitalidad_excepciones", e);
  }
}

function setHospMsg(msg, isErr=false){
  const el = $("hospMsg");
  if(!el) return;
  el.textContent = msg || "";
  el.style.color = isErr ? "#b91c1c" : "";
}

function updateHospBox(){
  const fecha = normISO($("hospFecha")?.value || "");
  const autoEl = $("hospAuto");
  const badge = $("hospBadge");
  const skipEl = $("hospSkip");
  const ovEl = $("hospOverride");
  if(!fecha || !autoEl || !skipEl || !ovEl) return;

  // Estado actual
  const skipped = hospSkips.has(fecha);
  skipEl.checked = skipped;

  const auto = computeHospAuto(fecha);
  const ex = hospExceptions.get(fecha) || "";
  autoEl.textContent = skipped ? "Asamblea" : (ex || auto);

  if(badge){
    badge.style.display = ex ? "inline-flex" : "none";
  }

  ovEl.value = ex;
  setHospMsg("");
}

function previewHospBoxFromInputs(){
  const fecha = normISO($("hospFecha")?.value || "");
  const autoEl = $("hospAuto");
  const badge = $("hospBadge");
  const skipEl = $("hospSkip");
  const ovEl = $("hospOverride");
  if(!fecha || !autoEl || !skipEl || !ovEl) return;

  const skipped = !!skipEl.checked;
  const ov = String(ovEl.value || "").trim();
  const auto = computeHospAuto(fecha);
  autoEl.textContent = skipped ? "Asamblea" : (ov || auto);
  if(badge){
    badge.style.display = ov ? "inline-flex" : "none";
  }
}

function renderTable(){
  const q = ($("filtro").value||"").trim().toLowerCase();
  const rows = cache.filter(r=>{
    if(!q) return true;
    return String(r.nombre||"").toLowerCase().includes(q) || String(r.congregacion||"").toLowerCase().includes(q);
  });

  const tbody = $("tbody");
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin registros.</td></tr>`;
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
      <td>${escapeHtml(r.hospLabel||"")}</td>
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
      ? query(collection(db,"visitas"), orderBy(documentId(),"asc"))
      : query(collection(db,"visitas"), orderBy(documentId(),"asc"), startAt(desde));
    const s = await getDocs(q);
    cache = s.docs.map(d=>({ id:d.id, ...d.data(), fecha: d.data().fecha || d.id }));
  }catch(e){
    console.error(e);
    toast("No pude cargar Visitantes. Revisá permisos de Firestore para 'visitas' o la consola (F12).", true);
    cache = [];
  }

  // normaliza y ordena
  cache = (cache||[])
    // no mostramos eventos (asambleas, conmemoración, etc.) en esta tabla
    .filter(r => String(r.tipo||"visitante").toLowerCase() !== "evento")
    .map(r=>({
      ...r,
      fecha: r.fecha || r.id,
      hospLabel: hospForDate(r.id).label,
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
  // Si no se escribe hospitalidad manual, usamos la rotación automática
  const hospManual = ($("hospitalidad").value||"").trim();
  const hospAuto = hospForDate(fecha).value;
  const hospitalidad = hospManual || hospAuto;
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

async function hospGuardarCambios(){
  const fecha = normISO($("hospFecha")?.value || "");
  if(!fecha) return setHospMsg("Fecha inválida.", true);
  if(!isAdmin) return setHospMsg("Solo admin/superadmin puede cambiar hospitalidad.", true);

  const wantSkip = !!$("hospSkip")?.checked;
  const override = String($("hospOverride")?.value || "").trim();

  try{
    // Actualiza skips
    const ref = doc(db, "hospitalidad_config", "config");
    const nextSkips = new Set(hospSkips);
    if(wantSkip) nextSkips.add(fecha);
    else nextSkips.delete(fecha);
    await setDoc(ref, {
      baseDate: hospConfig.baseDate || DEFAULT_HOSP_CONFIG.baseDate,
      baseGrupo: hospConfig.baseGrupo || DEFAULT_HOSP_CONFIG.baseGrupo,
      skips: Array.from(nextSkips).sort(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Excepción por fecha
    const exRef = doc(db, "hospitalidad_excepciones", fecha);
    if(override){
      await setDoc(exRef, { grupo: override, updatedAt: new Date().toISOString() }, { merge: true });
    }else{
      // si no hay override, borramos la excepción (si existe)
      try{ await deleteDoc(exRef); }catch(_){ }
    }

    await loadHospitalidadState();
    updateHospBox();
    await load();
    setHospMsg("Guardado.");
  }catch(e){
    console.error(e);
    setHospMsg("No pude guardar. Revisá permisos.", true);
  }
}

function hospAplicarAlFormulario(){
  const fecha = normISO($("hospFecha")?.value || "");
  if(!fecha) return setHospMsg("Fecha inválida.", true);
  const h = hospForDate(fecha);
  if(h.label === "Asamblea"){
    $("hospitalidad").value = "";
    setHospMsg("Ese sábado está marcado como asamblea (sin hospitalidad).", false);
    return;
  }
  $("hospitalidad").value = h.value || "";
  setHospMsg("Aplicado al formulario.");
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

  // Hospitalidad state + UI
  await loadHospitalidadState();
  if($("hospFecha")){
    $("hospFecha").value = nextSaturdayISO();
    updateHospBox();
    $("hospFecha").addEventListener("input", updateHospBox);
    $("hospOverride").addEventListener("change", previewHospBoxFromInputs);
    $("hospSkip").addEventListener("change", previewHospBoxFromInputs);
    $("btnHospGuardar").addEventListener("click", hospGuardarCambios);
    $("btnHospAplicar").addEventListener("click", hospAplicarAlFormulario);
    if(!isAdmin){
      // lectura: deja ver, pero no editar
      $("btnHospGuardar").disabled = true;
      $("hospOverride").disabled = true;
      $("hospSkip").disabled = true;
    }
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
