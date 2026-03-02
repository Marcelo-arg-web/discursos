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

function ensureTopbarStyles(){
  if(document.getElementById("topbarStyle")) return;
  const s = document.createElement("style");
  s.id = "topbarStyle";
  s.textContent = `
    .topbar{display:flex;justify-content:space-between;align-items:center;gap:14px;
      background:#1a4fa3;color:#fff;padding:10px 14px;border-radius:14px;margin:14px auto;max-width:1100px;}
    .topbar .brand{font-weight:800}
    .topbar .links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .topbar a{color:#fff;text-decoration:none;font-weight:700;font-size:13px;opacity:.92}
    .topbar a.active{text-decoration:underline;opacity:1}
    .topbar .btn.danger{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}

    /* Programa mensual */
    .prog-wrap{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}
    .prog-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #e5e7eb}
    .prog-header .title{font-weight:900;font-size:14px;letter-spacing:.2px}
    .prog-header .date{font-weight:800;font-size:13px;opacity:.95}
    .prog-grid{width:100%;border-collapse:collapse}
    .prog-grid td{border-top:1px solid #e5e7eb;padding:7px 10px;font-size:13px;vertical-align:top}
    .prog-grid td.k{width:160px;font-weight:800;color:#111827}

    .wk-odd .prog-header{background:#eaf2ff}
    .wk-even .prog-header{background:#f3f4f6}

    .month-title{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:10px}
    .month-title .h2{font-size:18px;font-weight:900;margin:0}

    @media print{
      .container{max-width:1100px}
      .no-print{display:none !important}
      body{background:#fff}
      .card{box-shadow:none !important;border:0 !important}
      .prog-wrap{break-inside:avoid-page;margin-bottom:10px}
    }
  `;
  document.head.appendChild(s);
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
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="programa-mensual.html" class="${active==='programa'?'active':''}">Programa mensual</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
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

    const wkClass = (idx % 2 === 0) ? "wk-odd" : "wk-even";

    return `
      <div class="prog-wrap ${wkClass}">
        <div class="prog-header">
          <div class="title">${escapeHtml(monthTitle)}</div>
          <div class="date">${escapeHtml(formatFechaLarga(it.id))}</div>
        </div>
        <table class="prog-grid">
          <tr><td class="k">Presidente</td><td>${escapeHtml(presidente || "—")}</td></tr>
          <tr><td class="k">Oración inicial</td><td>${escapeHtml(oracionInicial || "—")}</td></tr>
          <tr><td class="k">Conferenciante</td><td>${escapeHtml(orador || "—")}</td></tr>
          <tr><td class="k">Congregación</td><td>${escapeHtml(cong || "—")}</td></tr>
          <tr><td class="k">Título</td><td><i>${escapeHtml(titulo || "—")}</i></td></tr>
          <tr><td class="k">La Atalaya</td><td>${escapeHtml(conductor || "—")} · Lector: ${escapeHtml(lector || "—")}</td></tr>
          <tr><td class="k">Oración final</td><td>${escapeHtml(oracionFinal || "—")}</td></tr>
        </table>
      </div>
    `;
  }).join("\n");

  cont.innerHTML = `
    <div class="month-title">
      <div class="h2">${escapeHtml(monthTitle)}</div>
      <div class="muted">Tip: imprimí en A4 vertical. Si se corta, bajá la escala a 90%.</div>
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

    // Solo fines de semana (sábado/domingo)
    const items = docs
      .map(d=>({ id:d.id, data:d.data }))
      .filter(d=>{
        const dt = isoToDate(d.id);
        if(!dt) return false;
        const dow = dt.getDay();
        return dow === 6 || dow === 0;
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
