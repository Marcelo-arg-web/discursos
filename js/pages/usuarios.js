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

function renderTopbar(active, rol){
  const el = document.getElementById("topbar");
  if(!el) return;
  const admin = isAdminRole(rol);
  const superadmin = isSuperadmin(rol);
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        ${admin ? `<a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>` : ``}
        ${admin ? `<a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>` : ``}
        ${admin ? `<a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>` : ``}
        ${admin ? `<a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>` : ``}
        ${admin ? `<a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>` : ``}
        ${admin ? `<a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>` : ``}
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        ${admin ? `<a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>` : ``}
        ${superadmin ? `<a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>` : ``}
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
    window.location.href = "index.html";
  });

  tbody.querySelectorAll("button[data-action='reset']").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const email = btn.getAttribute("data-email");
      if(!email){ toast("Este usuario no tiene email.", true); return; }
      try{
        await sendPasswordResetEmail(auth, email, { url: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/index.html') });
        toast("Enviado ✅ Revisá Spam si no llega.");
      }catch(e){
        console.error(e);
        const msg = (e && e.code === "auth/user-not-found") ? "No existe ese email en Authentication." : "No se pudo enviar el email (revisá configuración de Auth).";
        toast(msg, true);
      }
    });
  });
}

function ensureTopbarStyles(){
  if(document.getElementById("topbarStyle")) return;
  const s = document.createElement("style");
  s.id="topbarStyle";
  s.textContent = `
    .topbar{display:flex;justify-content:space-between;align-items:center;gap:14px;
      background:#1a4fa3;color:#fff;padding:10px 14px;border-radius:14px;margin:14px auto;max-width:1100px;}
    .topbar .brand{font-weight:800}
    .topbar .links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .topbar a{color:#fff;text-decoration:none;font-weight:700;font-size:13px;opacity:.92}
    .topbar a.active{text-decoration:underline;opacity:1}
    .topbar .btn.danger{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}
  `;
  document.head.appendChild(s);
}

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
