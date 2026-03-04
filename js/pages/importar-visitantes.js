import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc, getDoc,
  writeBatch, collection
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host){ alert(msg); return; }
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " err" : "");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>el.remove(), 5200);
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}


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


async function requireAdmin(){
  renderTopbar("importar");
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href = "index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }
      if(!isAdminRole(u?.rol)){
        toast("Solo Admin/Superadmin puede importar.", true);
        return;
      }
      resolve({ user, usuario:u });
    });
  });
}

// ---------------- Hospitalidad rotativa (Marcelo)
const GRUPOS = ["Santa Rosa", "Villa Fiad", "Pala Pala", "Bracho"]; // orden
const BASE_SABADO = "2026-03-07"; // sábado base
const BASE_IDX = 3; // Bracho

function startOfDay(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}

function hospitalidadPorFechaISO(fechaISO){
  const base = startOfDay(BASE_SABADO);
  const target = startOfDay(fechaISO);
  const MS_DAY = 24*60*60*1000;
  const weeks = Math.floor((target - base) / (7*MS_DAY));
  const idx = ((BASE_IDX + weeks) % GRUPOS.length + GRUPOS.length) % GRUPOS.length;
  return GRUPOS[idx];
}

// -------------- Excel parsing
let wb = null;
let rows = []; // filas normalizadas

function normHeader(h){
  return String(h||"")
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/\s+/g,' ');
}

function parseFechaToISO(v){
  if(v == null || v === "") return "";

  // Excel date serial
  if(typeof v === "number" && Number.isFinite(v)){
    const dt = XLSX.SSF.parse_date_code(v);
    if(dt){
      const d = new Date(dt.y, dt.m-1, dt.d);
      d.setHours(0,0,0,0);
      return d.toISOString().slice(0,10);
    }
  }

  // Date object
  if(v instanceof Date && !isNaN(v.getTime())){
    const d = new Date(v);
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  }

  const s = String(v).trim();
  if(!s) return "";

  // Fix 0203 typo -> 2023 (dd/mm/0203)
  const mTypo = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-]0(\d{3})$/);
  if(mTypo){
    const dd = mTypo[1].padStart(2,'0');
    const mm = mTypo[2].padStart(2,'0');
    const yy = "2" + mTypo[3];
    return `${yy}-${mm}-${dd}`;
  }

  // dd/mm/yyyy or d/m/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){
    const dd = m[1].padStart(2,'0');
    const mm = m[2].padStart(2,'0');
    let yy = m[3];
    if(yy.length === 2) yy = (Number(yy) >= 70 ? "19" : "20") + yy;
    return `${yy}-${mm}-${dd}`;
  }

  // Already ISO
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return "";
}

function toNumberOrEmpty(v){
  const s = String(v ?? "").trim();
  if(!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function looksLikeEvento(nombre, titulo){
  const n = String(nombre||"").trim().toLowerCase();
  const t = String(titulo||"").trim().toLowerCase();
  const key = `${n} ${t}`;
  return !n || /asamblea|conmemoracion|discurso especial|visita del|visita de|dedicacion|no encontrado/.test(key);
}

function normalizeRows(sheetName){
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const mapped = [];

  // Detect common headers
  // Accept variations: Congregación, Cong, etc.
  for(const r of json){
    const obj = {};
    for(const [k,v] of Object.entries(r)) obj[normHeader(k)] = v;

    const fechaISO = parseFechaToISO(obj["fecha"] || obj["date"] || obj["dia"]);
    const nombre = String(obj["nombre"] || obj["orador"] || obj["discursante"] || "").trim();
    const congregacion = String(obj["congregacion"] || obj["congregacion "] || obj["congregacion de"] || obj["congregacion (de donde nos visita)"] || obj["congregación"] || "").trim();
    const bosquejo = toNumberOrEmpty(obj["bosquejo"]);
    const cancion = toNumberOrEmpty(obj["cancion"] || obj["canción"]);
    const titulo = String(obj["titulo"] || obj["título"] || "").trim();
    const observaciones = String(obj["observaciones"] || "").trim();
    const hospitalidad = String(obj["hospitalidad"] || "").trim();

    if(!fechaISO) continue;
    if(looksLikeEvento(nombre, titulo)) continue;
    if(!nombre || !congregacion) continue;

    mapped.push({
      fecha: fechaISO,
      nombre,
      congregacion,
      bosquejo,
      cancion,
      titulo,
      observaciones,
      hospitalidad: hospitalidadPorFechaISO(fechaISO), // recalcular TODO
    });
  }

  // dedupe by fecha (último gana)
  const byFecha = new Map();
  for(const r of mapped) byFecha.set(r.fecha, r);
  return Array.from(byFecha.values()).sort((a,b)=>a.fecha.localeCompare(b.fecha));
}

function renderPreview(){
  const tbl = $("tbl");
  const thead = tbl.querySelector("thead");
  const tbody = tbl.querySelector("tbody");
  const cols = ["fecha","nombre","congregacion","bosquejo","cancion","titulo","hospitalidad","observaciones"]; 
  thead.innerHTML = `<tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr>`;
  const view = rows.slice(0, 30);
  tbody.innerHTML = view.map(r=>`
    <tr>
      ${cols.map(c=>`<td>${escapeHtml(r[c] ?? "")}</td>`).join("")}
    </tr>
  `).join("") || `<tr><td class="muted" colspan="${cols.length}">Sin filas válidas.</td></tr>`;
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>\"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}

async function doImport(){
  if(!rows.length){ toast("No hay filas válidas para importar.", true); return; }
  if(!confirm(`Vas a importar ${rows.length} visitantes a Firestore (colección: visitas).\n\nSe recalcula Hospitalidad para TODOS.\n\n¿Continuar?`)) return;

  const col = collection(db, "visitas");
  let done = 0;
  let batch = writeBatch(db);
  let ops = 0;

  const commitBatch = async ()=>{
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for(const r of rows){
    const ref = doc(col, r.fecha);
    const payload = {
      fecha: r.fecha,
      nombre: r.nombre,
      congregacion: r.congregacion,
      bosquejo: r.bosquejo,
      cancion: r.cancion,
      titulo: r.titulo,
      observaciones: r.observaciones,
      hospitalidad: r.hospitalidad,
      updatedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
    };
    batch.set(ref, payload, { merge:true });
    ops += 1;
    done += 1;

    if(ops >= 450){
      toast(`Importando… ${done}/${rows.length}`);
      await commitBatch();
    }
  }

  if(ops > 0) await commitBatch();
  toast(`Importación completa ✅ (${done} registros).`);
}

function onFileChange(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    const data = new Uint8Array(e.target.result);
    wb = XLSX.read(data, { type: "array" });
    const sheetSel = $("sheet");
    sheetSel.innerHTML = wb.SheetNames.map(n=>`<option value="${n}">${n}</option>`).join("");
    sheetSel.disabled = false;
    // auto load first
    rows = normalizeRows(sheetSel.value);
    renderPreview();
    toast(`Archivo cargado. Filas válidas: ${rows.length}.`);
  };
  reader.onerror = ()=> toast("No pude leer el archivo.", true);
  reader.readAsArrayBuffer(file);
}

(async function(){
  await requireAdmin();

  $("file")?.addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    onFileChange(f);
  });

  $("sheet")?.addEventListener("change", ()=>{
    if(!wb) return;
    rows = normalizeRows($("sheet").value);
    renderPreview();
  });

  $("btnPreview")?.addEventListener("click", ()=>{
    if(!wb){ toast("Primero subí el Excel.", true); return; }
    rows = normalizeRows($("sheet").value);
    renderPreview();
    toast(`Vista previa lista. Filas válidas: ${rows.length}.`);
  });

  $("btnImport")?.addEventListener("click", doImport);
})();
