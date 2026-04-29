import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";
import { canciones } from "../data/canciones.js";

const $ = (id)=>document.getElementById(id);
const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v]) => [String(k), String(v)]));
const cancionesMap = new Map(Object.entries(canciones).map(([k,v]) => [String(k), String(v)]));
let consultaTimer = null;
let ultimoBosquejoConsultado = "";
let ultimoTituloConsultado = "";

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : "ok"}">${escapeHtml(msg)}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 5000);
}
function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}
async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}
function renderTopbar(rol, nombre){
  const admin = isAdminRole(rol);
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        ${admin ? `
          <a href="panel.html">Panel</a>
          <a href="asignaciones.html">Asignaciones</a>
          <a href="resultados.html">Resultados</a>
          <a href="programa-mensual.html">Programa mensual</a>
          <a href="tablero-acomodadores.html">Asignaciones Villa Fiad</a>
          <a href="visitantes.html">Visitantes</a>
          <a href="salientes.html">Salientes</a>
          <a href="personas.html">Personas</a>
          <a href="funciones.html">Funciones</a>
          <a href="discursantes.html">Discursantes</a>
          <a href="directorio-discursos.html">PDF discursantes</a>
          <a href="usuarios.html">Usuarios</a>
          <a href="perfil.html" class="active">Mi perfil</a>
        ` : `
          <a href="resultados.html">Resultados</a>
          <a href="perfil.html" class="active">Mi perfil</a>
        `}
      </div>
      <div class="actions">
        ${admin ? "" : `<span class="badge">Solo lectura</span>`}
        <span class="badge soft">${escapeHtml(nombre || "Usuario")}</span>
        <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>
  `;
  $("btnSalir")?.addEventListener("click", async()=>{ await signOut(auth); location.href="index.html"; });
}
async function requireActiveUser(){
  return new Promise(resolve=>{
    onAuthStateChanged(auth, async user=>{
      if(!user){ location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){ await signOut(auth); location.href="index.html"; return; }
      renderTopbar(u?.rol, u?.nombre || user.email);
      resolve({ user, usuario:u });
    });
  });
}
function val(id){ return ($(id)?.value || "").trim(); }
function setVal(id, v){ const el=$(id); if(el) el.value = v || ""; }
function normNum(v){
  const m = String(v ?? "").trim().match(/\d{1,3}/);
  return m ? String(Number(m[0])) : "";
}
function songTitle(num){
  const n = normNum(num);
  return n ? (cancionesMap.get(n) || "") : "";
}
function lineForBosquejo(){
  const n = ultimoBosquejoConsultado || normNum($("consultaBosquejo")?.value);
  const t = (ultimoTituloConsultado || $("consultaTitulo")?.value || "").trim();
  if(!n) return "";
  return t ? `${n} - ${t}` : n;
}
function appendLineToTextarea(textareaId){
  const line = lineForBosquejo();
  const box = $(textareaId);
  if(!line || !box){ toast("Primero escribí un número de bosquejo.", true); return; }
  const n = ultimoBosquejoConsultado || normNum($("consultaBosquejo")?.value);
  const lines = String(box.value || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const exists = lines.some(x => normNum(x) === n);
  if(!exists) lines.push(line);
  box.value = lines.join("\n");
  toast(exists ? "Ese bosquejo ya estaba en la lista." : "Bosquejo agregado. No olvides guardar el perfil.");
}
async function getTituloBosquejo(num){
  const n = normNum(num);
  if(!n) return "";
  const local = bosquejosMap.get(n) || "";
  try{
    const snap = await getDoc(doc(db, "discursos", n));
    if(snap.exists()){
      const d = snap.data() || {};
      return String(d.titulo || d.nombre || local || "").trim();
    }
  }catch(e){
    // Si Firestore no permite leer el catálogo, se usa la lista local incluida en la app.
  }
  return String(local || "").trim();
}
function extractSongNumbers(data){
  const nums = [];
  const direct = ["cancion", "cancionNumero", "cancionDiscurso", "cancionPublica", "cancionInicial", "cancionEspecial"];
  for(const key of direct){
    const v = data?.[key];
    if(v === undefined || v === null || v === "") continue;
    const found = String(v).match(/\d{1,3}/g) || [];
    nums.push(...found.map(x=>String(Number(x))).filter(Boolean));
  }
  for(const [key, value] of Object.entries(data || {})){
    const k = String(key).toLowerCase();
    if(!k.includes("cancion") || k.includes("titulo")) continue;
    if(value === undefined || value === null || value === "") continue;
    const found = String(value).match(/\d{1,3}/g) || [];
    nums.push(...found.map(x=>String(Number(x))).filter(Boolean));
  }
  return Array.from(new Set(nums));
}
function dataBosquejo(data){
  const keys = ["bosquejo", "numeroBosquejo", "numBosquejo", "discurso", "discursoNumero", "numeroDiscurso", "nroDiscurso"];
  for(const k of keys){
    const n = normNum(data?.[k]);
    if(n) return n;
  }
  return "";
}
async function cancionesElegidasPorBosquejo(num){
  const n = normNum(num);
  if(!n) return [];
  const out = new Map();
  try{
    const discSnap = await getDoc(doc(db, "discursos", n));
    if(discSnap.exists()){
      const d = discSnap.data() || {};
      for(const song of extractSongNumbers(d)){
        const key = String(song);
        const info = out.get(key) || { num:key, titulo:songTitle(key), usos:[] };
        info.usos.push({ fuente:"Catálogo de discursos", fecha:"" });
        out.set(key, info);
      }
    }
  }catch(e){}
  const sources = [
    { name:"visitas", label:"Visitantes" },
    { name:"asignaciones", label:"Asignaciones" },
    { name:"salientes", label:"Salientes" }
  ];
  for(const src of sources){
    try{
      const snap = await getDocs(collection(db, src.name));
      snap.forEach(docu=>{
        const d = docu.data() || {};
        if(dataBosquejo(d) !== n) return;
        for(const song of extractSongNumbers(d)){
          const key = String(song);
          const info = out.get(key) || { num:key, titulo:songTitle(key), usos:[] };
          const fecha = d.fecha || d.fechaISO || docu.id || "";
          info.usos.push({ fuente:src.label, fecha:String(fecha) });
          out.set(key, info);
        }
      });
    }catch(e){
      // Puede fallar por permisos en modo lectura. No bloquea la consulta del título.
    }
  }
  return Array.from(out.values()).sort((a,b)=>Number(a.num)-Number(b.num));
}
function renderCancionesConsulta(num, cancionesEncontradas, cargando=false){
  const box = $("consultaCanciones");
  if(!box) return;
  const n = normNum(num);
  if(!n){
    box.innerHTML = "Ingresá un número de bosquejo para ver las canciones elegidas.";
    return;
  }
  if(cargando){
    box.innerHTML = `<b>Canciones elegidas:</b><br><span class="muted">Buscando historial del bosquejo ${escapeHtml(n)}…</span>`;
    return;
  }
  if(!cancionesEncontradas.length){
    box.innerHTML = `<b>Canciones elegidas:</b><br><span class="muted">Todavía no hay canciones cargadas en el historial para el bosquejo ${escapeHtml(n)}.</span>`;
    return;
  }
  box.innerHTML = `<b>Canciones elegidas para el bosquejo ${escapeHtml(n)}:</b>
    <div class="grid" style="gap:8px; margin-top:8px;">
      ${cancionesEncontradas.map(c=>`
        <div class="card mini" style="box-shadow:none; padding:10px; border-radius:12px;">
          <b>Canción ${escapeHtml(c.num)}</b>${c.titulo ? ` - ${escapeHtml(c.titulo)}` : ""}
          <div class="small muted">${escapeHtml(c.usos.slice(0,4).map(u=>`${u.fuente}${u.fecha ? " · " + u.fecha : ""}`).join(" | "))}${c.usos.length>4 ? ` | +${c.usos.length-4} más` : ""}</div>
        </div>`).join("")}
    </div>`;
}
async function actualizarConsultaBosquejo(){
  const n = normNum($("consultaBosquejo")?.value);
  ultimoBosquejoConsultado = n;
  ultimoTituloConsultado = "";
  setVal("consultaTitulo", "");
  renderCancionesConsulta(n, [], !!n);
  if(!n) return;
  const title = await getTituloBosquejo(n);
  if(ultimoBosquejoConsultado !== n) return;
  ultimoTituloConsultado = title;
  setVal("consultaTitulo", title || "No encontré título para ese número");
  const songs = await cancionesElegidasPorBosquejo(n);
  if(ultimoBosquejoConsultado !== n) return;
  renderCancionesConsulta(n, songs);
}
function setupConsultaBosquejo(){
  const input = $("consultaBosquejo");
  if(!input) return;
  input.addEventListener("input", ()=>{
    clearTimeout(consultaTimer);
    consultaTimer = setTimeout(actualizarConsultaBosquejo, 300);
  });
  input.addEventListener("change", actualizarConsultaBosquejo);
  $("btnAgregarTiene")?.addEventListener("click", ()=>appendLineToTextarea("discursosTiene"));
  $("btnAgregarPreparar")?.addEventListener("click", ()=>appendLineToTextarea("discursosPreparar"));
}

let CURRENT = null;
let TARGET_UID = null;

function fillForm(data, user){
  setVal("nombreCompleto", data?.nombreCompleto || data?.nombre || user?.displayName || "");
  setVal("emailPerfil", data?.email || (TARGET_UID === user.uid ? (user?.email || "") : ""));
  setVal("telefono", data?.telefono || data?.telefonoPerfil || "");
  setVal("responsabilidad", data?.responsabilidad || data?.privilegio || "");
  setVal("discursosTiene", data?.discursosTiene || data?.discursosAsignados || "");
  setVal("discursosPreparar", data?.discursosPreparar || "");
  setVal("observacionesPerfil", data?.observacionesPerfil || "");
  const modo = $("modoPerfil");
  if(modo) modo.textContent = TARGET_UID === user.uid ? "Mi perfil" : "Editando perfil";
}

async function loadTarget(user, usuario){
  const params = new URLSearchParams(location.search);
  const requested = params.get("uid");
  const isAdmin = isAdminRole(usuario?.rol);
  TARGET_UID = (isAdmin && requested) ? requested : user.uid;
  const snap = await getDoc(doc(db,"usuarios",TARGET_UID));
  CURRENT = snap.exists() ? snap.data() : {};
  fillForm(CURRENT, user);
}

async function saveProfile(ev){
  ev.preventDefault();
  const nombreCompleto = val("nombreCompleto");
  const email = val("emailPerfil");
  const telefono = val("telefono");
  const responsabilidad = val("responsabilidad");
  const discursosTiene = val("discursosTiene");
  const discursosPreparar = val("discursosPreparar");
  const observacionesPerfil = val("observacionesPerfil");

  if(!nombreCompleto){ toast("Completá nombre y apellido.", true); return; }

  const btn = $("btnGuardarPerfil");
  try{
    if(btn){ btn.disabled=true; btn.textContent="Guardando…"; }
    await setDoc(doc(db,"usuarios",TARGET_UID), {
      nombre: nombreCompleto,
      nombreCompleto,
      email: email || CURRENT?.email || "",
      telefono,
      responsabilidad,
      discursosTiene,
      discursosPreparar,
      observacionesPerfil,
      perfilDiscursante: true,
      perfilActualizadoEn: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge:true });
    toast("Perfil guardado ✅");
  }catch(e){
    console.error(e);
    toast("No pude guardar el perfil. Revisá permisos de Firestore.", true);
  }finally{
    if(btn){ btn.disabled=false; btn.textContent="Guardar perfil"; }
  }
}

(async function(){
  const { user, usuario } = await requireActiveUser();
  await loadTarget(user, usuario);
  setupConsultaBosquejo();
  $("formPerfil")?.addEventListener("submit", saveProfile);
})();
