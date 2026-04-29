import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id)=>document.getElementById(id);

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
          <a href="visitantes.html">Visitantes</a>
          <a href="salientes.html">Salientes</a>
          <a href="programa-mensual.html">Programa mensual</a>
          <a href="tablero-acomodadores.html">Acomodadores</a>
          <a href="doc-presi.html">Presidente</a>
          <a href="imprimir.html">Descargar/PDF</a>
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
  $("formPerfil")?.addEventListener("submit", saveProfile);
})();
