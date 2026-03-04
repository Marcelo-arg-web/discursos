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
  cont.innerHTML = "";

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
      <div class="mb-row">
        <img class="mb-img" src="assets/jw-header.jpg" alt="" />
        <div class="mb-text">
          <div class="mb-title">Asignaciones Mensuales</div>
          <div class="mb-month">${escapeHtml(monthTitle)}</div>
          <div class="mb-cong">Congr. Villa Fiad</div>
        </div>
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
  const cont = $("contenido");
  if(cont) cont.innerHTML = ""; // evita duplicados si algo se ejecuta 2 veces
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
