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
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : "ok"}">${msg}</div>`;
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
}

function monthRange(ym){
  const [y,m] = (ym||"").split("-").map(Number);
  if(!y || !m) return null;
  const start = `${y}-${String(m).padStart(2,"0")}-01`;
  const nextM = m===12 ? 1 : m+1;
  const nextY = m===12 ? y+1 : y;
  const end = `${nextY}-${String(nextM).padStart(2,"0")}-01`;
  return { y, m, start, end };
}

function nombreMes(m){
  return ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][m-1] || "";
}

function fmtMesAnio(y,m){
  return `${nombreMes(m)} ${y}`;
}

function isoToDate(iso){
  const [y,m,d] = iso.split("-").map(Number);
  if(!y||!m||!d) return null;
  return new Date(y, m-1, d);
}

function fmtDiaCorto(iso){
  const dt = isoToDate(iso);
  if(!dt) return iso;
  const dias = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  return `${dias[dt.getDay()]} ${dt.getDate()} ${nombreMes(dt.getMonth()+1)}`;
}

function addDays(iso, days){
  const dt = isoToDate(iso);
  if(!dt) return iso;
  dt.setDate(dt.getDate()+days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const d = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function safe(v){
  return (v ?? "").toString();
}

function headerHTML(docTitle, mesStr){
  return `
    <div class="print-header">
      <div class="imgwrap"><img src="assets/jw-header.jpg" alt=""></div>
      <div class="titles">
        <div class="cong">Congregación Villa Fiad</div>
        <div class="doc">${docTitle}</div>
        <div class="mes">Mes: ${mesStr}</div>
      </div>
    </div>
  `;
}

function renderPresidencia(items, mesStr){
  const blocks = items.map(it=>{
    const a = it.asignaciones || it;
    const semana = it.semana || it.id || "";
    return `
      <div class="wk">
        <div class="wk-title">${fmtDiaCorto(semana)}</div>
        <table>
          <tr>
            <td class="k">Presidente:</td><td><b>${safe(a.presidente)}</b></td>
            <td class="k2">Oración:</td><td><b>${safe(a.oracionInicial)}</b></td>
          </tr>
          <tr>
            <td class="k">Discursante:</td><td><b>${safe(a.oradorPublico)}</b></td>
            <td class="k2">Congregación:</td><td><b>${safe(a.congregacionVisitante)}</b></td>
          </tr>
          <tr>
            <td class="k">Título:</td><td colspan="3"><i><b>${safe(a.tituloDiscurso)}</b></i></td>
          </tr>
          <tr>
            <td class="k">Atalaya:</td><td><b>${safe(a.conductorAtalaya)}</b></td>
            <td class="k2">Lector:</td><td><b>${safe(a.lectorAtalaya)}</b></td>
          </tr>
        </table>
      </div>
    `;
  }).join("");

  return `
    <div class="print-page">
      ${headerHTML("Asignación mensual (Presidencia y Atalaya)", mesStr)}
      <div class="print-body">
        ${items.length ? blocks : `<div class="muted">No hay asignaciones para este mes.</div>`}
      </div>
    </div>
  `;
}

function renderAcomodadores(items, mesStr){
  const rows = items.flatMap(it=>{
    const a = it.asignaciones || it;
    const sab = it.semana || it.id || "";
    const jue = addDays(sab, -2);
    const ent = safe(a.acomodadorEntrada);
    const aud = safe(a.acomodadorAuditorio);
    return [
      `<tr><td>Jueves/${isoToDate(jue)?.getDate() ?? ""}</td><td>${ent}</td><td>${aud}</td></tr>`,
      `<tr><td>Sábado/${isoToDate(sab)?.getDate() ?? ""}</td><td>${ent}</td><td>${aud}</td></tr>`
    ];
  }).join("");

  return `
    <div class="print-page">
      ${headerHTML("Acomodadores", mesStr)}
      <div class="print-body">
        <table class="board-table">
          <thead>
            <tr><th>Semana</th><th>Entrada</th><th>Auditorio</th></tr>
          </thead>
          <tbody>
            ${items.length ? rows : `<tr><td colspan="3" class="muted">No hay asignaciones para este mes.</td></tr>`}
          </tbody>
        </table>
        <div class="small muted" style="margin-top:8px;">Nota: Jueves y sábado usan los mismos hermanos (como acordamos).</div>
      </div>
    </div>
  `;
}

function renderMultimedia(items, mesStr){
  const rows = items.flatMap(it=>{
    const a = it.asignaciones || it;
    const sab = it.semana || it.id || "";
    const jue = addDays(sab, -2);
    const sonido = [safe(a.multimedia1), safe(a.multimedia2)].filter(Boolean).join(" / ");
    const mics = [safe(a.microfonista1), safe(a.microfonista2)].filter(Boolean).join(" / ");
    const plat = safe(a.plataforma || a.acomodadorPlataforma || "");
    return [
      `<tr><td>Jueves/${isoToDate(jue)?.getDate() ?? ""}</td><td>${sonido}</td><td>${mics}</td><td>${plat}</td></tr>`,
      `<tr><td>Sábado/${isoToDate(sab)?.getDate() ?? ""}</td><td>${sonido}</td><td>${mics}</td><td>${plat}</td></tr>`
    ];
  }).join("");

  return `
    <div class="print-page">
      ${headerHTML("Audio y Video", mesStr)}
      <div class="print-body">
        <table class="board-table">
          <thead>
            <tr><th>Semana</th><th>Sonido y video</th><th>Micrófonos</th><th>Plataforma</th></tr>
          </thead>
          <tbody>
            ${items.length ? rows : `<tr><td colspan="4" class="muted">No hay asignaciones para este mes.</td></tr>`}
          </tbody>
        </table>
        <div class="small muted" style="margin-top:8px;">Nota: Jueves y sábado usan los mismos hermanos (como acordamos).</div>
      </div>
    </div>
  `;
}

function renderAll(items, ym){
  const r = monthRange(ym);
  const mesStr = r ? fmtMesAnio(r.y, r.m) : ym;

  const html = [
    renderPresidencia(items, mesStr),
    renderAcomodadores(items, mesStr),
    renderMultimedia(items, mesStr),
  ].join("\n");

  $("contenido").innerHTML = html;
}

async function cargarMes(){
  const ym = ($("mes")?.value || "").trim();
  const r = monthRange(ym);
  if(!r) return toast("Escribí el mes como YYYY-MM.", true);

  const q = query(
    collection(db, "asignacionesSemanales"),
    where("semana", ">=", r.start),
    where("semana", "<", r.end),
    orderBy("semana", "asc")
  );

  try{
    const snap = await getDocs(q);
    const items = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderAll(items, ym);
  }catch(e){
    console.error(e);
    toast("Error cargando datos. Revisá consola (F12) y permisos de Firestore.", true);
  }
}

(async function(){
  await requireActiveUser("imprimir");

  const now = new Date();
  if($("mes")) $("mes").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  $("btnPrint")?.addEventListener("click", ()=>window.print());
  $("btnRecargar")?.addEventListener("click", cargarMes);
  $("mes")?.addEventListener("change", cargarMes);

  await cargarMes();
})();
