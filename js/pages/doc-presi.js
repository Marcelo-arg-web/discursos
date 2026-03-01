import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand">Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Doc Presidente</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", ()=>signOut(auth));
}

async function requireActiveUser(){
  renderTopbar("docpresi");
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

function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

function monthRange(ym){
  // ym: YYYY-MM
  const [y,m]=ym.split("-").map(Number);
  if(!y||!m) return null;
  const start = `${y}-${String(m).padStart(2,"0")}-01`;
  const dt = new Date(y, m, 0); // last day of month
  const end = `${y}-${String(m).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  return { start, end };
}

async function loadForMonth(ym){
  const rng = monthRange(ym);
  if(!rng) return { visitas:[], salientes:[] };

  // Visitas: doc id = fecha ISO (YYYY-MM-DD). Filtramos por id.
  const visitasSnap = await getDocs(collection(db,"visitas"));
  const visitas = visitasSnap.docs
    .map(d=>({ id:d.id, ...d.data() }))
    .filter(v=>v.id >= rng.start && v.id <= rng.end)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)));

  // Salientes: filtramos por campo fecha
  const salSnap = await getDocs(query(collection(db,"salientes"), orderBy("fecha","asc")));
  const salientes = salSnap.docs
    .map(d=>({ id:d.id, ...d.data() }))
    .filter(s=>(s.fecha||"") >= rng.start && (s.fecha||"") <= rng.end)
    .sort((a,b)=>String(a.fecha||"").localeCompare(String(b.fecha||"")));

  return { visitas, salientes, rng };
}

function renderDoc(ym, visitas, salientes, rng){
  const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v])=>[Number(k), String(v)]));
  const monthTitle = ym ? ym : "";

  const visitasHtml = visitas.length ? `
    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Visitante</th>
          <th>Congregación</th>
          <th>Bosquejo</th>
          <th>Título</th>
          <th>Hospitalidad</th>
        </tr>
      </thead>
      <tbody>
        ${visitas.map(v=>{
          const b = Number(v.bosquejo);
          const titulo = v.titulo || (Number.isFinite(b)? bosquejosMap.get(b) : "") || "";
          return `<tr>
            <td>${escapeHtml(v.id)}</td>
            <td>${escapeHtml(v.nombre||"")}</td>
            <td>${escapeHtml(v.congregacion||"")}</td>
            <td>${escapeHtml(v.bosquejo ?? "")}</td>
            <td>${escapeHtml(titulo)}</td>
            <td>${escapeHtml(v.hospitalidad||"")}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  ` : `<div class="muted">No hay visitantes cargados en este mes.</div>`;

  const salientesHtml = salientes.length ? `
    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Orador</th>
          <th>Destino</th>
          <th>Bosquejo</th>
          <th>Título</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${salientes.map(s=>{
          const b = Number(s.bosquejo);
          const titulo = Number.isFinite(b) ? (bosquejosMap.get(b)||"") : "";
          return `<tr>
            <td>${escapeHtml(s.fecha||"")}</td>
            <td>${escapeHtml(s.orador||"")}</td>
            <td>${escapeHtml(s.destino||"")}</td>
            <td>${escapeHtml(s.bosquejo ?? "")}</td>
            <td>${escapeHtml(titulo)}</td>
            <td>${escapeHtml(s.notas||"")}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  ` : `<div class="muted">No hay salientes cargados en este mes.</div>`;

  $("contenido").innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:baseline;">
      <div>
        <div class="h1" style="margin:0;">Villa Fiad</div>
        <div class="muted">Documento del Presidente · ${escapeHtml(monthTitle)}</div>
      </div>
      <div class="small muted">Rango: ${escapeHtml(rng.start)} a ${escapeHtml(rng.end)}</div>
    </div>

    <hr class="sep"/>

    <div class="h2">Visitantes</div>
    ${visitasHtml}

    <div style="height:14px"></div>

    <div class="h2">Salientes</div>
    ${salientesHtml}
  `;
}

(async function(){
  await requireActiveUser();

  const mesEl = $("mes");
  // default: mes actual
  const dt = new Date();
  mesEl.value = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;

  $("btnPrint")?.addEventListener("click", ()=>window.print());
  $("btnGenerar")?.addEventListener("click", async ()=>{
    const ym = mesEl.value;
    $("contenido").innerHTML = `<div class="muted">Cargando…</div>`;
    try{
      const { visitas, salientes, rng } = await loadForMonth(ym);
      renderDoc(ym, visitas, salientes, rng);
    }catch(e){
      console.error(e);
      $("contenido").innerHTML = `<div class="muted"><b>Error cargando.</b> Revisá consola y permisos.</div>`;
    }
  });
})();
