import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return;
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " err" : "");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>el.remove(), 4200);
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}


let _deferredInstallPrompt = null;
function initPWAInstall(){
  const btn = document.getElementById("pwaInstallBtn");
  if(!btn) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if(isStandalone){ btn.classList.remove("show"); return; }

  if(!window.__pwa_install_listener){
    window.__pwa_install_listener = true;
    window.addEventListener("beforeinstallprompt", (e)=>{
      e.preventDefault();
      _deferredInstallPrompt = e;
      const b = document.getElementById("pwaInstallBtn");
      if(b) b.classList.add("show");
    });
  }

  btn.addEventListener("click", async ()=>{
    if(!_deferredInstallPrompt){
      alert("En Android: abrí el menú del navegador y tocá “Agregar a pantalla de inicio”.");
      return;
    }
    _deferredInstallPrompt.prompt();
    try{ await _deferredInstallPrompt.userChoice; }catch(_){}
    _deferredInstallPrompt = null;
    btn.classList.remove("show");
  });
}

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;

  const linksAdmin = [
    ["panel.html","panel","Panel"],
    ["asignaciones.html","asignaciones","Asignaciones"],
    ["programa-mensual.html","programa","Programa mensual"],
    ["tablero-acomodadores.html","acomodadores","Acomodadores"],
    ["tablero-multimedia.html","multimedia","Multimedia"],
    ["visitantes.html","visitantes","Visitantes"],
    ["salientes.html","salientes","Salientes"],
    ["personas.html","personas","Personas"],
    ["discursantes.html","discursantes","Discursantes"],
    ["estadisticas.html","estadisticas","Estadísticas"],
    ["doc-presi.html","docpresi","Visitas/Salidas"],
    ["imprimir.html","imprimir","Imprimir"],
    ["importar.html","importar","Importar"],
    ["usuarios.html","usuarios","Usuarios"],
  ];

  const linksUser = [
    ["programa-mensual.html","programa","Asignaciones mensuales"],
    ["visitantes.html","visitantes","Discursantes visitantes"],
    ["salientes.html","salientes","Discursantes salientes"],
  ];

  const links = (isAdmin ? linksAdmin : linksUser)
    .map(([href,key,label]) => `<a href="${href}" class="${active===key?'active':''}">${label}</a>`)
    .join("");

  el.innerHTML = `
    <div class="topbar" id="topbarShell">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>

      <button class="nav-toggle" id="navToggle" aria-label="Menú">☰</button>

      <div class="links" id="navLinks">
        ${links}
      </div>

      <div class="actions">
        <button class="btn pwa-install" id="pwaInstallBtn" type="button">Instalar</button>
        <button class="btn ghost" id="btnLogout" type="button">Salir</button>
      </div>
    </div>
  `;

  const shell = document.getElementById("topbarShell");
  const toggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  if(toggle && shell){
    toggle.addEventListener("click", ()=> shell.classList.toggle("open"));
  }
  if(navLinks && shell){
    navLinks.addEventListener("click", (e)=>{
      const a = e.target?.closest?.("a");
      if(a) shell.classList.remove("open");
    });
  }

  const btnLogout = document.getElementById("btnLogout");
  if(btnLogout){
    btnLogout.addEventListener("click", async ()=>{
      try{ await signOut(auth); }catch(_){}
      window.location.href = "public-login.html";
    });
  }

  initPWAInstall();
}


async function requireActiveUser(){
  renderTopbar("importar");
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      resolve({ user, usuario:u });
    });
  });
}

(async function(){
  await requireActiveUser();
  toast("Elegí una opción de importación.");
})();
