import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { mountTopbar, requireAuth } from "./guard.js";
import { qs, toast } from "./utils.js";

mountTopbar("asignaciones");
const session = await requireAuth({ minRole:"viewer" });
const canEdit = session.canEdit;
if(!canEdit) toast("Modo solo lectura: no podés crear/editar asignaciones.", "err");

const $ = (id)=>qs(id);
const tbody = qs("#tbl tbody");

function setDomEnabled(){
  const on = $("#hayDom").value === "si";
  $("#fechaDom").disabled = !on;
  $("#horaDom").disabled = !on;
}
$("#hayDom").addEventListener("change", setDomEnabled);
setDomEnabled();

let personas = [];
// Cargamos personas para selects (solo activos)
import { onSnapshot as onSnapP, collection as colP, query as qP, orderBy as obP } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
onSnapP(qP(colP(db,"personas"), obP("nombre","asc")), (snap)=>{
  personas = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(p=>p.activo!==false);
  fillSelects();
});

function optHtml(list, placeholder="—"){
  return `<option value="">${placeholder}</option>` + list.map(p=>`<option value="${p.nombre}">${p.nombre}</option>`).join("");
}
function byRole(role){
  const r = role.toLowerCase();
  return personas.filter(p => (p.roles||[]).map(x=>String(x).toLowerCase()).includes(r));
}
function fillSelects(){
  $("#presidente").innerHTML = optHtml(byRole("presidente").length?byRole("presidente"):personas, "Seleccionar…");
  $("#plataforma").innerHTML = optHtml(byRole("plataforma").length?byRole("plataforma"):personas, "Seleccionar…");
  $("#micro1").innerHTML = optHtml(byRole("microfonista").length?byRole("microfonista"):personas, "Seleccionar…");
  $("#micro2").innerHTML = optHtml(byRole("microfonista").length?byRole("microfonista"):personas, "Seleccionar…");
  $("#acomodador").innerHTML = optHtml(byRole("acomodador").length?byRole("acomodador"):personas, "Seleccionar…");
  $("#audio").innerHTML = optHtml(byRole("audio").length?byRole("audio"):personas, "Seleccionar…");
  $("#video").innerHTML = optHtml(byRole("video").length?byRole("video"):personas, "Seleccionar…");
}

function getVal(id){ return ($(id).value||"").trim(); }

async function crear(){
  if(!canEdit) return;
  const fechaSab = getVal("#fechaSab");
  const horaSab = getVal("#horaSab") || "19:30";
  const hayDom = $("#hayDom").value === "si";
  const fechaDom = hayDom ? getVal("#fechaDom") : "";
  const horaDom = hayDom ? (getVal("#horaDom") || "10:00") : "";

  if(!fechaSab){ toast("Elegí la fecha del sábado.", "err"); return; }
  if(hayDom && !fechaDom){ toast("Elegí la fecha del domingo.", "err"); return; }

  const data = {
    fechaSab, horaSab,
    hayDom,
    fechaDom, horaDom,
    roles: {
      presidente: getVal("#presidente"),
      plataforma: getVal("#plataforma"),
      micro1: getVal("#micro1"),
      micro2: getVal("#micro2"),
      acomodador: getVal("#acomodador"),
      audio: getVal("#audio"),
      video: getVal("#video"),
    },
    notas: ($("#notas").value||"").trim(),
    creadoEn: serverTimestamp(),
    creadoPor: session.user.email || ""
  };

  try{
    await addDoc(collection(db,"asignaciones"), data);
    toast("Semana guardada.", "ok");
  }catch(e){
    toast("Error al guardar: " + (e?.message||e), "err");
  }
}

$("#btnCrear").addEventListener("click", crear);
$("#btnNuevo").addEventListener("click", ()=>{
  $("#fechaSab").value="";
  $("#horaSab").value="19:30";
  $("#hayDom").value="no";
  setDomEnabled();
  $("#fechaDom").value="";
  $("#horaDom").value="10:00";
  ["#presidente","#plataforma","#micro1","#micro2","#acomodador","#audio","#video"].forEach(id=>$(id).value="");
  $("#notas").value="";
});

let all = [];
function render(){
  const q = ($("#q").value||"").toLowerCase();
  const ord = $("#orden").value;
  const sorted = [...all].sort((a,b)=>{
    const da = a.fechaSab || "";
    const db = b.fechaSab || "";
    return ord==="asc" ? da.localeCompare(db) : db.localeCompare(da);
  });

  const rows = sorted.filter(x=>{
    const blob = JSON.stringify(x).toLowerCase();
    return blob.includes(q);
  });

  tbody.innerHTML = rows.map(x=>`
    <tr>
      <td>
        <b>Sáb ${x.fechaSab} ${x.horaSab||""}</b>
        ${x.hayDom ? `<div class="small muted">Dom ${x.fechaDom} ${x.horaDom||""}</div>` : `<div class="small muted">Sin domingo</div>`}
      </td>
      <td>
        <div class="small">
          <b>Pres:</b> ${x.roles?.presidente||"—"} ·
          <b>Plat:</b> ${x.roles?.plataforma||"—"} ·
          <b>Mic:</b> ${(x.roles?.micro1||"—")} / ${(x.roles?.micro2||"—")} ·
          <b>Acom:</b> ${x.roles?.acomodador||"—"} ·
          <b>A/V:</b> ${(x.roles?.audio||"—")} / ${(x.roles?.video||"—")}
        </div>
        ${x.notas ? `<div class="small muted">${x.notas}</div>` : ``}
      </td>
      <td class="no-print">
        ${canEdit ? `<button class="btn danger" data-id="${x.id}">Borrar</button>` : `<span class="muted small">Solo lectura</span>`}
      </td>
    </tr>
  `).join("");
}

$("#q").addEventListener("input", render);
$("#orden").addEventListener("change", render);

tbody.addEventListener("click", async (e)=>{
  const b = e.target.closest("button");
  if(!b || !canEdit) return;
  const id = b.dataset.id;
  if(!confirm("¿Borrar esta semana?")) return;
  try{
    await deleteDoc(doc(db,"asignaciones", id));
    toast("Borrado.", "ok");
  }catch(err){
    toast("Error: "+(err?.message||err), "err");
  }
});

onSnapshot(query(collection(db,"asignaciones"), orderBy("fechaSab","desc")), (snap)=>{
  all = snap.docs.map(d=>({id:d.id, ...d.data()}));
  render();
});
