import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}
async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}
function renderAdminTopbar(){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html">Panel</a>
        <a href="asignaciones.html">Asignaciones</a>
        <a href="resultados.html" class="active">Resultados</a>
        <a href="documentos.html">Documentos/PDF</a>
        <a href="visitantes.html">Visitantes</a>
        <a href="salientes.html">Salientes</a>
        <a href="funciones.html">Funciones</a>
        <a href="funciones.html">Funciones</a>
        <a href="usuarios.html">Usuarios</a>
        <a href="perfil.html">Mi perfil</a>
      </div>
      <div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div>
    </div>`;
  document.getElementById("btnSalir")?.addEventListener("click", async()=>{ await signOut(auth); location.href="index.html"; });
}
function renderViewerTopbar(name="Usuario"){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar viewer-topbar resultados-only">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links viewer-links">
        <a href="resultados.html" class="active">Resultados</a>
      </div>
      <div class="actions">
        <span class="badge">Solo lectura</span>
        <span class="badge soft">${escapeHtml(name)}</span>
        <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>`;
  document.getElementById("btnSalir")?.addEventListener("click", async()=>{
    if(hasPublicAccess()){ setPublicAccess(false); location.href="index.html"; return; }
    await signOut(auth); location.href="index.html";
  });
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function todayISO(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function currentYM(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function formatDate(iso){
  if(!iso) return "—";
  const [y,m,d] = String(iso).slice(0,10).split('-').map(Number);
  if(!y || !m || !d) return iso;
  return new Date(y, m-1, d).toLocaleDateString("es-AR", { weekday:"short", day:"2-digit", month:"2-digit" });
}

const LOCALES_VILLA_FIAD = [
  "Marcelo Palavecino",
  "Sergio Saldaña",
  "Luis Navarro",
  "Leonardo Araya",
  "Marcelo Rodríguez",
  "Marcelo Rodriguez"
];
let clavesDiscursantesLocales = new Set(LOCALES_VILLA_FIAD.map(n => normalKey(n)));
function normalKey(s){
  return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function canonicalLocalName(nombre){
  const k = normalKey(nombre);
  if(k === "marcelo rodriguez" || k === "marcelo rodrigez") return "Marcelo Rodríguez";
  if(k === "marcelo palevecino") return "Marcelo Palavecino";
  const found = LOCALES_VILLA_FIAD.find(n => normalKey(n) === k);
  return found || String(nombre||"").trim();
}
function isLocalSaliente(row){
  const nombre = canonicalLocalName(row?.orador || row?.oradorNombre || row?.hermano || row?.nombre || "");
  if(!nombre) return false;
  return clavesDiscursantesLocales.has(normalKey(nombre));
}
function addLocalSpeaker(nombre){
  const k = normalKey(nombre);
  if(k) clavesDiscursantesLocales.add(k);
}
async function cargarDiscursantesLocales(){
  // En Resultados solo se muestran salidas de discursantes locales de Villa Fiad.
  // No se suman visitantes ni conferenciantes de otras congregaciones aunque existan en otras colecciones.
  clavesDiscursantesLocales = new Set(LOCALES_VILLA_FIAD.map(n => normalKey(n)));
}

function salienteFecha(row){
  return String(row?.fecha || row?.id || row?.date || "").slice(0,10);
}
function salienteNombre(row){
  return canonicalLocalName(row?.orador || row?.oradorNombre || row?.hermano || row?.nombre || "");
}
function salienteDestino(row){
  return row?.destino || row?.congregacionDestino || row?.congregacion || row?.lugar || "";
}

function syncLinks(){
  const ym = $("mesResultados")?.value || currentYM();
  const q = `?mes=${encodeURIComponent(ym)}`;
  const a = $("linkDocumentos");
  if(a) a.href = "documentos.html" + q;
  refreshDocumentosResultados();
}


function saturdayOfMonthWeek(mesISO, weekNum){
  const parts = String(mesISO||"").split("-").map(Number);
  const y = parts[0], m = parts[1];
  if(!y || !m) return "";
  const monthIndex = m - 1;
  const sats = [];
  const d = new Date(y, monthIndex, 1);
  while(d.getMonth() === monthIndex){
    if(d.getDay() === 6) sats.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  const dt = sats[Math.max(0, Number(weekNum || 1)-1)];
  if(!dt) return "";
  return dt.getFullYear() + "-" + String(dt.getMonth()+1).padStart(2,"0") + "-" + String(dt.getDate()).padStart(2,"0");
}
function buildDocSrc(){
  const tipo = $("tipoDocumentoResultados")?.value || "programa";
  const mes = $("mesResultados")?.value || currentYM();
  const sem = $("semanaDocumentoResultados")?.value || "1";
  const qs = new URLSearchParams();
  qs.set("mes", mes);
  qs.set("embed", "1");
  let file = "programa-mensual.html";
  let help = "Programa mensual listo para imprimir o guardar como PDF.";
  if(tipo === "acomodadores"){
    file = "tablero-acomodadores.html";
    help = "Asignaciones Villa Fiad: acomodadores, plataforma, audio/video y microfonistas.";
  }else if(tipo === "presidente-mes"){
    file = "doc-presi.html";
    help = "Documento del presidente con visitantes y salientes locales del mes.";
  }else if(tipo === "presidente-semana"){
    file = "presidente.html";
    qs.delete("mes");
    qs.set("semana", saturdayOfMonthWeek(mes, sem));
    qs.set("embed", "1");
    help = "PDF semanal para el presidente.";
  }else if(tipo === "resumen"){
    file = "imprimir.html";
    qs.set("semana", sem);
    help = "Resumen completo mensual.";
  }
  return { url: file + "?" + qs.toString(), help, tipo };
}
function updateDocVisibility(){
  const tipo = $("tipoDocumentoResultados")?.value || "programa";
  const wf = $("weekFieldResultados");
  if(wf) wf.style.display = (tipo === "presidente-semana" || tipo === "resumen") ? "block" : "none";
}
function refreshDocumentosResultados(){
  updateDocVisibility();
  const built = buildDocSrc();
  const frame = $("docFrameResultados");
  if(frame) frame.src = built.url;
  const open = $("btnAbrirDocResultados");
  if(open) open.href = built.url.replace(/[?&]embed=1/, "").replace(/\?$/, "");
  const h = $("docHelpResultados");
  if(h) h.textContent = built.help;
}
function printDocumentosResultados(){
  const frame = $("docFrameResultados");
  try{
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  }catch(e){
    window.open($("btnAbrirDocResultados")?.href || buildDocSrc().url, "_blank");
  }
}

async function previewVisitantes(){
  const box = $("previewVisitantes");
  if(!box) return;
  try{
    const min = todayISO();
    const snap = await getDocs(collection(db,"visitas"));
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .filter(v=>String(v.id) >= min)
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
      .slice(0,6);
    if(!rows.length){ box.innerHTML = `<div class="muted">No hay visitantes próximos cargados.</div>`; return; }
    box.innerHTML = `<div class="result-list">${rows.map(v=>{
      const n = Number(v.bosquejo);
      const titulo = v.titulo || (Number.isFinite(n) ? bosquejos[n] : "") || "";
      return `<div class="result-line">
        <div><strong>${escapeHtml(formatDate(v.id))}</strong> · ${escapeHtml(v.nombre||"")}</div>
        <div class="muted small">${escapeHtml(v.congregacion||"")} ${v.bosquejo ? `· Bosquejo ${escapeHtml(v.bosquejo)}` : ""} ${titulo ? `· ${escapeHtml(titulo)}` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">No pude cargar los visitantes.</div>`;
  }
}
async function previewSalientes(){
  const box = $("previewSalientes");
  if(!box) return;
  try{
    const min = todayISO();
    await cargarDiscursantesLocales();
    const snap = await getDocs(collection(db,"salientes"));
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .filter(isLocalSaliente)
      .filter(s=>salienteFecha(s) >= min)
      .sort((a,b)=>salienteFecha(a).localeCompare(salienteFecha(b)))
      .slice(0,8);
    if(!rows.length){ box.innerHTML = `<div class="muted">No hay salidas próximas cargadas para discursantes locales.</div>`; return; }
    box.innerHTML = `<div class="result-list">${rows.map(s=>{
      const fecha = salienteFecha(s);
      const n = Number(s.bosquejo || s.discurso || s.numero);
      const titulo = s.titulo || (Number.isFinite(n) ? bosquejos[n] : "") || "";
      const nombre = salienteNombre(s);
      const cong = salienteDestino(s);
      return `<div class="result-line">
        <div><strong>${escapeHtml(formatDate(fecha))}</strong> · ${escapeHtml(nombre)}</div>
        <div class="muted small">${escapeHtml(cong)} ${n ? `· Bosquejo ${escapeHtml(n)}` : ""} ${titulo ? `· ${escapeHtml(titulo)}` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">No pude cargar las salidas locales.</div>`;
  }
}

async function requireAccess(){
  if(hasPublicAccess()){
    renderViewerTopbar("Modo consulta");
    return;
  }
  return new Promise(resolve=>{
    onAuthStateChanged(auth, async user=>{
      if(!user){ location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){ await signOut(auth); location.href="index.html"; return; }
      if(isAdminRole(u?.rol)) renderAdminTopbar();
      else renderViewerTopbar(u?.nombre || user.email || "Usuario");
      resolve();
    });
  });
}
(async function(){
  await requireAccess();
  const mes = $("mesResultados");
  if(mes){
    const params = new URLSearchParams(location.search);
    mes.value = params.get("mes") || currentYM();
    mes.addEventListener("change", syncLinks);
  }
  $("tipoDocumentoResultados")?.addEventListener("change", refreshDocumentosResultados);
  $("semanaDocumentoResultados")?.addEventListener("change", refreshDocumentosResultados);
  $("btnActualizarDocResultados")?.addEventListener("click", refreshDocumentosResultados);
  $("btnImprimirDocResultados")?.addEventListener("click", printDocumentosResultados);
  syncLinks();
  await Promise.all([previewVisitantes(), previewSalientes()]);
})();
