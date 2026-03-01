import { setPublicAccess } from "../services/publicAccess.js";

const $ = (id)=>document.getElementById(id);


function renderTopbarBasic(){
  const host = document.getElementById("topbar");
  if(!host) return;
  host.innerHTML = `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="brand">Villa Fiad</div>
        <nav class="nav">
          <a href="panel.html">Panel</a>
          <a href="asignaciones.html">Asignaciones</a>
          <a href="visitantes.html">Visitantes</a>
          <a href="salientes.html">Salientes</a>
          <a href="tablero-acomodadores.html">Tablero mensual</a>
        </nav>
        <button id="btnSalir" class="btn small">Salir</button>
      </div>
    </div>
  `;
}

renderTopbarBasic();
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
