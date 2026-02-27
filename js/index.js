import { auth, db } from "./firebase-config.js";
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

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 5000);
}

async function ensureUsuarioDoc(user){
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, {
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

async function entrar(){
  const email = ($("email").value || "").trim();
  const password = $("password").value || "";
  if(!email || !password) return toast("Completá correo y contraseña.", true);

  try{
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const u = await ensureUsuarioDoc(cred.user);
    if(!u?.activo){
      await signOut(auth);
      toast("Tu usuario todavía no está activo. Pedile a un admin que te habilite.", true);
      return;
    }
    window.location.href = "panel.html";
  }catch(e){
    console.error(e);
    toast("No pude iniciar sesión. Revisá correo/contraseña o conexión.", true);
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
      email,
      nombre: email,
      rol: "viewer",
      activo: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge:true });
    await signOut(auth);
    toast("Registrado. Un admin debe activarte (activo=false).");
  }catch(e){
    console.error(e);
    toast("No pude registrar. Tal vez el correo ya existe.", true);
  }
}

async function reset(){
  const email = ($("email").value || "").trim();
  if(!email) return toast("Escribí tu correo primero.", true);
  try{
    await sendPasswordResetEmail(auth, email);
    toast("Te envié un correo para restablecer la contraseña.");
  }catch(e){
    console.error(e);
    toast("No pude enviar el correo de restablecimiento.", true);
  }
}

onAuthStateChanged(auth, async (user)=>{
  if(user){
    try{
      const u = await ensureUsuarioDoc(user);
      if(u?.activo){
        window.location.href = "panel.html";
      }else{
        await signOut(auth);
      }
    }catch(_){}
  }
});

$("btnLogin")?.addEventListener("click", entrar);
$("btnRegister")?.addEventListener("click", registrar);
$("btnReset")?.addEventListener("click", reset);