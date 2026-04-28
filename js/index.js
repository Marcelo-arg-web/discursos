import { auth, db } from "./firebase-config.js";
import { allowedUids } from "./data/allowedUids.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// Recuperación segura: solo funciona si Firebase Auth acepta correo y contraseña.
// No saltea la contraseña; únicamente repara el documento /usuarios del administrador si quedó desactivado o faltante.
const ADMIN_RECOVERY_EMAILS = [
  "marceyyesituc@gmail.com"
];

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 6500);
}

function isUidAllowed(uid){
  return Array.isArray(allowedUids) && allowedUids.length > 0 ? allowedUids.includes(uid) : true;
}

function isRecoveryAdmin(user){
  const email = String(user?.email || "").trim().toLowerCase();
  return ADMIN_RECOVERY_EMAILS.includes(email);
}

function isActiveValue(v){
  if(v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return ["true", "si", "sí", "activo", "1", "yes"].includes(s);
}

async function repairAdminUserDoc(user){
  const ref = doc(db, "usuarios", user.uid);
  await setDoc(ref, {
    uid: user.uid,
    email: user.email || "",
    nombre: "Marcelo Palavecino",
    rol: "superadmin",
    activo: true,
    recoveryFixedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : { activo:true, rol:"superadmin" };
}

async function ensureUsuarioDoc(user){
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  // Si el admin principal quedó sin documento o con activo=false por una actualización,
  // se repara automáticamente después de validar su contraseña real en Firebase Auth.
  if(isRecoveryAdmin(user)){
    if(!snap.exists() || !isActiveValue(snap.data()?.activo)){
      return await repairAdminUserDoc(user);
    }
    const data = snap.data();
    // Mantener correo/rol del admin principal en forma segura.
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || data.email || "",
      nombre: data.nombre || "Marcelo Palavecino",
      rol: data.rol || "superadmin",
      activo: true,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { ...data, activo:true };
  }

  if(!snap.exists()){
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || "",
      nombre: user.email || "",
      rol: "viewer",
      activo: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { activo:false, rol:"viewer" };
  }
  return snap.data();
}

function friendlyAuthError(e){
  const code = String(e?.code || "");
  if(code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")){
    return "El correo o la contraseña no coinciden. Si la clave fue cambiada, usá ‘Olvidé mi contraseña’.";
  }
  if(code.includes("too-many-requests")){
    return "Firebase bloqueó temporalmente los intentos por seguridad. Esperá unos minutos y volvé a probar.";
  }
  if(code.includes("network")){
    return "No hay conexión con Firebase. Revisá internet y volvé a intentar.";
  }
  if(code.includes("permission-denied")){
    return "La clave fue aceptada, pero no se pudo verificar el permiso. Probá de nuevo en unos segundos.";
  }
  return "No pude iniciar sesión. Revisá correo/contraseña o conexión.";
}

async function entrar(){
  const email = ($("email").value || "").trim();
  const password = $("password").value || "";
  if(!email || !password) return toast("Completá correo y contraseña.", true);

  try{
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if(!isUidAllowed(cred.user.uid)){
      await signOut(auth);
      toast("Tu usuario no está autorizado para ingresar. Hablá con un admin.", true);
      return;
    }

    const u = await ensureUsuarioDoc(cred.user);
    if(!isActiveValue(u?.activo)){
      await signOut(auth);
      toast("Tu usuario todavía no está activo. Pedile a un admin que te habilite.", true);
      return;
    }

    window.location.href = "panel.html";
  }catch(e){
    console.error(e);
    toast(friendlyAuthError(e), true);
  }
}

async function registrar(){
  const email = ($("email").value || "").trim();
  const password = $("password").value || "";
  if(!email || !password) return toast("Completá correo y contraseña.", true);
  if(password.length < 6) return toast("La contraseña debe tener al menos 6 caracteres.", true);

  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      uid: cred.user.uid,
      email,
      nombre: email,
      rol: "viewer",
      activo: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge:true });
    await signOut(auth);
    toast("Solicitud creada. Un administrador debe habilitar el acceso.");
  }catch(e){
    console.error(e);
    toast("No pude crear el acceso. Revisá el correo o usá otra contraseña.", true);
  }
}

async function reset(){
  const email = ($("email").value || "").trim();
  if(!email) return toast("Escribí tu correo primero.", true);
  try{
    await sendPasswordResetEmail(auth, email);
    toast("Te envié un correo para recuperar la contraseña.");
  }catch(e){
    console.error(e);
    toast("No pude enviar el correo de restablecimiento. Revisá que el correo esté bien escrito.", true);
  }
}

onAuthStateChanged(auth, async (user)=>{
  if(user){
    try{
      const u = await ensureUsuarioDoc(user);
      if(isActiveValue(u?.activo)){
        window.location.href = "panel.html";
      }else{
        await signOut(auth);
      }
    }catch(e){
      console.error(e);
      // No mostramos error en carga automática para no confundir; el botón Entrar da el detalle.
    }
  }
});

$("btnLogin")?.addEventListener("click", entrar);
$("password")?.addEventListener("keydown", (ev)=>{ if(ev.key === "Enter") entrar(); });
$("email")?.addEventListener("keydown", (ev)=>{ if(ev.key === "Enter") entrar(); });
$("btnRegister")?.addEventListener("click", registrar);
$("btnReset")?.addEventListener("click", reset);
