import { requirePublicAccess, setPublicAccess } from "../services/publicAccess.js";

if(!requirePublicAccess()) {
  // redirige dentro de requirePublicAccess
}

document.getElementById("btnSalirPublico")?.addEventListener("click", ()=>{
  setPublicAccess(false);
  window.location.href = "index.html";
});
