import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
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
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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
        <a href="tablero-acomodadores.html" class="${active==='tablero'?'active':''}">Tablero</a>
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
  const admin = isAdminRole(rol);
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        ${admin ? `<a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>` : ``}
        ${admin ? `<a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>` : ``}
        ${admin ? `<a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>` : ``}
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
    window.location.href="index.html";
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
      const u = await getUsuario(user.uid);
      if(!u?.activo){
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
async function loadPersonasMap(){
  try{
    const qy = query(collection(db,"personas"), where("activo","==", true));
    const snap = await getDocs(qy);
    personasMap = new Map(snap.docs.map(d=>[d.id, (d.data()?.nombre||"").toString()]));
  }catch(e){
    console.warn("No pude cargar personas para nombres:", e);
    personasMap = new Map();
  }
}
function nombrePorId(id){
  const k = String(id||"").trim();
  if(!k) return "";
  return personasMap.get(k) || "";
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

  const rowsAco = pairs.map(p=>{
    const fmtAud = (a)=>{
      const a1 = (a?.auditorio1||"").trim();
      const a2 = (a?.auditorio2||"").trim();
      if(a1 && a2) return `${a1} / ${a2}`;
      return a1 || a2 || "—";
    };

    const acoJ = {
      plataforma: p.jueves.plataforma || "—",
      entrada: p.jueves.entrada || "—",
      auditorio: fmtAud(p.jueves),
    };
    const acoF = {
      plataforma: p.fin.plataforma || "—",
      entrada: p.fin.entrada || "—",
      auditorio: fmtAud(p.fin),
    };
    return `
      <tr>
        <td class="td-center">${p.semana}</td>
        <td class="td-center">Jue</td>
        <td>${escapeHtml(p.juevesLabel)}</td>
        <td>${escapeHtml(acoJ.plataforma)}</td>
        <td>${escapeHtml(acoJ.entrada)}</td>
        <td>${escapeHtml(acoJ.auditorio)}</td>
      </tr>
      <tr>
        <td class="td-center">${p.semana}</td>
        <td class="td-center">Fin</td>
        <td>${escapeHtml(p.finLabel)}</td>
        <td>${escapeHtml(acoF.plataforma)}</td>
        <td>${escapeHtml(acoF.entrada)}</td>
        <td>${escapeHtml(acoF.auditorio)}</td>
      </tr>
    `;
  }).join("");

  const rowsAV = pairs.map(p=>{
    const avJ = {
      multimedia1: p.juevesAV?.multimedia1 || "—",
      multimedia2: p.juevesAV?.multimedia2 || "—",
    };
    const avF = {
      multimedia1: p.finAV?.multimedia1 || "—",
      multimedia2: p.finAV?.multimedia2 || "—",
    };
    return `
      <tr>
        <td class="td-center">${p.semana}</td>
        <td class="td-center">Jue</td>
        <td>${escapeHtml(p.juevesLabel)}</td>
        <td>${escapeHtml(avJ.multimedia1)}</td>
        <td>${escapeHtml(avJ.multimedia2)}</td>
      </tr>
      <tr>
        <td class="td-center">${p.semana}</td>
        <td class="td-center">Fin</td>
        <td>${escapeHtml(p.finLabel)}</td>
        <td>${escapeHtml(avF.multimedia1)}</td>
        <td>${escapeHtml(avF.multimedia2)}</td>
      </tr>
    `;
  }).join("");

  host.innerHTML = `
    <div class="print-header">
      <div class="h2">Congregación Villa Fiad</div>
      <div class="muted">Tablero mensual · Mes ${escapeHtml(mesISO)}</div>
    </div>

    <div class="board-wrap" style="margin-top:10px;">
      <div class="board-section-title">Acomodadores</div>
      <table class="table board" style="width:100%;">
        <colgroup>
          <col style="width:52px;" />
          <col style="width:60px;" />
          <col style="width:140px;" />
          <col style="width:28%;" />
          <col style="width:28%;" />
          <col style="width:28%;" />
        </colgroup>
        <thead>
          <tr>
            <th class="td-center">Sem</th>
            <th class="td-center">Reu.</th>
            <th>Fecha</th>
            <th>Plataforma</th>
            <th>Entrada</th>
            <th>Auditorio</th>
          </tr>
        </thead>
        <tbody>${rowsAco || `<tr><td colspan="6" class="muted">Sin datos.</td></tr>`}</tbody>
      </table>
    </div>

    <div class="board-wrap" style="margin-top:14px;">
      <div class="board-section-title">Audio y video</div>
      <table class="table board" style="width:100%;">
        <colgroup>
          <col style="width:52px;" />
          <col style="width:60px;" />
          <col style="width:140px;" />
          <col style="width:40%;" />
          <col style="width:40%;" />
        </colgroup>
        <thead>
          <tr>
            <th class="td-center">Sem</th>
            <th class="td-center">Reu.</th>
            <th>Fecha</th>
            <th>Multimedia 1</th>
            <th>Multimedia 2</th>
          </tr>
        </thead>
        <tbody>${rowsAV || `<tr><td colspan="5" class="muted">Sin datos.</td></tr>`}</tbody>
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
  multimedia1: resolveNombre(asig, ["multimedia1Id","multimedia1Nombre","multimedia1"]),
  multimedia2: resolveNombre(asig, ["multimedia2Id","multimedia2Nombre","multimedia2"]),
});
const juevesAsig = juevesAsignDoc || finAsign;
      pairs.push({
        semana: i+1,
        juevesLabel: juevesISO ? formatFecha(juevesISO) : "—",
        finLabel: formatFecha(finISO),
        jueves: mapAco(juevesAsig),
        fin: mapAco(finAsign),
        juevesAV: mapAV(juevesAsig),
        finAV: mapAV(finAsign),
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
  $("btnPrint")?.addEventListener("click", ()=>window.print());
  $("btnCargar")?.addEventListener("click", cargar);
})();