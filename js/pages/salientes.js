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

function hoyISO(){ const h=new Date(); h.setHours(0,0,0,0); return h.toISOString().slice(0,10); }

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
        <a href="tablero-acomodadores.html" class="${active==='tableros'?'active':''}">Asignaciones Villa Fiad</a>
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
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Asignaciones Villa Fiad</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="funciones.html" class="${active==='personas'?'active':''}">Funciones</a>
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

const LS_KEY_LOCALES = "vf_conferenciantesLocales_local";
let oradoresLocalesElegibles = [];
let oradoresLocalesCargados = false;

function normalKey(s){
  return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const LOCALES_FIJOS_VILLA_FIAD = [
  { nombre: "Marcelo Palavecino", bosquejos: [181, 28, 88, 180, 51] },
  { nombre: "Sergio Saldaña", bosquejos: [55, 77] },
  { nombre: "Luis Navarro", bosquejos: [87, 146, 10, 165, 68, 7] },
  { nombre: "Leonardo Araya", bosquejos: [135, 100, 57, 181, 189] },
  { nombre: "Marcelo Rodríguez", bosquejos: [15] }
];

function canonicalLocalName(nombre){
  const k = normalKey(nombre);
  if(!k) return "";
  if(k === "marcelo rodriguez" || k === "marcelo rodrigez") return "Marcelo Rodríguez";
  if(k === "marcelo palevecino") return "Marcelo Palavecino";
  if(k === "lis navarro") return "Luis Navarro";
  if(k === "lionardo araya") return "Leonardo Araya";
  const found = LOCALES_FIJOS_VILLA_FIAD.find(l => normalKey(l.nombre) === k);
  return found ? found.nombre : String(nombre||"").trim();
}

function esLocalFijoVillaFiad(nombre){
  const c = canonicalLocalName(nombre);
  return LOCALES_FIJOS_VILLA_FIAD.some(l => normalKey(l.nombre) === normalKey(c));
}

function localesFijosConHistorial(){
  const map = new Map();
  LOCALES_FIJOS_VILLA_FIAD.forEach(l => {
    map.set(normalKey(l.nombre), { ...l, id: normalKey(l.nombre), activo: true, fijoVillaFiad: true, bosquejos: parseBosquejosLista(l.bosquejos) });
  });
  const fuentes = []
    .concat(Array.isArray(INITIAL_SALIENTES) ? INITIAL_SALIENTES : [])
    .concat(Array.isArray(cache) ? cache : []);
  fuentes.forEach(r => {
    const nombre = canonicalLocalName(r?.orador || r?.oradorNombre || "");
    if(!esLocalFijoVillaFiad(nombre)) return;
    const key = normalKey(nombre);
    const item = map.get(key) || { nombre, id:key, activo:true, fijoVillaFiad:true, bosquejos: [] };
    const b = normNum(r?.bosquejo);
    if(b !== "" && !item.bosquejos.map(String).includes(String(b))) item.bosquejos.push(String(b));
    map.set(key, item);
  });
  return Array.from(map.values());
}

function parseBosquejosLista(v){
  if(Array.isArray(v)) return v.map(x=>String(x||"").trim()).filter(Boolean);
  const raw = String(v||"").trim();
  if(!raw) return [];
  return raw.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
}

function tieneBosquejosLocales(l){
  return parseBosquejosLista(l?.bosquejos).length > 0;
}

function readLocalesLocal(){
  try{
    const raw = localStorage.getItem(LS_KEY_LOCALES);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(_){ return []; }
}

function unionBosquejos(...listas){
  const out = [];
  listas.forEach(lista => {
    parseBosquejosLista(lista).forEach(b => {
      const v = String(b || "").trim();
      if(v && !out.map(String).includes(v)) out.push(v);
    });
  });
  return out.sort((a,b)=>Number(a)-Number(b));
}

function mergeLocalesPorNombre(base, extra){
  const out = (Array.isArray(base) ? base : []).map(raw => ({
    ...raw,
    nombre: canonicalLocalName(raw?.nombre),
    bosquejos: parseBosquejosLista(raw?.bosquejos)
  }));
  (extra || []).forEach((raw)=>{
    const x = { ...raw, nombre: canonicalLocalName(raw?.nombre), bosquejos: parseBosquejosLista(raw?.bosquejos) };
    const key = normalKey(x?.nombre);
    if(!key) return;
    const i = out.findIndex(y => normalKey(canonicalLocalName(y?.nombre)) === key || (x.id && y.id === x.id));
    const fijo = LOCALES_FIJOS_VILLA_FIAD.find(l => normalKey(l.nombre) === key);
    if(i >= 0){
      const anterior = out[i];
      out[i] = {
        ...anterior,
        ...x,
        nombre: canonicalLocalName(anterior.nombre || x.nombre),
        activo: fijo ? true : (x.activo ?? anterior.activo),
        fijoVillaFiad: Boolean(anterior.fijoVillaFiad || x.fijoVillaFiad || fijo),
        bosquejos: unionBosquejos(anterior.bosquejos, x.bosquejos, fijo?.bosquejos || [])
      };
    }
    else out.push({
      ...x,
      activo: fijo ? true : x.activo,
      fijoVillaFiad: Boolean(x.fijoVillaFiad || fijo),
      bosquejos: unionBosquejos(x.bosquejos, fijo?.bosquejos || [])
    });
  });
  return out;
}

async function leerLocalesDesdePersonas(){
  const snap = await getDocs(query(collection(db, "personas"), orderBy("nombre", "asc")));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }))
    .filter(p => p && p.activo !== false)
    .filter(p => Array.isArray(p.roles) && p.roles.map(r=>String(r).toLowerCase()).includes("discursante"))
    .map(p => ({
      id: p.id,
      nombre: p.nombre || "",
      telefono: p.telefono || "",
      bosquejos: Array.isArray(p.bosquejos) ? p.bosquejos : [],
      activo: p.activo !== false,
      origenPersonas: true
    }));
}

function actualizarOpcionesOrador(){
  const sel = $("orador");
  if(!sel) return;
  const prev = sel.value || "";
  const rows = (oradoresLocalesElegibles || [])
    .filter(l => l && l.activo !== false && String(l.nombre||"").trim() && tieneBosquejosLocales(l))
    .map(l => ({ ...l, nombre: canonicalLocalName(l.nombre) }))
    .sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"", "es"));

  sel.innerHTML = `<option value="">Elegir conferenciante local…</option>` + rows.map(l=>{
    const nombre = escapeHtml(l.nombre || "");
    const bosq = escapeHtml(parseBosquejosLista(l.bosquejos).join(", "));
    return `<option value="${nombre}" data-bosquejos="${bosq}">${nombre}${bosq ? ` — Bosquejos: ${bosq}` : ""}</option>`;
  }).join("");

  if(prev && Array.from(sel.options).some(o => normalKey(o.value) === normalKey(prev))){
    const opt = Array.from(sel.options).find(o => normalKey(o.value) === normalKey(prev));
    sel.value = opt?.value || "";
  }
  sel.disabled = !rows.length;
}

function autocompletarBosquejoDesdeOrador(){
  const sel = $("orador");
  const bInput = $("bosquejo");
  if(!sel || !bInput) return;
  if(String(bInput.value||"").trim()) return;
  const bosq = String(sel.selectedOptions?.[0]?.dataset?.bosquejos || "").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  if(bosq.length === 1){
    bInput.value = bosq[0];
    updateBosquejoTitulo();
  }
}

function esOradorLocalElegible(nombre){
  const canon = canonicalLocalName(nombre);
  const key = normalKey(canon);
  if(!key) return false;
  const fijo = LOCALES_FIJOS_VILLA_FIAD.find(l => normalKey(l.nombre) === key);
  if(fijo && parseBosquejosLista(fijo.bosquejos).length) return true;
  return (oradoresLocalesElegibles || []).some(l =>
    l && l.activo !== false && tieneBosquejosLocales(l) && normalKey(canonicalLocalName(l.nombre)) === key
  );
}

async function cargarOradoresLocalesElegibles(){
  try{
    const snap = await getDocs(query(collection(db, "conferenciantesLocales"), orderBy("nombre", "asc")));
    const dedicados = snap.docs.map(d => ({ id:d.id, ...d.data(), origenLocales:true }));
    let desdePersonas = [];
    try{ desdePersonas = await leerLocalesDesdePersonas(); }catch(e){ console.warn("No pude sumar locales desde Funciones.", e); }
    const desdeLocal = readLocalesLocal();
    const fijos = localesFijosConHistorial();
    oradoresLocalesElegibles = mergeLocalesPorNombre(mergeLocalesPorNombre(mergeLocalesPorNombre(fijos, dedicados), desdePersonas), desdeLocal)
      .filter(l => l && l.activo !== false && String(l.nombre||"").trim() && tieneBosquejosLocales(l));
    oradoresLocalesCargados = true;
    actualizarOpcionesOrador();
  }catch(e){
    console.warn("No pude leer conferenciantesLocales; uso respaldo local si existe.", e);
    oradoresLocalesElegibles = mergeLocalesPorNombre(localesFijosConHistorial(), readLocalesLocal())
      .filter(l => l && l.activo !== false && String(l.nombre||"").trim() && tieneBosquejosLocales(l));
    oradoresLocalesCargados = true;
    actualizarOpcionesOrador();
    if(!oradoresLocalesElegibles.length){
      toast("No pude cargar conferenciantes locales desde Firestore; usé la lista local de Villa Fiad si está disponible.", false);
    }
  }
}

function updateBosquejoTitulo(){
  const el = document.getElementById('bosquejoTitulo');
  if(!el) return;
  const b = normNum(document.getElementById("bosquejo")?.value);
  const t = b ? (bosquejosMap.get(Number(b)) || "") : "";
  el.textContent = t ? `Bosquejo ${b}: ${t}` : "—";
}

let cache=[];
const SALIENTES_2026_CONFIRMADOS = [
  { fecha:"2026-04-26", orador:"Leonardo Araya", bosquejo:100, destino:"Este Tucumán", notas:"" },
  { fecha:"2026-05-03", orador:"Luis Navarro", bosquejo:87, destino:"Alderetes", notas:"" },
  { fecha:"2026-05-10", orador:"Marcelo Palavecino", bosquejo:28, destino:"Alderetes", notas:"" },
  { fecha:"2026-05-17", orador:"Leonardo Araya", bosquejo:57, destino:"Alderetes", notas:"" },
  { fecha:"2026-05-24", orador:"Marcelo Rodríguez", bosquejo:15, destino:"Alderetes", notas:"" },
  { fecha:"2026-05-31", orador:"Leonardo Araya", bosquejo:181, destino:"Los Ralos", notas:"" },
  { fecha:"2026-06-06", orador:"Luis Navarro", bosquejo:10, destino:"Banda del Río Salí", notas:"" },
  { fecha:"2026-06-13", orador:"Marcelo Rodríguez", bosquejo:15, destino:"Banda del Río Salí", notas:"" },
  { fecha:"2026-06-20", orador:"Sergio Saldaña", bosquejo:55, destino:"Banda del Río Salí", notas:"" },
  { fecha:"2026-06-27", orador:"Leonardo Araya", bosquejo:189, destino:"Banda del Río Salí", notas:"" },
  { fecha:"2026-07-18", orador:"Leonardo Araya", bosquejo:181, destino:"Colombres", notas:"" },
  { fecha:"2026-07-25", orador:"Sergio Saldaña", bosquejo:77, destino:"Colombres", notas:"" },
  { fecha:"2026-08-01", orador:"Marcelo Palavecino", bosquejo:88, destino:"Colombres", notas:"" },
  { fecha:"2026-08-08", orador:"Luis Navarro", bosquejo:165, destino:"Colombres", notas:"" },
  { fecha:"2026-09-05", orador:"Leonardo Araya", bosquejo:100, destino:"Lules español", notas:"" },
  { fecha:"2026-09-12", orador:"Sergio Saldaña", bosquejo:77, destino:"Lules español", notas:"" },
  { fecha:"2026-09-19", orador:"Marcelo Palavecino", bosquejo:51, destino:"Lules español", notas:"" },
  { fecha:"2026-09-26", orador:"Luis Navarro", bosquejo:68, destino:"Lules español", notas:"" },
  { fecha:"2026-10-04", orador:"Sergio Saldaña", bosquejo:55, destino:"Los Ralos", notas:"" },
  { fecha:"2026-10-11", orador:"Marcelo Palavecino", bosquejo:28, destino:"Los Ralos", notas:"" },
  { fecha:"2026-10-18", orador:"Luis Navarro", bosquejo:68, destino:"Los Ralos", notas:"" },
  { fecha:"2026-10-25", orador:"Marcelo Rodríguez", bosquejo:15, destino:"Los Ralos", notas:"" },
  { fecha:"2026-11-07", orador:"Leonardo Araya", bosquejo:100, destino:"Echeverria", notas:"" },
  { fecha:"2026-11-14", orador:"Luis Navarro", bosquejo:146, destino:"Echeverria", notas:"" },
  { fecha:"2026-11-21", orador:"Marcelo Rodríguez", bosquejo:15, destino:"Echeverria", notas:"" }
];

const INITIAL_SALIENTES = [
  { fecha:"2025-11-15", orador:"Marcelo Palavecino", bosquejo:181, destino:"Ranchillos", notas:"" },
  { fecha:"2025-12-13", orador:"Marcelo Palavecino", bosquejo:28, destino:"Oeste, Tucumán", notas:"" },
  { fecha:"2025-12-20", orador:"Sergio Saldaña", bosquejo:55, destino:"Oeste, Tucumán", notas:"" },
  { fecha:"2026-02-07", orador:"Sergio Saldaña", bosquejo:55, destino:"El Chañar", notas:"" },
  { fecha:"2026-02-14", orador:"Marcelo Palavecino", bosquejo:28, destino:"El Chañar", notas:"" },
  { fecha:"2026-02-21", orador:"Leonardo Araya", bosquejo:135, destino:"El Chañar", notas:"" },
  { fecha:"2026-03-01", orador:"Luis Navarro", bosquejo:146, destino:"Este, Tucumán", notas:"" },
  { fecha:"2026-03-21", orador:"Marcelo Palavecino", bosquejo:88, destino:"Echeverria", notas:"" },
  { fecha:"2026-04-05", orador:"Marcelo Palavecino", bosquejo:180, destino:"Este, Tucumán", notas:"" },
  { fecha:"2026-04-19", orador:"Leonardo Araya", bosquejo:100, destino:"Este, Tucumán", notas:"" },
  ...SALIENTES_2026_CONFIRMADOS
];


function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

const tipoLabel = (t)=>({normal:"Salida",asamblea:"Asamblea / No se sale",especial:"Discurso especial",otro:"Otro"}[t]||t||"");


function fillFromDoc(id, d){
  $("editId").value = id;
  $("fecha").value = toDMY(d.fecha || "");
  $("orador").value = canonicalLocalName(d.orador || d.oradorNombre || "");
  $("tipo") && ($("tipo").value = d.tipo || "normal");
  $("detalle") && ($("detalle").value = d.detalle || "");
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
  if($("tipo")) $("tipo").value = "normal";
  if($("detalle")) $("detalle").value = "";
  $("bosquejo").value = "";
  updateBosquejoTitulo();
  $("destino").value = "";
  $("notas").value = "";
  $("btnBorrar").disabled = true;
  $("fecha").focus();
}

function renderTable(){
  const q = ($("filtro").value||"").trim().toLowerCase();
  const ocultosNoLocales = cache.filter(r => String(r.orador||"").trim() && !esOradorLocalElegible(r.orador)).length;
  const rows = cache
    .filter(r => esOradorLocalElegible(r.orador))
    .filter(r=>{
      if(!q) return true;
      return String(r.orador||"").toLowerCase().includes(q) || String(r.destino||"").toLowerCase().includes(q) || String(r.detalle||"").toLowerCase().includes(q) || String(r.notas||"").toLowerCase().includes(q);
    });

  // Mostrar por defecto desde la próxima fecha futura más cercana (si no hay filtro).
  if(!q){
    const hoy = hoyISO();
    const i0 = rows.findIndex(r => String(r.fecha||"") >= hoy);
    if(i0 >= 0) rows.splice(0, i0);
  }

  const tbody = $("tbody");
  if(!rows.length){
    const msg = oradoresLocalesCargados && !oradoresLocalesElegibles.length
      ? "No hay conferenciantes locales de Villa Fiad con bosquejos/arreglos cargados."
      : (ocultosNoLocales ? `Sin registros visibles. Se ocultaron ${ocultosNoLocales} registro(s) que no corresponden a conferenciantes locales con bosquejos.` : "Sin registros.");
    tbody.innerHTML = `<tr><td colspan="5" class="muted">${escapeHtml(msg)}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r=>`
    <tr data-id="${r.id}">
      <td>${escapeHtml(toDMY(r.fecha||""))}</td>
      <td>${escapeHtml(canonicalLocalName(r.orador||""))}</td>
      <td>${(r.bosquejo!=="" && r.bosquejo!=null) ? (r.bosquejo + " — " + escapeHtml(bosquejosMap.get(Number(r.bosquejo))||"")) : ( (r.tipo && r.tipo!=="normal") ? (escapeHtml(tipoLabel(r.tipo)) + (r.detalle?(" — "+escapeHtml(r.detalle)):"")) : (r.detalle?escapeHtml(r.detalle):"") )}</td>
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

function mismoDestino(a,b){
  return normalKey(a).replace(/,/g, "") === normalKey(b).replace(/,/g, "");
}

function salidaCoincideExistente(existente, objetivo){
  const mismaFecha = String(existente?.fecha || "") === String(objetivo?.fecha || "");
  if(!mismaFecha) return false;
  // Para salientes confirmados de 2026 usamos la fecha como clave práctica:
  // corrige destinos/nombres incompletos o mal escritos sin duplicar.
  return true;
}

function salidaNecesitaActualizacion(existente, objetivo){
  if(canonicalLocalName(existente?.orador || "") !== canonicalLocalName(objetivo.orador || "")) return true;
  if(String(normNum(existente?.bosquejo)) !== String(normNum(objetivo.bosquejo))) return true;
  if(!mismoDestino(existente?.destino || "", objetivo.destino || "")) return true;
  return false;
}

async function revisarYCargarSalientes2026(usuario, mostrarMensaje=false){
  if(!isAdminRole(usuario?.rol)) return { agregados:0, corregidos:0 };
  let agregados = 0;
  let corregidos = 0;
  try{
    const s = await getDocs(query(collection(db,"salientes"), orderBy("fecha","asc")));
    const existentes = s.docs.map(d=>({ id:d.id, ...d.data() }));
    for(const objetivoBase of SALIENTES_2026_CONFIRMADOS){
      const objetivo = {
        ...objetivoBase,
        orador: canonicalLocalName(objetivoBase.orador),
        tipo: "normal",
        detalle: "",
        bosquejo: normNum(objetivoBase.bosquejo),
        updatedAt: new Date().toISOString()
      };
      const encontrado = existentes.find(r => salidaCoincideExistente(r, objetivo));
      if(encontrado){
        if(salidaNecesitaActualizacion(encontrado, objetivo)){
          await updateDoc(doc(db,"salientes", encontrado.id), {
            fecha: objetivo.fecha,
            orador: objetivo.orador,
            tipo: "normal",
            detalle: "",
            bosquejo: objetivo.bosquejo,
            destino: objetivo.destino,
            updatedAt: objetivo.updatedAt
          });
          Object.assign(encontrado, objetivo);
          corregidos++;
        }
      }else{
        await addDoc(collection(db,"salientes"), { ...objetivo, notas: objetivo.notas || "" });
        existentes.push({ ...objetivo });
        agregados++;
      }
    }
    if(agregados || corregidos || mostrarMensaje){
      toast(`Salientes 2026 revisados. Agregados: ${agregados}. Corregidos: ${corregidos}.`);
    }
    return { agregados, corregidos };
  }catch(e){
    console.error(e);
    if(mostrarMensaje) toast("No pude revisar/cargar los salientes 2026. Revisá permisos.", true);
    return { agregados:0, corregidos:0, error:e };
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
  const orador = canonicalLocalName(($("orador").value||"").trim());
  const destino = ($("destino").value||"").trim();
  if(!orador) return toast("Elegí un conferenciante local.", true);
  if(!esOradorLocalElegible(orador)) return toast("Ese orador no está habilitado como conferenciante local con bosquejos cargados.", true);

  const tipo = ($("tipo")?.value||"normal").trim();
  const detalle = ($("detalle")?.value||"").trim();
  const bosquejo = normNum($("bosquejo").value);
  const notas = ($("notas").value||"").trim();

  const payload = {
    fecha,
    orador,
    tipo,
    detalle,
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
  await cargarOradoresLocalesElegibles();
  await seedIfEmpty(usuario);
  await revisarYCargarSalientes2026(usuario, false);

  $("btnNuevo")?.addEventListener("click", clearForm);
  $("btnRefrescar")?.addEventListener("click", load);
  $("btnRevisarSalientes2026")?.addEventListener("click", async ()=>{
    await revisarYCargarSalientes2026(usuario, true);
    await load();
  });
  $("filtro")?.addEventListener("input", renderTable);
  $("btnBorrar")?.addEventListener("click", borrar);
  $("form")?.addEventListener("submit", (ev)=>{ ev.preventDefault(); save(); });

  $("bosquejo")?.addEventListener("input", updateBosquejoTitulo);
  $("orador")?.addEventListener("change", autocompletarBosquejoDesdeOrador);
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
