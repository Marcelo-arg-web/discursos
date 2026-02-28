import { signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

export function renderTopbar({ auth, active="panel", showAdminLinks=true }){
  const el = document.getElementById("topbar");
  if(!el) return;

  // links shown for admins (panel/asignaciones/personas/etc)
  const links = showAdminLinks ? `
    <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
    <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
    <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
    <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
    <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
    <a href="presidente.html" class="${active==='presidente'?'active':''}">Presidente</a>
    <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
    <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
  ` : ``;

  el.innerHTML = `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="brand"><span class="brand-dot"></span> Villa Fiad</div>
        <div class="nav">
          ${links}
          <button id="btnSalir" class="btn danger" type="button">Salir</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    await signOut(auth);
    window.location.href = "index.html";
  });
}