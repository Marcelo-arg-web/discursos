import { auth, db } from "../firebase-config.js?v=20260429b70";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);
const LOCALES_VILLA_FIAD = ["Marcelo Palavecino","Sergio Saldaña","Luis Navarro","Leonardo Araya","Marcelo Rodríguez","Marcelo Rodriguez"];
function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function normalKey(s){ return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function isAdminRole(rol){ const r=String(rol||"").toLowerCase(); return r==="admin" || r==="superadmin"; }
function isLocal(nombre){ const k=normalKey(nombre); return LOCALES_VILLA_FIAD.some(n=>normalKey(n)===k) || k==="marcelo rodrigez" || k==="marcelo palevecino"; }
function canonical(nombre){ const k=normalKey(nombre); if(k==="marcelo rodriguez" || k==="marcelo rodrigez") return "Marcelo Rodríguez"; if(k==="marcelo palevecino") return "Marcelo Palavecino"; return LOCALES_VILLA_FIAD.find(n=>normalKey(n)===k) || String(nombre||"").trim(); }
function todayISO(){ const d=new Date(); return dateISO(d); }
function dateISO(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function addDaysISO(iso, days){ const [y,m,d]=String(iso).slice(0,10).split("-").map(Number); const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+days); return dateISO(dt); }
function upcomingSaturdayISO(){ const d=new Date(); d.setHours(0,0,0,0); const day=d.getDay(); const diff=(6-day+7)%7; d.setDate(d.getDate()+diff); return dateISO(d); }
function monthISO(iso){ return String(iso||todayISO()).slice(0,7); }
function formatDate(iso){ const [y,m,d]=String(iso).slice(0,10).split("-").map(Number); if(!y||!m||!d) return iso||"—"; return new Date(y,m-1,d).toLocaleDateString("es-AR",{weekday:"short", day:"2-digit", month:"2-digit"}); }
function tituloBosquejo(n){ const num=Number(n); return Number.isFinite(num) ? (bosquejos[num] || "") : ""; }
async function getUsuario(uid){ const snap = await getDoc(doc(db,"usuarios",uid)); return snap.exists() ? snap.data() : null; }
function renderTopbar(){
  const el=$("topbar"); if(!el) return;
  el.innerHTML = `<div class="topbar"><div class="brand"><span class="brand-dot"></span>Villa Fiad</div><div class="links">
    <a href="preparar-semana.html" class="active">Preparar semana</a><a href="panel.html">Panel</a><a href="asignaciones.html">Asignaciones</a><a href="resultados.html">Resultados</a><a href="documentos.html">Documentos/PDF</a><a href="visitantes.html">Visitantes</a><a href="salientes.html">Salientes</a><a href="funciones.html">Funciones</a><a href="funciones.html">Funciones</a><a href="usuarios.html">Usuarios</a>
  </div><div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div></div>`;
  $("btnSalir")?.addEventListener("click", async()=>{ await signOut(auth); location.href="index.html"; });
}
async function requireAdmin(){
  return new Promise(resolve=>{
    onAuthStateChanged(auth, async user=>{
      if(!user){ location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){ await signOut(auth); location.href="index.html"; return; }
      if(!isAdminRole(u?.rol)){ location.href="resultados.html"; return; }
      renderTopbar(); resolve({user, usuario:u});
    });
  });
}
function fechasCompatibles(fecha){ return [fecha, addDaysISO(fecha,1), addDaysISO(fecha,-1)].filter(Boolean); }
async function cargarVisitante(fecha){
  const snap = await getDocs(collection(db,"visitas"));
  const map = new Map(snap.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
  for(const f of fechasCompatibles(fecha)){ if(map.has(f)) return map.get(f); }
  return null;
}
async function cargarSalientesSemana(fecha){
  const start = addDaysISO(fecha, -3);
  const end = addDaysISO(fecha, 1);
  const snap = await getDocs(collection(db,"salientes"));
  return snap.docs.map(d=>({id:d.id,...d.data()}))
    .filter(r=>isLocal(r.orador || r.oradorNombre || r.hermano || r.nombre || ""))
    .filter(r=>{ const f=String(r.fecha||r.id||"").slice(0,10); return f>=start && f<=end; })
    .sort((a,b)=>String(a.fecha||a.id||"").localeCompare(String(b.fecha||b.id||"")));
}
function updateLinks(){
  const fecha = $("fechaSemana")?.value || upcomingSaturdayISO();
  const mes = monthISO(fecha);
  if($("linkAsignaciones")) $("linkAsignaciones").href = "asignaciones.html?semana=" + encodeURIComponent(fecha);
  if($("linkDocumentos")) $("linkDocumentos").href = "documentos.html?mes=" + encodeURIComponent(mes);
  if($("stepAsignaciones")) $("stepAsignaciones").href = "asignaciones.html?semana=" + encodeURIComponent(fecha);
  if($("stepPresidente")) $("stepPresidente").href = "presidente.html?semana=" + encodeURIComponent(fecha);
  if($("stepMes")) $("stepMes").href = "documentos.html?mes=" + encodeURIComponent(mes);
}
async function cargarResumen(){
  const fecha = $("fechaSemana")?.value || upcomingSaturdayISO();
  updateLinks();
  const alertas=[];
  const visitante = await cargarVisitante(fecha);
  const vBox=$("visitanteBox");
  const badge=$("badgeVisitante");
  if(visitante){
    const n=visitante.bosquejo || visitante.discurso || visitante.numero || "";
    const titulo=visitante.titulo || tituloBosquejo(n);
    if(badge) badge.textContent="Cargado";
    if(vBox) vBox.innerHTML = `<div class="result-list"><div class="result-line"><div><strong>${escapeHtml(formatDate(visitante.id||visitante.fecha||fecha))}</strong> · ${escapeHtml(visitante.nombre||"")}</div><div class="muted small">${escapeHtml(visitante.congregacion||"")} ${n?`· Bosquejo ${escapeHtml(n)}`:""} ${titulo?`· ${escapeHtml(titulo)}`:""}</div></div></div>`;
  }else{
    if(badge) badge.textContent="Falta";
    if(vBox) vBox.innerHTML = `<div class="toast err">No encontré visitante cargado para esta fecha.</div>`;
    alertas.push("Falta cargar el visitante para la semana elegida.");
  }
  const salientes = await cargarSalientesSemana(fecha);
  const sBox=$("salientesBox");
  if(sBox){
    if(!salientes.length) sBox.innerHTML = `<div class="muted">No hay salientes locales en esta semana.</div>`;
    else sBox.innerHTML = `<div class="result-list">${salientes.map(s=>{ const f=String(s.fecha||s.id||"").slice(0,10); const n=s.bosquejo||s.discurso||s.numero||""; const t=s.titulo||tituloBosquejo(n); return `<div class="result-line"><div><strong>${escapeHtml(formatDate(f))}</strong> · ${escapeHtml(canonical(s.orador||s.oradorNombre||s.hermano||s.nombre||""))}</div><div class="muted small">${escapeHtml(s.destino||s.congregacionDestino||s.congregacion||"")} ${n?`· Bosquejo ${escapeHtml(n)}`:""} ${t?`· ${escapeHtml(t)}`:""}</div></div>`; }).join("")}</div>`;
  }
  if(salientes.some(s=>normalKey(s.orador||s.oradorNombre||s.hermano||s.nombre||"").includes("marcelo palavecino"))) alertas.push("Marcelo Palavecino sale esta semana: revisar conductor de La Atalaya.");
  const aBox=$("alertasBox");
  if(aBox) aBox.innerHTML = alertas.length ? `<ul class="muted">${alertas.map(a=>`<li>${escapeHtml(a)}</li>`).join("")}</ul>` : `<div class="toast ok">Sin alertas importantes para esta semana.</div>`;
}
(async function(){
  await requireAdmin();
  const input=$("fechaSemana");
  if(input){
    const params=new URLSearchParams(location.search);
    input.value = params.get("semana") || upcomingSaturdayISO();
    input.addEventListener("change", cargarResumen);
  }
  $("btnEstaSemana")?.addEventListener("click", ()=>{ input.value=upcomingSaturdayISO(); cargarResumen(); });
  $("btnAnterior")?.addEventListener("click", ()=>{ input.value=addDaysISO(input.value || upcomingSaturdayISO(), -7); cargarResumen(); });
  $("btnSiguiente")?.addEventListener("click", ()=>{ input.value=addDaysISO(input.value || upcomingSaturdayISO(), 7); cargarResumen(); });
  await cargarResumen();
})();
