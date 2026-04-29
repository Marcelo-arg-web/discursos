import { auth, db } from "../firebase-config.js?v=20260429b69";
import { hasPublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// Helper: devuelve el primer valor útil entre varias claves (retrocompatibilidad)
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== "") return v;
  }
  return "";
}


function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 4500);
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}
function timeoutValue(ms, value){ return new Promise(resolve => setTimeout(()=>resolve(value), ms)); }
async function getUsuarioSeguro(user){
  try{
    const u = await Promise.race([getUsuario(user.uid), timeoutValue(2500, null)]);
    return u || { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _fallback:true };
  }catch(e){
    console.warn("No pude leer /usuarios; sigo con usuario autenticado para no dejar el documento en blanco", e);
    return { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _readError:true };
  }
}
function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}

function renderPublicTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="public-home.html" class="${active==='public'?'active':''}">Inicio</a>
        <a href="tablero-acomodadores.html" class="${active==='tablero'?'active':''}">Asignaciones Villa Fiad</a>
        <a href="programa-mensual.html" class="${active==='programa'?'active':''}">Programa mensual</a>
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


async function requireActiveUser(active){
  if(hasPublicAccess()){
    renderPublicTopbar(active);
    return { user: null, usuario: { rol: "usuario", activo: true, public: true } };
  }
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){
        window.location.href = "index.html";
        return;
      }
      const u = await getUsuarioSeguro(user);
      if(u && u.activo === false){
        await signOut(auth);
        toast("Tu usuario todavía no está activo.", true);
        window.location.href = "index.html";
        return;
      }
      renderTopbar(active, u.rol);
      resolve({ user, usuario: u });
    });
  });
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

let personasMap = new Map();
let personasActivasMap = new Map();
async function loadPersonasMap(){
  try{
    const snap = await getDocs(collection(db,"personas"));
    personasMap = new Map();
    personasActivasMap = new Map();
    snap.docs.forEach(d=>{
      const data = d.data() || {};
      personasMap.set(d.id, (data?.nombre||"").toString());
      personasActivasMap.set(d.id, data?.activo !== false);
    });
  }catch(e){
    console.warn("No pude cargar personas para nombres:", e);
    personasMap = new Map();
    personasActivasMap = new Map();
  }
}
function nombrePorId(id){
  const k = String(id||"").trim();
  if(!k) return "";
  return personasMap.get(k) || "";
}
function textoAsignado(v){
  const s = String(v||"").trim();
  if(!s) return "";
  return nombrePorId(s) || s;
}
function pairLabel(a,b){
  const left = textoAsignado(a);
  const right = textoAsignado(b);
  if(left && right){
    return left === right ? left : `${left} / ${right}`;
  }
  return left || right || "—";
}

function isoToDate(iso){
  const [y,m,d] = String(iso||"").split("-").map(n=>parseInt(n,10));
  if(!y||!m||!d) return null;
  return new Date(y, m-1, d);
}
function formatFecha(iso){
  const dt = isoToDate(iso);
  if(!dt) return iso;
  return dt.toLocaleDateString("es-AR",{ weekday:"short", day:"numeric", month:"short" });
}
function juevesAnteriorISO(iso){
  const dt = isoToDate(iso);
  if(!dt) return null;
  const dow = dt.getDay(); // 0 dom ... 6 sáb
  const delta = (dow===6)?2:(dow===0?3:null);
  if(delta===null) return null;
  dt.setDate(dt.getDate()-delta);
  const y=dt.getFullYear(), m=String(dt.getMonth()+1).padStart(2,"0"), d=String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

async function loadAsignacionesDoc(iso){
  try{
    const snap = await getDoc(doc(db,"asignaciones", iso));
    if(!snap.exists()) return null;
    const raw = snap.data() || {};
    const a = raw.asignaciones || {};
    // Mezcla retrocompatible: si antes se guardaba al nivel raíz, lo incluimos
    const merged = { ...raw, ...a };
    delete merged.asignaciones;
    return merged;
  }catch(e){
    return null;
  }
}

async function loadDocsInMonth(mesISO){
  const qy = query(
    collection(db,"asignaciones"),
    orderBy(documentId()),
    startAt(mesISO),
    endAt(mesISO + "\uf8ff")
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d=>{
    const raw = d.data() || {};
    const a = raw.asignaciones || {};
    const merged = { ...raw, ...a };
    delete merged.asignaciones;
    return { id: d.id, data: merged };
  });
}

function render(mesISO, pairs){
  const host = $("contenido");

  const rowsAco = pairs.map(p=>`
      <tr>
        <td class="td-center">${p.semana}</td>
        <td>${escapeHtml(p.fechaLabel)}</td>
        <td>${escapeHtml(textoAsignado(p.fin.entrada) || "—")}</td>
        <td>${escapeHtml(textoAsignado(p.fin.auditorio1) || "—")}</td>
      </tr>
    `).join("");

  const rowsAV = pairs.map(p=>`
      <tr>
        <td class="td-center">${p.semana}</td>
        <td>${escapeHtml(p.fechaLabel)}</td>
        <td>${escapeHtml(textoAsignado(p.finAV.audio) || "—")}</td>
        <td>${escapeHtml(textoAsignado(p.finAV.video) || "—")}</td>
      </tr>
    `).join("");

  const rowsMic = pairs.map(p=>`
      <tr>
        <td class="td-center">${p.semana}</td>
        <td>${escapeHtml(p.fechaLabel)}</td>
        <td>${escapeHtml(textoAsignado(p.fin.plataforma) || "—")}</td>
        <td>${escapeHtml(textoAsignado(p.finMic.mic1) || "—")}</td>
        <td>${escapeHtml(textoAsignado(p.finMic.mic2) || "—")}</td>
      </tr>
    `).join("");

  host.innerHTML = `
    <div class="print-header">
      <div class="h2">Congregación Villa Fiad</div>
      <div class="muted">Asignaciones Villa Fiad - ${escapeHtml((()=>{ const [y,m]=String(mesISO||"").split("-").map(n=>parseInt(n,10)); const dt=(y&&m)?new Date(y, m-1, 1):new Date(); return dt.toLocaleDateString("es-AR", {month:"long", year:"numeric"}).replace(/^./, c=>c.toUpperCase()); })())}</div>
    </div>

    <div class="board-wrap" id="aco" style="margin-top:10px;">
      <div class="board-section-title">Acomodadores</div>
      <table class="table board" style="width:100%;">
        <thead>
          <tr><th class="td-center">Sem</th><th>Fecha</th><th>Entrada</th><th>Auditorio 1</th></tr>
          <tr><th></th><th></th><th>Asignado</th><th>Asignado</th></tr>
        </thead>
        <tbody>${rowsAco || `<tr><td colspan="4" class="muted">Sin datos.</td></tr>`}</tbody>
      </table>
    </div>

    <div class="board-wrap" id="av" style="margin-top:14px;">
      <div class="board-section-title">Audio y video</div>
      <table class="table board" style="width:100%;">
        <thead>
          <tr><th class="td-center">Sem</th><th>Fecha</th><th>Audio</th><th>Video</th></tr>
          <tr><th></th><th></th><th>Asignado</th><th>Asignado</th></tr>
        </thead>
        <tbody>${rowsAV || `<tr><td colspan="4" class="muted">Sin datos.</td></tr>`}</tbody>
      </table>
    </div>

    <div class="board-wrap" id="mic" style="margin-top:14px;">
      <div class="board-section-title">Plataforma y microfonistas</div>
      <table class="table board" style="width:100%;">
        <thead>
          <tr><th class="td-center">Sem</th><th>Fecha</th><th>Plataforma</th><th>Mic. 1</th><th>Mic. 2</th></tr>
          <tr><th></th><th></th><th>Asignado</th><th>Asignado</th><th>Asignado</th></tr>
        </thead>
        <tbody>${rowsMic || `<tr><td colspan="5" class="muted">Sin datos.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

async function cargar(){
  const mesISO = String($("mes")?.value||"").trim(); // YYYY-MM
  if(!mesISO) return toast("Elegí un mes.", true);
  toast("Cargando…");
  try{
    await loadPersonasMap();
    const docs = await loadDocsInMonth(mesISO);

    const finDocs = docs
      .map(d=>({ iso:d.id, asign:d.data }))
      .filter(d=>{
        const dt = isoToDate(d.iso);
        if(!dt) return false;
        const dow = dt.getDay();
        return dow===6 || dow===0;
      })
      .sort((a,b)=>a.iso.localeCompare(b.iso));

    const pairs = [];
    for(let i=0;i<finDocs.length;i++){
      const finISO = finDocs[i].iso;
      const juevesISO = juevesAnteriorISO(finISO);

      const finAsign = finDocs[i].asign || {};
      const juevesAsignDoc = juevesISO ? await loadAsignacionesDoc(juevesISO) : null;

      const resolveNombre = (asig, keys)=> {
  for(const k of keys){
    const v = asig?.[k];
    if(v === undefined || v === null) continue;
    const s = String(v).trim();
    if(!s) continue;
    // Si es un ID conocido, lo resolvemos por personasMap
    const byId = nombrePorId(s);
    if(byId) return byId;
    // Si no, asumimos que ya es un nombre
    return s;
  }
  return "";
};

const mapAco = (asig)=>({
  // Plataforma
  plataforma: resolveNombre(asig, ["plataformaId","plataformaNombre","plataforma"]),
  // Entrada (compatible con datos antiguos)
  entrada: resolveNombre(asig, ["acomodadorEntradaId","acomodadorEntradaNombre","acomodadorEntrada"]),
  // Auditorio 1: si no existe, usa el campo antiguo "acomodadorAuditorio"
  auditorio1: resolveNombre(asig, ["acomodadorAuditorio1Id","acomodadorAuditorio1Nombre","acomodadorAuditorio1","acomodadorAuditorioId","acomodadorAuditorioNombre","acomodadorAuditorio"]),
  // Auditorio 2 (opcional)
  auditorio2: resolveNombre(asig, ["acomodadorAuditorio2Id","acomodadorAuditorio2Nombre","acomodadorAuditorio2"]),
});


      const mapAV = (asig)=>({
  audio: resolveNombre(asig, ["multimedia1Id","multimedia1Nombre","multimedia1"]),
  video: resolveNombre(asig, ["multimedia2Id","multimedia2Nombre","multimedia2"]),
});
const mapMic = (asig)=>({
  mic1: resolveNombre(asig, ["microfonista1Id","microfonista1Nombre","microfonista1"]),
  mic2: resolveNombre(asig, ["microfonista2Id","microfonista2Nombre","microfonista2"]),
});
const juevesAsig = juevesAsignDoc || {};
      pairs.push({
        semana: i+1,
        fechaLabel: `${juevesISO ? formatFecha(juevesISO) : "—"} / ${formatFecha(finISO)}`,
        jueves: mapAco(juevesAsig),
        fin: mapAco(finAsign),
        juevesAV: mapAV(juevesAsig),
        finAV: mapAV(finAsign),
        juevesMic: mapMic(juevesAsig),
        finMic: mapMic(finAsign),
      });
    }

    if(pairs.length===0){
      toast("No hay reuniones guardadas para ese mes.", false);
    }
    render(mesISO, pairs);
  }catch(e){
    console.error(e);
    toast("Error cargando. Revisá permisos.", true);
  }
}

(async function(){
  await requireActiveUser("tablero");
  const now = new Date();
  const params = new URLSearchParams(location.search);
  const mesEl = $("mes");
  if(mesEl) mesEl.value = params.get("mes") || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  $("btnPrint")?.addEventListener("click", ()=>window.print());
  $("btnCargar")?.addEventListener("click", cargar);
  await cargar();
})();