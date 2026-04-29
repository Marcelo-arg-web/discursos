import { auth, db } from "../firebase-config.js";
import { hasPublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id)=>document.getElementById(id);
let currentRole = "viewer";
let currentName = "Usuario";

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[c]));
}
function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}
function currentYM(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function saturdayOfMonthWeek(mesISO, weekNum){
  const [y,m] = String(mesISO||"").split("-").map(Number);
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
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function renderTopbar(){
  const el = $("topbar");
  if(!el) return;
  if(isAdminRole(currentRole)){
    el.innerHTML = `
      <div class="topbar">
        <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
        <div class="links">
          <a href="panel.html">Panel</a>
          <a href="asignaciones.html">Asignaciones</a>
          <a href="resultados.html">Resultados</a>
          <a href="documentos.html" class="active">Documentos/PDF</a>
          <a href="visitantes.html">Visitantes</a>
          <a href="salientes.html">Salientes</a>
          <a href="funciones.html">Funciones</a>
          <a href="funciones.html">Funciones</a>
          <a href="discursantes.html">Discursantes</a>
          <a href="usuarios.html">Usuarios</a>
          <a href="perfil.html">Mi perfil</a>
        </div>
        <div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div>
      </div>`;
  }else{
    el.innerHTML = `
      <div class="topbar viewer-topbar resultados-only">
        <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
        <div class="links viewer-links">
          <a href="resultados.html">Resultados</a>
          <a href="documentos.html" class="active">Documentos/PDF</a>
          <a href="perfil.html">Mi perfil</a>
        </div>
        <div class="actions">
          <span class="badge">Solo lectura</span>
          <span class="badge soft">${escapeHtml(currentName)}</span>
          <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
        </div>
      </div>`;
  }
  $("btnSalir")?.addEventListener("click", async()=>{
    if(hasPublicAccess()){
      setPublicAccess(false);
      location.href = "index.html";
      return;
    }
    try{ await signOut(auth); }catch(e){}
    location.href = "index.html";
  });
}
async function requireAccess(){
  if(hasPublicAccess()){
    currentRole = "viewer";
    currentName = "Modo consulta";
    renderTopbar();
    return;
  }
  return new Promise(resolve=>{
    onAuthStateChanged(auth, async user=>{
      if(!user){ location.href = "index.html"; return; }
      try{
        const snap = await getDoc(doc(db,"usuarios",user.uid));
        const u = snap.exists() ? snap.data() : { email:user.email, rol:"viewer", activo:true };
        if(!u?.activo){ await signOut(auth); location.href="index.html"; return; }
        currentRole = u?.rol || "viewer";
        currentName = u?.nombre || u?.email || user.email || "Usuario";
        renderTopbar();
        resolve();
      }catch(e){
        console.error(e);
        location.href = "index.html";
      }
    });
  });
}
function buildSrc(){
  const tipo = $("tipoDocumento")?.value || "programa";
  const mes = $("mesDocumento")?.value || currentYM();
  const sem = $("semanaDocumento")?.value || "1";
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
    help = "Documento mensual para el presidente con visitantes y salientes.";
  }else if(tipo === "presidente-semana"){
    file = "presidente.html";
    qs.delete("mes");
    qs.set("semana", saturdayOfMonthWeek(mes, sem));
    qs.set("embed", "1");
    help = "PDF semanal para el presidente. Cambiá la semana si hace falta.";
  }else if(tipo === "resumen"){
    file = "imprimir.html";
    qs.set("semana", sem);
    help = "Resumen completo mensual, con accesos internos a otros documentos.";
  }else if(tipo === "discursantes"){
    file = "directorio-discursos.html";
    qs.delete("mes");
    qs.set("embed", "1");
    help = "PDF de discursantes armado con los perfiles cargados.";
  }

  const url = `${file}?${qs.toString()}`;
  return { url, help, tipo };
}
function updateVisibility(){
  const tipo = $("tipoDocumento")?.value || "programa";
  const weekField = $("weekField");
  if(weekField) weekField.style.display = (tipo === "presidente-semana" || tipo === "resumen") ? "block" : "none";
  if(!isAdminRole(currentRole)){
    const opt = $("tipoDocumento")?.querySelector('option[value="discursantes"]');
    if(opt) opt.hidden = true;
    if(tipo === "discursantes") $("tipoDocumento").value = "programa";
  }
}
function refreshFrame(){
  updateVisibility();
  const { url, help } = buildSrc();
  const frame = $("docFrame");
  if(frame) frame.src = url;
  const open = $("btnAbrirDoc");
  if(open) open.href = url.replace(/[?&]embed=1/, "").replace(/\?$/, "");
  const h = $("docHelp");
  if(h) h.textContent = help;
  const current = new URL(location.href);
  current.searchParams.set("tipo", $("tipoDocumento")?.value || "programa");
  current.searchParams.set("mes", $("mesDocumento")?.value || currentYM());
  current.searchParams.set("semana", $("semanaDocumento")?.value || "1");
  history.replaceState(null, "", current.toString());
}
function printFrame(){
  const frame = $("docFrame");
  try{
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  }catch(e){
    window.open($("btnAbrirDoc")?.href || buildSrc().url, "_blank");
  }
}
(async function(){
  await requireAccess();
  const params = new URLSearchParams(location.search);
  const mesEl = $("mesDocumento");
  if(mesEl) mesEl.value = params.get("mes") || currentYM();
  const semEl = $("semanaDocumento");
  if(semEl) semEl.value = params.get("semana") || "1";
  const tipoEl = $("tipoDocumento");
  if(tipoEl && params.get("tipo")) tipoEl.value = params.get("tipo");
  tipoEl?.addEventListener("change", refreshFrame);
  mesEl?.addEventListener("change", refreshFrame);
  semEl?.addEventListener("change", refreshFrame);
  $("btnActualizarDoc")?.addEventListener("click", refreshFrame);
  $("btnImprimirDoc")?.addEventListener("click", printFrame);
  refreshFrame();
})();
