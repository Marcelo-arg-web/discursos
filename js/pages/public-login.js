import { setPublicAccess } from "../services/publicAccess.js";

const $ = (id)=>document.getElementById(id);

function msg(t, isErr=false){
  const el = $("publicLoginMsg");
  if(!el) return;
  el.textContent = t;
  el.style.color = isErr ? "#b3261e" : "";
}

function norm(s){ return String(s||"").trim(); }

function setupPasswordToggle(buttonId, inputId){
  const btn = $(buttonId);
  const input = $(inputId);
  if(!btn || !input) return;
  btn.addEventListener("click", ()=>{
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Ocultar" : "Ver";
    btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    try{ input.focus({ preventScroll:true }); }catch(e){ input.focus(); }
  });
}

setupPasswordToggle("btnTogglePublicPassword", "vfPass");

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
