import { auth, db, firebaseConfig } from "../firebase-config.js";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Acomodadores</a>
        <a href="tablero-multimedia.html" class="${active==='multimedia'?'active':''}">Multimedia</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
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

async function listUsuarios(){
  const tbody = $("tbodyUsuarios");
  if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="muted">Cargando…</td></tr>`;
  const qy = query(collection(db, "usuarios"), orderBy("nombre"));
  const snap = await getDocs(qy);
  const rows = [];
  snap.forEach((d)=>{
    const u = d.data();
    rows.push({ id:d.id, ...u });
  });

  const qtxt = String($("q")?.value||"").trim().toLowerCase();
  const filtered = qtxt ? rows.filter(r=> (String(r.nombre||"").toLowerCase().includes(qtxt) || String(r.email||"").toLowerCase().includes(qtxt))) : rows;

  if(!tbody) return;
  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay usuarios.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u=>{
    const activo = !!u.activo;
    return `
      <tr>
        <td>${escapeHtml(u.nombre||"—")}</td>
        <td>${escapeHtml(u.email||"—")}</td>
        <td><span class="badge">${escapeHtml(u.rol||"usuario")}</span></td>
        <td>${activo ? "sí" : "no"}</td>
        <td>
          <button class="btn ${activo?"":"ok"}" data-action="toggle" data-id="${u.id}" data-activo="${activo}">${activo?"Desactivar":"Activar"}</button>
          <button class="btn" data-action="reset" data-email="${escapeHtml(u.email||"")}">Reset clave</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("button[data-action='toggle']").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-id");
      const activo = btn.getAttribute("data-activo") === "true";
      try{
        await updateDoc(doc(db,"usuarios",id), { activo: !activo });
        toast(!activo ? "Usuario activado ✅" : "Usuario desactivado ✅");
        await listUsuarios();
      }catch(e){
        console.error(e);
        toast("No se pudo actualizar (revisá permisos)", true);
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

async function createUserSecondary({nombre, email, password, rol, activo}){
  // Crear usuario en un auth separado para NO cerrar la sesión del admin actual.
  const secondaryApp = initializeApp(firebaseConfig, "secondary");
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
  const form = $("formAlta");
  const btnCrear = $("btnCrear");

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
