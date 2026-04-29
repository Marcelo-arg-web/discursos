import { auth } from "../firebase-config.js";
import { verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { sendPasswordRecoveryEmail, recoveryOkMessage } from "../shared/password-reset.js";

const $ = (id)=>document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
const code = params.get("oobCode");

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
}

function showRequestNew(email=""){
  $("formNuevaClave").style.display = "none";
  $("pedirNuevo").style.display = "block";
  $("resetIntro").textContent = "El enlace venció, ya fue usado o no es válido. Pedí uno nuevo.";
  if(email) $("emailPedirNuevo").value = email;
}

async function init(){
  if(mode !== "resetPassword" || !code){
    showRequestNew();
    return;
  }

  try{
    const email = await verifyPasswordResetCode(auth, code);
    $("emailReset").value = email;
    $("emailPedirNuevo").value = email;
    $("resetIntro").textContent = "Escribí una contraseña nueva para este usuario.";
    $("formNuevaClave").style.display = "block";
    $("pedirNuevo").style.display = "none";
  }catch(e){
    console.error(e);
    showRequestNew();
  }
}

$("formNuevaClave")?.addEventListener("submit", async (ev)=>{
  ev.preventDefault();
  const p1 = $("nuevaClave").value || "";
  const p2 = $("repetirClave").value || "";
  if(p1.length < 6){ toast("La contraseña debe tener al menos 6 caracteres.", true); return; }
  if(p1 !== p2){ toast("Las contraseñas no coinciden.", true); return; }

  try{
    $("btnGuardarClave").disabled = true;
    $("btnGuardarClave").textContent = "Guardando…";
    await confirmPasswordReset(auth, code, p1);
    toast("Clave cambiada correctamente. Ya podés ingresar.");
    $("formNuevaClave").style.display = "none";
    $("resetIntro").textContent = "La contraseña fue actualizada.";
    setTimeout(()=>{ window.location.href = "index.html"; }, 1800);
  }catch(e){
    console.error(e);
    toast("No pude cambiar la clave. El enlace puede estar vencido o ya usado. Pedí uno nuevo.", true);
    showRequestNew($("emailReset").value || "");
  }finally{
    $("btnGuardarClave").disabled = false;
    $("btnGuardarClave").textContent = "Guardar nueva clave";
  }
});

$("btnPedirNuevo")?.addEventListener("click", async ()=>{
  const email = ($("emailPedirNuevo").value || "").trim();
  if(!email){ toast("Escribí el correo para enviar un enlace nuevo.", true); return; }
  try{
    $("btnPedirNuevo").disabled = true;
    $("btnPedirNuevo").textContent = "Enviando…";
    const result = await sendPasswordRecoveryEmail(auth, email);
    toast(recoveryOkMessage(email, result));
  }catch(e){
    console.error(e);
    toast("No pude enviar otro enlace. Revisá que el correo exista y que haya conexión.", true);
  }finally{
    $("btnPedirNuevo").disabled = false;
    $("btnPedirNuevo").textContent = "Enviar enlace nuevo";
  }
});

init();
