import { setPublicAccess } from "../services/publicAccess.js";

const $ = (id)=>document.getElementById(id);

function msg(t, isErr=false){
  const el = $("publicLoginMsg");
  if(!el) return;
  el.textContent = t;
  el.style.color = isErr ? "#b3261e" : "";
}

function norm(s){ return String(s||"").trim(); }

$("btnLoginPublic").addEventListener("click", ()=>{
  const u = norm($("vfUser").value);
  const p = norm($("vfPass").value);

  // Credenciales genéricas (solo lectura)
  if(u === "VillaFiad" && p === "@2026"){
    setPublicAccess(true);
    msg("Acceso concedido. Redirigiendo...");
    window.location.href = "public-home.html"; // puerta de entrada práctica
    return;
  }
  msg("Usuario o contraseña incorrectos.", true);
});

$("btnClearPublic").addEventListener("click", ()=>{
  $("vfUser").value = "";
  $("vfPass").value = "";
  msg("");
});

document.addEventListener("keydown", (e)=>{
  if(e.key === "Enter") $("btnLoginPublic").click();
});
