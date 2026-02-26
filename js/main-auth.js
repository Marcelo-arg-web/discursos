import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { roleFromEmail } from "./roles.js";
import { ensureUserDoc } from "./db.js";
import { $, toast } from "./utils.js";

const tabLogin = $("#tabLogin");
const tabRegister = $("#tabRegister");
const loginPane = $("#loginPane");
const registerPane = $("#registerPane");
const msg = $("#msg");

function setMsg(t){ msg.textContent = t || ""; }

function setTab(which){
  if(which === "login"){
    tabLogin.classList.add("active"); tabRegister.classList.remove("active");
    loginPane.classList.remove("hidden"); registerPane.classList.add("hidden");
  }else{
    tabRegister.classList.add("active"); tabLogin.classList.remove("active");
    registerPane.classList.remove("hidden"); loginPane.classList.add("hidden");
  }
  setMsg("");
}

tabLogin?.addEventListener("click", ()=>setTab("login"));
tabRegister?.addEventListener("click", ()=>setTab("register"));

$("#btnLogin")?.addEventListener("click", async ()=>{
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if(!email || !password) return setMsg("Completá correo y contraseña.");
  setMsg("Ingresando…");
  try{
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const roleFallback = roleFromEmail(cred.user.email || "");
    await ensureUserDoc(cred.user, roleFallback);
    location.href = "./app.html#/inicio";
  }catch(e){
    setMsg("Error: " + (e?.message || e));
  }
});

$("#btnRegister")?.addEventListener("click", async ()=>{
  const email = $("#regEmail").value.trim();
  const password = $("#regPassword").value;
  if(!email || !password) return setMsg("Completá correo y contraseña.");
  if(password.length < 6) return setMsg("La contraseña debe tener al menos 6 caracteres.");
  setMsg("Creando cuenta…");
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const roleFallback = roleFromEmail(cred.user.email || "");
    await ensureUserDoc(cred.user, roleFallback); // lector por defecto salvo whitelist
    toast("Cuenta creada. Entrando…");
    location.href = "./app.html#/inicio";
  }catch(e){
    setMsg("Error: " + (e?.message || e));
  }
});

$("#btnReset")?.addEventListener("click", async ()=>{
  const email = $("#email").value.trim();
  if(!email) return setMsg("Escribí tu correo primero.");
  setMsg("Enviando correo de recuperación…");
  try{
    await sendPasswordResetEmail(auth, email);
    setMsg("Listo. Revisá tu correo (y spam/no deseado).");
  }catch(e){
    setMsg("Error: " + (e?.message || e));
  }
});

onAuthStateChanged(auth, (user)=>{
  if(user){
    // si ya está logueado, directo al panel
    location.href = "./app.html#/inicio";
  }
});
