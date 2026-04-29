import { auth, db } from "../firebase-config.js?v=20260429b71";
import { setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);
const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v]) => [String(k), String(v)]));
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
          <a href="documentos.html">Documentos/PDF</a>
          <a href="visitantes.html">Visitantes</a>
          <a href="salientes.html">Salientes</a>
          <a href="funciones.html">Funciones</a>
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
      try{ setPublicAccess(false); }catch{}
      let u = null;
      try{
        u = await getUsuario(user.uid);
      }catch(e){
        console.warn("No pude leer /usuarios del usuario actual en Perfil", e);
        u = { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _readError:true };
      }
      if(u && u.activo === false){ await signOut(auth); location.href="index.html"; return; }
      if(!u){
        u = { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _missingProfile:true };
      }
      renderTopbar(u?.rol, u?.nombre || user.email);
      resolve({ user, usuario:u });
    });
  });
}
function val(id){ return ($(id)?.value || "").trim(); }
function setVal(id, v){ const el=$(id); if(el) el.value = v || ""; }
function setChecked(id, v){ const el=$(id); if(el) el.checked = !!v; }
function isChecked(id){ return !!$(id)?.checked; }
function normNum(v){
  const m = String(v ?? "").trim().match(/\d{1,3}/);
  return m ? String(Number(m[0])) : "";
}
async function getTituloBosquejo(num){
  const n = normNum(num);
  if(!n) return "";
  const local = bosquejosMap.get(n) || "";
  try{
    const snap = await getDoc(doc(db, "discursos", n));
    if(snap.exists()){
      const d = snap.data() || {};
      if(d.deleted || d.eliminado) return "";
      return String(d.titulo || d.nombre || local || "").trim();
    }
  }catch(e){
    // Si Firestore no permite leer el catálogo, se usa la lista local incluida en la app.
  }
  return String(local || "").trim();
}
async function actualizarConsultaBosquejo(){
  const input = $("consultaBosquejo");
  const n = normNum(input?.value);
  if(input && input.value !== n) input.value = n;
  ultimoBosquejoConsultado = n;
  ultimoTituloConsultado = "";
  setVal("consultaTitulo", "");
  if(!n) return;
  setVal("consultaTitulo", "Buscando título…");
  const title = await getTituloBosquejo(n);
  if(ultimoBosquejoConsultado !== n) return;
  ultimoTituloConsultado = title;
  setVal("consultaTitulo", title || "No encontré título para ese número");
}
function setupConsultaBosquejo(){
  const input = $("consultaBosquejo");
  if(!input) return;
  input.addEventListener("input", ()=>{
    input.value = input.value.replace(/\D/g, "").slice(0,3);
    clearTimeout(consultaTimer);
    consultaTimer = setTimeout(actualizarConsultaBosquejo, 250);
  });
  input.addEventListener("change", actualizarConsultaBosquejo);
}


let perfilBosquejos = [];
let perfilBosquejoSeleccionado = "";

function normalizarBosquejoItem(item){
  if(!item) return null;
  if(typeof item === "string"){
    const m = item.trim().match(/^(\d{1,3})\s*[-–—:.]?\s*(.*)$/);
    if(!m) return null;
    return { num:String(Number(m[1])), titulo:String(m[2]||"").trim() };
  }
  const num = normNum(item.num || item.numero || item.bosquejo || item.id);
  if(!num) return null;
  return { num, titulo:String(item.titulo || item.nombre || item.title || "").trim() };
}
function parseLegacyBosquejos(text){
  return String(text || "").split(/\r?\n/).map(normalizarBosquejoItem).filter(Boolean);
}
function normalizarListaBosquejos(data){
  let arr = [];
  if(Array.isArray(data?.perfilBosquejos)) arr = data.perfilBosquejos.map(normalizarBosquejoItem).filter(Boolean);
  else if(Array.isArray(data?.bosquejosPerfil)) arr = data.bosquejosPerfil.map(normalizarBosquejoItem).filter(Boolean);
  else arr = parseLegacyBosquejos(data?.discursosTiene);
  const seen = new Set();
  return arr.filter(x=>{
    if(seen.has(x.num)) return false;
    seen.add(x.num);
    return true;
  }).sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0));
}
function setPerfilBosquejoForm(num="", titulo=""){
  setVal("perfilBosquejoNum", num);
  setVal("perfilBosquejoTitulo", titulo);
  perfilBosquejoSeleccionado = num || "";
}
function limpiarPerfilBosquejoForm(){
  setPerfilBosquejoForm("", "");
  $("perfilBosquejoNum")?.focus();
}
function renderPerfilBosquejos(){
  const wrap = $("listaPerfilBosquejos");
  if(!wrap) return;
  const rows = [...perfilBosquejos].sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0));
  wrap.innerHTML = `
    <table class="table perfil-speeches-table">
      <thead><tr><th style="width:90px;">N°</th><th>Título</th><th style="width:120px;">Acción</th></tr></thead>
      <tbody>
        ${rows.map(x=>`
          <tr>
            <td style="font-family:var(--mono);">${escapeHtml(x.num)}</td>
            <td>${escapeHtml(x.titulo || "")}</td>
            <td><button class="btn sm" type="button" data-editar-perfil-bosquejo="${escapeHtml(x.num)}">Editar</button></td>
          </tr>
        `).join("") || `<tr><td colspan="3" class="muted">Todavía no hay bosquejos cargados en este perfil.</td></tr>`}
      </tbody>
    </table>`;
  wrap.querySelectorAll("[data-editar-perfil-bosquejo]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const n = btn.getAttribute("data-editar-perfil-bosquejo");
      const item = perfilBosquejos.find(x=>String(x.num)===String(n));
      setPerfilBosquejoForm(item?.num || n, item?.titulo || "");
      $("perfilBosquejoTitulo")?.focus();
    });
  });
}
async function completarTituloPerfilBosquejo(){
  const n = normNum(val("perfilBosquejoNum"));
  setVal("perfilBosquejoNum", n);
  if(!n) return;
  const existing = perfilBosquejos.find(x=>String(x.num)===String(n));
  if(existing && !val("perfilBosquejoTitulo")) setVal("perfilBosquejoTitulo", existing.titulo || "");
  if(!val("perfilBosquejoTitulo")){
    const title = await getTituloBosquejo(n);
    if(title) setVal("perfilBosquejoTitulo", title);
  }
}
async function guardarPerfilBosquejoItem(){
  const num = normNum(val("perfilBosquejoNum"));
  let titulo = val("perfilBosquejoTitulo");
  if(!num){ toast("Escribí el número del bosquejo.", true); return; }
  if(!titulo) titulo = await getTituloBosquejo(num);
  if(!titulo){ toast("Escribí el título del bosquejo.", true); return; }
  const idx = perfilBosquejos.findIndex(x=>String(x.num)===String(num));
  const item = { num, titulo };
  if(idx >= 0) perfilBosquejos[idx] = item;
  else perfilBosquejos.push(item);
  perfilBosquejoSeleccionado = num;
  renderPerfilBosquejos();
  setPerfilBosquejoForm(num, titulo);
  toast("Bosquejo agregado al perfil. Recordá tocar Guardar perfil.");
}
function eliminarPerfilBosquejoItem(){
  const num = normNum(val("perfilBosquejoNum") || perfilBosquejoSeleccionado);
  if(!num){ toast("Elegí un bosquejo del perfil para eliminar.", true); return; }
  perfilBosquejos = perfilBosquejos.filter(x=>String(x.num)!==String(num));
  limpiarPerfilBosquejoForm();
  renderPerfilBosquejos();
  toast("Bosquejo quitado del perfil. Recordá tocar Guardar perfil.");
}
function setupPerfilBosquejos(){
  normalizarInputNumero("consultaBosquejo");
  normalizarInputNumero("perfilBosquejoNum");
  $("perfilBosquejoNum")?.addEventListener("change", completarTituloPerfilBosquejo);
  $("btnGuardarPerfilBosquejo")?.addEventListener("click", guardarPerfilBosquejoItem);
  $("btnNuevoPerfilBosquejo")?.addEventListener("click", limpiarPerfilBosquejoForm);
  $("btnEliminarPerfilBosquejo")?.addEventListener("click", eliminarPerfilBosquejoItem);
  $("btnUsarConsultaPerfil")?.addEventListener("click", async()=>{
    await actualizarConsultaBosquejo();
    const num = normNum(val("consultaBosquejo"));
    const titulo = ultimoTituloConsultado || val("consultaTitulo");
    if(!num || !titulo || titulo.includes("No encontré")){ toast("Primero ingresá un número de bosquejo válido.", true); return; }
    setPerfilBosquejoForm(num, titulo);
    await guardarPerfilBosquejoItem();
  });
  renderPerfilBosquejos();
}

let catalogoBosquejos = [];
let esAdminActual = false;

function setBosquejoAdminForm(num="", titulo=""){
  setVal("bosquejoNumAdmin", num);
  setVal("bosquejoTituloAdmin", titulo);
}
function limpiarBosquejoAdmin(){
  setBosquejoAdminForm("", "");
  const n = $("bosquejoNumAdmin");
  if(n) n.focus();
}
function normalizarInputNumero(id){
  const input = $(id);
  if(!input) return;
  input.addEventListener("input", ()=>{
    input.value = input.value.replace(/\D/g, "").slice(0,3);
  });
}
async function cargarCatalogoBosquejos(){
  const status = $("bosquejosAdminStatus");
  const wrap = $("listaBosquejosAdmin");
  if(!esAdminActual || !wrap) return;
  if(status) status.textContent = "Cargando bosquejos…";
  try{
    const snap = await getDocs(collection(db, "discursos"));
    const borrados = new Set();
    catalogoBosquejos = snap.docs.map(d=>({ id:d.id, ...(d.data() || {}) }))
      .filter(x=>{
        const n = String(x.num || x.id || "").trim();
        if(x.deleted || x.eliminado){ if(n) borrados.add(String(Number(n))); return false; }
        return true;
      })
      .map(x=>({ num:String(x.num || x.id || "").trim(), titulo:String(x.titulo || x.nombre || "").trim() }))
      .filter(x=>x.num);
    const usados = new Set(catalogoBosquejos.map(x=>String(Number(x.num))));
    for(const [num, titulo] of bosquejosMap.entries()){
      const n = String(Number(num));
      if(!usados.has(n) && !borrados.has(n)) catalogoBosquejos.push({ num:n, titulo:String(titulo||"").trim(), local:true });
    }
    catalogoBosquejos.sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0));
    renderCatalogoBosquejos();
    if(status) status.textContent = `Bosquejos cargados: ${catalogoBosquejos.length}.`;
  }catch(e){
    console.error(e);
    catalogoBosquejos = Array.from(bosquejosMap.entries()).map(([num,titulo])=>({ num:String(Number(num)), titulo:String(titulo||""), local:true }));
    catalogoBosquejos.sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0));
    renderCatalogoBosquejos();
    if(status) status.textContent = "No pude leer Firestore. Mostrando catálogo local de respaldo.";
  }
}
function renderCatalogoBosquejos(){
  const wrap = $("listaBosquejosAdmin");
  if(!wrap) return;
  const term = val("buscarBosquejoAdmin").toLowerCase();
  const rows = catalogoBosquejos.filter(x=>{
    if(!term) return true;
    return String(x.num).includes(term) || String(x.titulo||"").toLowerCase().includes(term);
  }).slice(0, 300);
  wrap.innerHTML = `
    <table class="table">
      <thead>
        <tr><th style="width:90px;">N°</th><th>Título</th><th style="width:110px;">Acción</th></tr>
      </thead>
      <tbody>
        ${rows.map(x=>`
          <tr>
            <td style="font-family:var(--mono);">${escapeHtml(x.num)}</td>
            <td>${escapeHtml(x.titulo || "")} ${x.local ? '<span class="pill">base</span>' : ''}</td>
            <td><button class="btn sm" type="button" data-editar-bosquejo="${escapeHtml(x.num)}">Editar</button></td>
          </tr>
        `).join("") || `<tr><td colspan="3" class="muted">Sin bosquejos para mostrar.</td></tr>`}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll("[data-editar-bosquejo]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const n = btn.getAttribute("data-editar-bosquejo");
      const item = catalogoBosquejos.find(x=>String(x.num)===String(n));
      setBosquejoAdminForm(item?.num || n, item?.titulo || "");
      $("bosquejoTituloAdmin")?.focus();
    });
  });
}
async function guardarBosquejoAdmin(){
  if(!esAdminActual) return;
  const num = normNum(val("bosquejoNumAdmin"));
  const titulo = val("bosquejoTituloAdmin");
  if(!num){ toast("Escribí el número del bosquejo.", true); return; }
  if(!titulo){ toast("Escribí el título del discurso.", true); return; }
  const btn = $("btnGuardarBosquejo");
  try{
    if(btn){ btn.disabled = true; btn.textContent = "Guardando…"; }
    await setDoc(doc(db, "discursos", num), {
      num, titulo, deleted:false, eliminado:false, actualizadoEn: serverTimestamp()
    }, { merge:true });
    bosquejosMap.set(num, titulo);
    ultimoBosquejoConsultado = "";
    if(val("consultaBosquejo") === num) await actualizarConsultaBosquejo();
    await cargarCatalogoBosquejos();
    setBosquejoAdminForm(num, titulo);
    toast("Bosquejo guardado ✅");
  }catch(e){
    console.error(e);
    toast("No pude guardar el bosquejo. Revisá permisos de administrador.", true);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = "Guardar"; }
  }
}
async function eliminarBosquejoAdmin(){
  if(!esAdminActual) return;
  const num = normNum(val("bosquejoNumAdmin"));
  if(!num){ toast("Elegí un bosquejo para eliminar.", true); return; }
  if(!confirm(`¿Eliminar el bosquejo ${num}?`)) return;
  const btn = $("btnEliminarBosquejo");
  try{
    if(btn){ btn.disabled = true; btn.textContent = "Eliminando…"; }
    await setDoc(doc(db, "discursos", num), {
      num, titulo:"", deleted:true, eliminado:true, actualizadoEn: serverTimestamp()
    }, { merge:true });
    bosquejosMap.delete(num);
    if(val("consultaBosquejo") === num){ setVal("consultaTitulo", ""); }
    limpiarBosquejoAdmin();
    await cargarCatalogoBosquejos();
    toast("Bosquejo eliminado.");
  }catch(e){
    console.error(e);
    toast("No pude eliminar el bosquejo. Revisá permisos de administrador.", true);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = "Eliminar"; }
  }
}
function setupAdminBosquejos(isAdmin){
  esAdminActual = !!isAdmin;
  const box = $("adminBosquejosBox");
  if(box) box.style.display = esAdminActual ? "" : "none";
  if(!esAdminActual) return;
  normalizarInputNumero("bosquejoNumAdmin");
  $("btnGuardarBosquejo")?.addEventListener("click", guardarBosquejoAdmin);
  $("btnEliminarBosquejo")?.addEventListener("click", eliminarBosquejoAdmin);
  $("btnNuevoBosquejo")?.addEventListener("click", limpiarBosquejoAdmin);
  $("btnRecargarBosquejos")?.addEventListener("click", cargarCatalogoBosquejos);
  $("buscarBosquejoAdmin")?.addEventListener("input", renderCatalogoBosquejos);
  $("bosquejoNumAdmin")?.addEventListener("change", async()=>{
    const n = normNum(val("bosquejoNumAdmin"));
    setVal("bosquejoNumAdmin", n);
    if(!n) return;
    const item = catalogoBosquejos.find(x=>String(x.num)===String(n));
    if(item) setVal("bosquejoTituloAdmin", item.titulo || "");
  });
  cargarCatalogoBosquejos();
}

let CURRENT = null;
let TARGET_UID = null;

function fillForm(data, user){
  setVal("nombreCompleto", data?.nombreCompleto || data?.nombre || user?.displayName || "");
  setVal("emailPerfil", data?.email || (TARGET_UID === user.uid ? (user?.email || "") : ""));
  setVal("telefono", data?.telefono || data?.telefonoPerfil || "");
  setVal("responsabilidad", data?.responsabilidad || data?.privilegio || "");
  setVal("congregacionPerfil", data?.congregacionPerfil || data?.congregacion || "Villa Fiad");
  setChecked("aprobadoSalida", data?.aprobadoSalida === true || data?.aprobadoParaSalir === true);
  setChecked("soloLocalmente", data?.soloLocalmente === true || data?.soloLocal === true);
  perfilBosquejos = normalizarListaBosquejos(data);
  renderPerfilBosquejos();
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

async function eliminarPerfilDiscursanteAdmin(){
  if(!esAdminActual || !TARGET_UID){ toast("Solo el administrador puede eliminar perfiles.", true); return; }
  const nombre = val("nombreCompleto") || CURRENT?.nombre || CURRENT?.email || "este usuario";
  if(!confirm(`¿Eliminar el perfil de discursante de ${nombre}?

Se mantiene el usuario y su acceso, pero se quitan teléfono, privilegio, congregación, bosquejos, observaciones y aprobación para salir.`)) return;
  const btn = $("btnEliminarPerfilAdmin");
  try{
    if(btn){ btn.disabled = true; btn.textContent = "Eliminando…"; }
    await updateDoc(doc(db,"usuarios",TARGET_UID), {
      telefono: "",
      telefonoPerfil: deleteField(),
      responsabilidad: "",
      privilegio: deleteField(),
      congregacionPerfil: "Villa Fiad",
      perfilBosquejos: [],
      bosquejosPerfil: deleteField(),
      discursosTiene: deleteField(),
      discursosQuierePreparar: deleteField(),
      observacionesPerfil: "",
      perfilDiscursante: false,
      aprobadoSalida: false,
      aprobadoParaSalir: false,
      soloLocalmente: false,
      soloLocal: deleteField(),
      perfilActualizadoEn: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    CURRENT = { ...(CURRENT || {}), telefono:"", responsabilidad:"", congregacionPerfil:"Villa Fiad", perfilBosquejos:[], observacionesPerfil:"", perfilDiscursante:false, aprobadoSalida:false, aprobadoParaSalir:false, soloLocalmente:false };
    perfilBosquejos = [];
    setVal("telefono", "");
    setVal("responsabilidad", "");
    setVal("congregacionPerfil", "Villa Fiad");
    setChecked("aprobadoSalida", false);
    setChecked("soloLocalmente", false);
    setVal("observacionesPerfil", "");
    renderPerfilBosquejos();
    toast("Perfil de discursante eliminado. El usuario sigue existiendo.");
  }catch(e){
    console.error(e);
    toast("No pude eliminar el perfil. Revisá permisos de administrador.", true);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = "Eliminar perfil de discursante"; }
  }
}

async function saveProfile(ev){
  ev.preventDefault();
  const nombreCompleto = val("nombreCompleto");
  const email = val("emailPerfil");
  const telefono = val("telefono");
  const responsabilidad = val("responsabilidad");
  const congregacionPerfil = val("congregacionPerfil") || "Villa Fiad";
  const observacionesPerfil = val("observacionesPerfil");

  if(!nombreCompleto){ toast("Completá nombre y apellido.", true); return; }

  const data = {
    nombre: nombreCompleto,
    nombreCompleto,
    email: email || CURRENT?.email || "",
    telefono,
    responsabilidad,
    congregacionPerfil,
    perfilBosquejos,
    observacionesPerfil,
    perfilDiscursante: true,
    perfilActualizadoEn: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if(esAdminActual){
    data.aprobadoSalida = isChecked("aprobadoSalida");
    data.aprobadoParaSalir = isChecked("aprobadoSalida");
    data.soloLocalmente = isChecked("soloLocalmente");
  }

  const btn = $("btnGuardarPerfil");
  try{
    if(btn){ btn.disabled=true; btn.textContent="Guardando…"; }
    await setDoc(doc(db,"usuarios",TARGET_UID), data, { merge:true });
    CURRENT = { ...(CURRENT || {}), ...data };
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
  setupPerfilBosquejos();
  setupAdminBosquejos(isAdminRole(usuario?.rol));
  $("btnEliminarPerfilAdmin")?.addEventListener("click", eliminarPerfilDiscursanteAdmin);
  $("formPerfil")?.addEventListener("submit", saveProfile);
})();
