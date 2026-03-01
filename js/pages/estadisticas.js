import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

const $ = (id)=>document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host){ alert(msg); return; }
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " err" : "");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}

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
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <button id="btnSalir" class="btn danger" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", ()=>signOut(auth));
}

async function requireActiveUser(){
  renderTopbar("estadisticas");
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

function isoMinusMonths(isoToday, monthsBack){
  const [y,m,d]=isoToday.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setMonth(dt.getMonth() - monthsBack);
  const yy=dt.getFullYear();
  const mm=String(dt.getMonth()+1).padStart(2,"0");
  const dd=String(dt.getDate()).padStart(2,"0");
  return `${yy}-${mm}-${dd}`;
}

function nowISO(){
  const dt = new Date();
  const y=dt.getFullYear();
  const m=String(dt.getMonth()+1).padStart(2,"0");
  const d=String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function renderCounts(map){
  const rows = [...map.entries()].map(([bosquejo,cantidad])=>({ bosquejo, cantidad }));
  rows.sort((a,b)=>a.cantidad-b.cantidad);

  const bosquejosMap = new Map(Object.entries(bosquejos).map(([k,v])=>[Number(k), String(v)]));
  const tbody = $("tbody");
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="3" class="muted">Sin datos en el rango.</td></tr>`;
    $("menos").textContent="—";
    $("mas").textContent="—";
    return;
  }

  tbody.innerHTML = rows.map(r=>{
    const titulo = bosquejosMap.get(Number(r.bosquejo)) || "";
    return `<tr>
      <td>${r.bosquejo}</td>
      <td>${escapeHtml(titulo)}</td>
      <td>${r.cantidad}</td>
    </tr>`;
  }).join("");

  const menos = rows.slice(0,15);
  const mas = rows.slice(-15).reverse();

  $("menos").innerHTML = menos.map(r=>`<div><b>${r.bosquejo}</b> — ${escapeHtml(bosquejosMap.get(Number(r.bosquejo))||"")} <span class="muted">(${r.cantidad})</span></div>`).join("");
  $("mas").innerHTML = mas.map(r=>`<div><b>${r.bosquejo}</b> — ${escapeHtml(bosquejosMap.get(Number(r.bosquejo))||"")} <span class="muted">(${r.cantidad})</span></div>`).join("");
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

async function calcular(){
  const meses = Math.max(1, Number($("meses").value||12));
  const today = nowISO();
  const desde = isoMinusMonths(today, meses);

  try{
    const s = await getDocs(collection(db,"asignaciones"));
    const counts = new Map();

    s.docs.forEach(d=>{
      const id = d.id; // suele ser semana ISO
      if(id && id >= desde && id <= today){
        const data = d.data()?.asignaciones || d.data() || {};
        const num = data.discursoNumero ?? data.discurso ?? data.bosquejo ?? "";
        const n = Number(num);
        if(Number.isFinite(n) && n>0){
          counts.set(n, (counts.get(n)||0)+1);
        }
      }
    });

    renderCounts(counts);
    toast("Listo.");
  }catch(e){
    console.error(e);
    toast("No pude calcular. Revisá permisos / consola.", true);
  }
}

(async function(){
  await requireActiveUser();
  $("btnCalcular")?.addEventListener("click", calcular);
  $("btnRefrescar")?.addEventListener("click", calcular);
})();
