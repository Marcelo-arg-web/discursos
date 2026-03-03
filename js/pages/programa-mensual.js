import { auth, db } from "../firebase-config.js";
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

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 4500);
}

function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

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
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Acomodadores</a>
        <a href="tablero-multimedia.html" class="${active==='multimedia'?'active':''}">Multimedia</a>
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


async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

async function requireActiveUser(){
  ensureTopbarStyles();
  renderTopbar("programa");
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href = "index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }
      resolve({ user, usuario:u });
    });
  });
}

function isoToDate(iso){
  const [y,m,d] = String(iso||"").split("-").map(n=>parseInt(n,10));
  if(!y||!m||!d) return null;
  return new Date(y, m-1, d);
}

function formatFechaLarga(iso){
  const dt = isoToDate(iso);
  if(!dt) return iso;
  // Ej: "sábado 7 febrero"
  const parts = dt.toLocaleDateString("es-AR", { weekday:"long", day:"numeric", month:"long" });
  return parts;
}

function formatMesTitulo(ym){
  const [y,m] = String(ym||"").split("-").map(Number);
  if(!y||!m) return ym;
  const dt = new Date(y, m-1, 1);
  const mes = dt.toLocaleDateString("es-AR", { month:"long" });
  return `${mes.charAt(0).toUpperCase()+mes.slice(1)} ${y}`;
}

let personasMap = new Map();
async function loadPersonasMap(){
  try{
    const qy = query(collection(db,"personas"), where("activo","==", true));
    const snap = await getDocs(qy);
    personasMap = new Map(snap.docs.map(d=>[d.id, String(d.data()?.nombre||"")]));
  }catch(e){
    console.warn("No pude cargar personas:", e);
    personasMap = new Map();
  }
}

function nombrePorId(id){
  const k = String(id||"").trim();
  if(!k) return "";
  return personasMap.get(k) || "";
}

function resolveNombre(asig, key){
  const v = asig?.[key];
  if(v === undefined || v === null) return "";
  const s = String(v).trim();
  if(!s) return "";
  return nombrePorId(s) || s;
}

function buildOracionFinal(oradorPublico, presidente, fallbackOracionFinal){
  const o = String(oradorPublico || "").trim();
  const p = String(presidente || "").trim();
  if(o && p) return `${o}/${p}`;
  if(p) return p;
  if(o) return o;
  return String(fallbackOracionFinal || "").trim();
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


function render(mesISO, items){
  const cont = $("contenido");
  if(!cont) return;

  const monthTitle = formatMesTitulo(mesISO);

  if(!items.length){
    cont.innerHTML = `
      <div class="month-title">
        <div class="h2">${monthTitle}</div>
        <div class="muted">No hay reuniones guardadas para este mes.</div>
      </div>
    `;
    return;
  }

  const blocks = items.map((it, idx)=>{
    const a = it.data || {};

    const presidente = resolveNombre(a, "presidenteId");
    const oracionInicial = resolveNombre(a, "oracionInicialId");
    const conductor = resolveNombre(a, "conductorAtalayaId");
    const lector = resolveNombre(a, "lectorAtalayaId");

    const orador = String(a.oradorPublico || "").trim();
    const cong = String(a.congregacionVisitante || "").trim();
    const titulo = String(a.tituloDiscurso || "").trim();

    const oracionFinal = buildOracionFinal(orador, presidente, resolveNombre(a, "oracionFinalId"));

    const wkClass = `wk-${(idx % 4) + 1}`;

    return `
      <div class="model-block ${wkClass}">
        <div class="dia-head">${escapeHtml(formatFechaLarga(it.id))}</div>

        <table class="model-table">
          <tr>
            <td class="lbl">Presidente:</td>
            <td class="val">${escapeHtml(presidente || "—")}</td>
            <td class="lbl">Oración inicial:</td>
            <td class="val">${escapeHtml(oracionInicial || "—")}</td>
          </tr>

          <tr>
            <td class="lbl">Discursante:</td>
            <td class="val">${escapeHtml(orador || "—")}</td>
            <td class="lbl">Congregación:</td>
            <td class="val">${escapeHtml(cong || "—")}</td>
          </tr>

          <tr>
            <td class="lbl">Título:</td>
            <td class="val title" colspan="3">${escapeHtml(titulo || "—")}</td>
          </tr>

          <tr>
            <td class="lbl">Atalaya:</td>
            <td class="val">${escapeHtml(conductor || "—")}</td>
            <td class="lbl">Lector:</td>
            <td class="val">${escapeHtml(lector || "—")}</td>
          </tr>

          <tr>
            <td class="lbl">Oración final:</td>
            <td class="val" colspan="3">${escapeHtml(oracionFinal || "—")}</td>
          </tr>
        </table>
      </div>
    `;
  }).join("\n");

  cont.innerHTML = `
    <div class="month-banner">
      <img src="assets/jw-header.jpg" alt="" />
      <div class="meta">
        <div class="left">Mes: ${escapeHtml(monthTitle)}</div>
        <div class="right">Programa de discursos públicos</div>
      </div>
    </div>
    ${blocks}
  `;
}


function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
}

async function cargar(){
  const mesISO = String($("mes")?.value||"").trim();
  if(!mesISO) return toast("Elegí un mes.", true);
  toast("Cargando…");

  try{
    await loadPersonasMap();
    const docs = await loadDocsInMonth(mesISO);

    // Reuniones de congregación: jueves (4) y sábado (6)
    const items = docs
      .map(d=>({ id:d.id, data:d.data }))
      .filter(d=>{
        const dt = isoToDate(d.id);
        if(!dt) return false;
        const dow = dt.getDay();
        return dow === 4 || dow === 6;
      })
      .sort((a,b)=>a.id.localeCompare(b.id));

    render(mesISO, items);
  }catch(e){
    console.error(e);
    toast("Error cargando. Revisá permisos.", true);
  }
}

(async function init(){
  await requireActiveUser();

  const now = new Date();
  $("mes").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  $("btnCargar")?.addEventListener("click", cargar);
  $("mes")?.addEventListener("change", cargar);
  $("btnPrint")?.addEventListener("click", ()=>window.print());

  await cargar();
})();
