import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { qs, toast } from "./utils.js";

function val(id){ return (qs(id).value || "").trim(); }

qs("#btnLogin").addEventListener("click", async ()=>{
  const email = val("#email");
  const password = val("#password");
  if(!email || !password){ toast("Completá correo y contraseña.", "err"); return; }
  try{
    await signInWithEmailAndPassword(auth, email, password);
    location.href = "panel.html";
  }catch(e){
    toast("No pude ingresar: " + (e?.message || e), "err");
  }
});

qs("#btnRegister").addEventListener("click", async ()=>{
  const email = val("#email");
  const password = val("#password");
  if(!email || !password){ toast("Completá correo y contraseña.", "err"); return; }
  if(password.length < 6){ toast("La contraseña debe tener al menos 6 caracteres.", "err"); return; }

  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Documento de usuario pendiente de activación
    await setDoc(doc(db, "usuarios", uid), {
      email,
      nombre: email.split("@")[0],
      rol: "viewer",
      activo: false,
      creadoEn: serverTimestamp()
    }, { merge:true });

    toast("Registrado. Un admin debe activarte (activo=true).", "ok");
  }catch(e){
    toast("No pude registrar: " + (e?.message || e), "err");
  }
});

qs("#btnReset").addEventListener("click", async ()=>{
  const email = val("#email");
  if(!email){ toast("Escribí tu correo para enviarte el reset.", "err"); return; }
  try{
    await sendPasswordResetEmail(auth, email);
    toast("Listo: te envié un correo para restablecer la contraseña.", "ok");
  }catch(e){
    toast("No pude enviar el correo: " + (e?.message || e), "err");
  }
});
