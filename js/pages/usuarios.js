import { auth, db, firebaseConfig } from "../firebase-config.js";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { sendPasswordRecoveryEmail, recoveryOkMessage } from "../shared/password-reset.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 5000);
}

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}
function isSuperadmin(rol){
  return String(rol||"").toLowerCase() === "superadmin";
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
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        <a href="programa-mensual.html" class="${active==='programa'?'active':''}">Programa mensual</a>
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Asignaciones Villa Fiad</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="funciones.html" class="${active==='personas'?'active':''}">Funciones</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>
      </div>
      <div class="actions">
        <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch(e){}
    window.location.href = "index.html";
  });
}


function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

async function requireActiveUser(activePage){
  ensureTopbarStyles();

  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      renderTopbar(activePage, u?.rol);
      resolve({ user, usuario:u });
    });
  });
}

function sanitizePhone(phone){
  // WhatsApp wa.me necesita solo dígitos y código país. Para AR: 54...
  return String(phone||"").replace(/\D/g, "");
}
function boolValue(v){
  return v === true || String(v || "").toLowerCase() === "true" || String(v || "").toLowerCase() === "sí" || String(v || "").toLowerCase() === "si";
}

let CURRENT_IS_SUPERADMIN = false;
function displayName(u){
  return String(u?.nombreCompleto || u?.nombre || u?.displayName || u?.email || u?.id || "Sin nombre").trim();
}
function displayEmail(u){
  return String(u?.email || u?.correo || "").trim();
}

async function listUsuarios(){
  const tbody = $("tbodyUsuarios");
  const status = $("usuariosStatus");
  if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="muted">Cargando…</td></tr>`;
  if(status) status.textContent = "Leyendo todos los perfiles guardados en Firestore…";

  let rows = [];
  try{
    // No usamos orderBy("nombre"): Firestore excluye documentos sin ese campo.
    // Así aparecen también perfiles antiguos o incompletos que tengan nombreCompleto, email o solo UID.
    const snap = await getDocs(collection(db, "usuarios"));
    snap.forEach((d)=> rows.push({ id:d.id, ...(d.data() || {}) }));
  }catch(e){
    console.error(e);
    if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="muted">No pude leer /usuarios. Revisá permisos.</td></tr>`;
    if(status) status.textContent = "Error al leer perfiles.";
    return;
  }

  rows.sort((a,b)=>displayName(a).localeCompare(displayName(b), "es", {sensitivity:"base"}));

  const qtxt = String($("q")?.value||"").trim().toLowerCase();
  const filtered = qtxt ? rows.filter(r=> ([displayName(r), displayEmail(r), r.id, r.rol, r.responsabilidad, r.privilegio, r.congregacionPerfil].join(" ").toLowerCase().includes(qtxt))) : rows;

  if(status){
    const incompletos = rows.filter(r=>!r.nombre && !r.nombreCompleto).length;
    status.textContent = `Perfiles encontrados en Firestore: ${rows.length}. Mostrando: ${filtered.length}${incompletos ? ` · ${incompletos} sin nombre cargado` : ""}.`;
  }

  if(!tbody) return;
  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No hay usuarios/perfiles para mostrar.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u=>{
    const activo = !!u.activo;
    const aprobado = boolValue(u.aprobadoSalida || u.aprobadoParaSalir);
    const soloLocal = boolValue(u.soloLocalmente || u.soloLocal);
    const nombre = displayName(u);
    const email = displayEmail(u) || "—";
    const superActions = CURRENT_IS_SUPERADMIN ? `<button class="btn danger" data-action="borrarRegistro" data-id="${u.id}" data-nombre="${escapeHtml(nombre)}">Borrar registro</button>` : "";
    return `
      <tr>
        <td>${escapeHtml(nombre)}${(!u.nombre && !u.nombreCompleto) ? `<br/><span class="muted small">Sin nombre cargado</span>` : ""}</td>
        <td>${escapeHtml(email)}</td>
        <td><span class="badge">${escapeHtml(u.rol||"viewer")}</span></td>
        <td>${activo ? "sí" : "no"}</td>
        <td>
          <label class="inline-check"><input type="checkbox" data-action="aprobadoSalida" data-id="${u.id}" ${aprobado?"checked":""}/> Aprobado salida</label><br/>
          <label class="inline-check"><input type="checkbox" data-action="soloLocalmente" data-id="${u.id}" ${soloLocal?"checked":""}/> Solo local</label>
        </td>
        <td>
          <button class="btn ${activo?"":"ok"}" data-action="toggle" data-id="${u.id}" data-activo="${activo}">${activo?"Desactivar":"Activar"}</button>
          <button class="btn" data-action="perfil" data-id="${u.id}">Cambiar perfil</button>
          <button class="btn danger" data-action="eliminarPerfil" data-id="${u.id}" data-nombre="${escapeHtml(nombre)}">Eliminar perfil</button>
          ${superActions}
          <button class="btn" data-action="reset" data-id="${u.id}" data-email="${escapeHtml(displayEmail(u))}">Enviar reset</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("button[data-action='toggle']").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-id");
      const activo = btn.getAttribute("data-activo") === "true";
      try{
        await setDoc(doc(db,"usuarios",id), { activo: !activo, updatedAt: serverTimestamp() }, { merge:true });
        toast(!activo ? "Usuario activado ✅" : "Usuario desactivado ✅");
        await listUsuarios();
      }catch(e){
        console.error(e);
        toast("No se pudo actualizar (revisá permisos)", true);
      }
    });
  });

  tbody.querySelectorAll("input[data-action='aprobadoSalida']").forEach(chk=>{
    chk.addEventListener("change", async ()=>{
      const id = chk.getAttribute("data-id");
      try{
        await setDoc(doc(db,"usuarios",id), {
          aprobadoSalida: chk.checked,
          aprobadoParaSalir: chk.checked,
          perfilActualizadoEn: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge:true });
        toast(chk.checked ? "Aprobado para salir ✅" : "Aprobación para salir quitada.");
      }catch(e){
        console.error(e);
        toast("No se pudo actualizar aprobación.", true);
        chk.checked = !chk.checked;
      }
    });
  });

  tbody.querySelectorAll("input[data-action='soloLocalmente']").forEach(chk=>{
    chk.addEventListener("change", async ()=>{
      const id = chk.getAttribute("data-id");
      try{
        await setDoc(doc(db,"usuarios",id), {
          soloLocalmente: chk.checked,
          soloLocal: chk.checked,
          perfilActualizadoEn: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge:true });
        toast(chk.checked ? "Marcado como solo local." : "Ya puede aparecer en PDF externo si está aprobado.");
      }catch(e){
        console.error(e);
        toast("No se pudo actualizar solo local.", true);
        chk.checked = !chk.checked;
      }
    });
  });

  tbody.querySelectorAll("button[data-action='perfil']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-id");
      if(id) window.location.href = `perfil.html?uid=${encodeURIComponent(id)}`;
    });
  });

  tbody.querySelectorAll("button[data-action='eliminarPerfil']").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-id");
      const nombre = btn.getAttribute("data-nombre") || "este usuario";
      if(!id) return;
      if(!confirm(`¿Eliminar el perfil de discursante de ${nombre}?\n\nSe mantiene el usuario y su acceso, pero se quitan teléfono, privilegio, congregación, bosquejos, observaciones y aprobación para salir.`)) return;
      try{
        btn.disabled = true;
        btn.textContent = "Eliminando…";
        await setDoc(doc(db,"usuarios",id), {
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
          soloLocal: false,
          perfilActualizadoEn: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge:true });
        toast("Perfil eliminado. El usuario sigue activo si no lo desactivás.");
        await listUsuarios();
      }catch(e){
        console.error(e);
        toast("No pude eliminar el perfil. Revisá permisos de administrador.", true);
        btn.disabled = false;
        btn.textContent = "Eliminar perfil";
      }
    });
  });

  tbody.querySelectorAll("button[data-action='borrarRegistro']").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-id");
      const nombre = btn.getAttribute("data-nombre") || "este registro";
      if(!id || !CURRENT_IS_SUPERADMIN) return;
      if(!confirm(`¿Borrar el registro de Firestore de ${nombre}?\n\nEsto quita el documento /usuarios/${id}. No borra la cuenta de Firebase Authentication, pero ese usuario ya no podrá entrar hasta que se le cree otro perfil.`)) return;
      if(!confirm("Confirmá una segunda vez: ¿borrar definitivamente este registro de /usuarios?")) return;
      try{
        btn.disabled = true;
        btn.textContent = "Borrando…";
        await deleteDoc(doc(db,"usuarios",id));
        toast("Registro de Firestore borrado.");
        await listUsuarios();
      }catch(e){
        console.error(e);
        toast("No pude borrar el registro. Solo superadmin puede hacerlo.", true);
        btn.disabled = false;
        btn.textContent = "Borrar registro";
      }
    });
  });

  tbody.querySelectorAll("button[data-action='reset']").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const email = String(btn.getAttribute("data-email") || "").trim();
      const id = String(btn.getAttribute("data-id") || "").trim();
      if(!email){ toast("Ese usuario no tiene email cargado.", true); return; }
      if(!confirm(`Enviar un enlace NUEVO para restablecer la clave a:\n${email}?\n\nImportante: debe usar el último correo recibido. Si pidió varios, los anteriores pueden quedar vencidos.`)) return;
      try{
        btn.disabled = true;
        btn.textContent = "Enviando…";
        const result = await sendPasswordRecoveryEmail(auth, email);
        if(id){
          await setDoc(doc(db,"usuarios",id), {
            resetSolicitadoEn: serverTimestamp(),
            resetSolicitadoPor: auth.currentUser?.email || "admin"
          }, { merge:true });
        }
        toast(recoveryOkMessage(email, result));
      }catch(e){
        console.error(e);
        const code = String(e?.code || e?.message || "").toLowerCase();
        if(code.includes("user-not-found")) toast("Ese correo figura en /usuarios, pero no existe en Authentication.", true);
        else if(code.includes("too-many-requests")) toast("Firebase bloqueó temporalmente los envíos por seguridad. Esperá unos minutos y volvé a intentar.", true);
        else toast("No pude enviar el correo de recuperación. Revisá que el usuario exista en Authentication y que el dominio esté autorizado.", true);
      }finally{
        btn.disabled = false;
        btn.textContent = "Enviar reset";
      }
    });
  });
}
function escapeHtml(s){
  return String(s||"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#039;");
}


async function linkExistingAuthProfile({uid, nombre, email, rol, activo}){
  uid = String(uid || "").trim();
  email = String(email || "").trim().toLowerCase();
  nombre = String(nombre || "").trim() || email;
  rol = String(rol || "viewer").trim() || "viewer";
  if(!uid || uid.length < 10) throw new Error("UID incompleto");
  if(!email || !email.includes("@")) throw new Error("Email inválido");

  await setDoc(doc(db, "usuarios", uid), {
    uid,
    nombre,
    nombreCompleto: nombre,
    email,
    rol,
    activo: !!activo,
    congregacionPerfil: "Villa Fiad",
    perfilDiscursante: true,
    vinculadoDesdeAuth: true,
    vinculadoEn: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge:true });
}

async function createUserSecondary({nombre, email, password, rol, activo}){
  // Crear usuario en un auth separado para NO cerrar la sesión del admin actual.
  const secondaryApp = getApps().some(app => app.name === "secondary")
    ? getApp("secondary")
    : initializeApp(firebaseConfig, "secondary");
  const secondaryAuth = getAuth(secondaryApp);

  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;

  await setDoc(doc(db, "usuarios", uid), {
    nombre,
    email,
    rol,
    activo,
    creadoEn: new Date()
  }, { merge: true });

  await signOut(secondaryAuth);
  return uid;
}

(async function(){
  const { usuario } = await requireActiveUser("usuarios");
  if(!isAdminRole(usuario?.rol)){
    toast("No tenés permisos para ver esta página.", true);
    window.location.href = "panel.html";
    return;
  }

  const canCreate = isSuperadmin(usuario?.rol);
  CURRENT_IS_SUPERADMIN = canCreate;
  const form = $("formAlta");
  const formVincular = $("formVincularAuth");
  const btnCrear = $("btnCrear");
  const btnVincular = $("btnVincularAuth");

  if(!canCreate){
    if(btnCrear) btnCrear.disabled = true;
    toast("Solo superadmin puede crear usuarios.");
  }

  $("btnLimpiar")?.addEventListener("click", ()=>{
    form?.reset();
  });

  $("btnRefrescar")?.addEventListener("click", async ()=>{
    await listUsuarios();
  });

  formVincular?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const uid = $("vincularUid")?.value?.trim();
    const email = $("vincularEmail")?.value?.trim();
    const nombre = $("vincularNombre")?.value?.trim();
    const rol = $("vincularRol")?.value || "viewer";
    const activo = $("vincularActivo")?.value === "true";

    if(!uid || !email){ toast("Pegá el UID completo y el email del usuario registrado en Authentication.", true); return; }
    try{
      if(btnVincular){ btnVincular.disabled = true; btnVincular.textContent = "Vinculando…"; }
      await linkExistingAuthProfile({uid, nombre, email, rol, activo});
      toast("Perfil creado en /usuarios. Ahora debería aparecer en la lista ✅");
      formVincular.reset();
      await listUsuarios();
    }catch(err){
      console.error(err);
      toast("No pude vincular ese usuario. Revisá UID, email y permisos de administrador.", true);
    }finally{
      if(btnVincular){ btnVincular.disabled = false; btnVincular.textContent = "Crear perfil para ese UID"; }
    }
  });

  form?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!canCreate){ toast("Solo superadmin puede crear usuarios.", true); return; }

    const nombre = $("nombre")?.value?.trim();
    const email = $("email")?.value?.trim();
    const password = $("password")?.value;
    const rol = $("rol")?.value;
    const activo = $("activo")?.value === "true";

    if(!nombre || !email || !password){ toast("Completá nombre, email y contraseña", true); return; }

    try{
      btnCrear.disabled = true;
      btnCrear.textContent = "Creando...";
      const uid = await createUserSecondary({nombre, email, password, rol, activo});
      toast(`Usuario creado ✅ (uid: ${uid})`);
      form.reset();
      await listUsuarios();
    }catch(err){
      console.error(err);
      const msg = String(err?.message||err);
      if(msg.includes("email-already-in-use")) toast("Ese email ya existe en Authentication.", true);
      else if(msg.includes("weak-password")) toast("Contraseña débil (mínimo 6).", true);
      else toast("Error al crear usuario (revisá consola F12).", true);
    }finally{
      btnCrear.disabled = false;
      btnCrear.textContent = "Crear usuario";
    }
  });

  await listUsuarios();
})();
