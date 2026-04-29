import { db } from "./firebase.js?v=20260429b70";
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { mountTopbar, requireAuth } from "./guard.js";
import { qs, toast } from "./utils.js";

mountTopbar("discursantes");
const session = await requireAuth({ minRole:"viewer" });
const canEdit = session.canEdit;

if(!canEdit) toast("Modo solo lectura: no podés modificar.", "err");

const $ = (id)=>qs(id);
const tbody = qs("#tbl tbody");

function getVal(id){ return ($(id).value||"").trim(); }

function makeMessage(v){
  const tipo = v.tipo === "salida" ? "Salida" : "Visita";
  const fecha = v.fecha || "—";
  const hora = v.hora || "—";
  const tel = v.telefono ? ` (Tel: ${v.telefono})` : "";
  const notas = v.notas ? `\n\nNotas: ${v.notas}` : "";
  if(v.tipo === "salida"){
    return `Hola ${v.nombre || ""}. Te escribo por la salida programada.\n\n📌 ${tipo}\n📍 Congregación: ${v.congregacion||"—"}\n🗓️ Fecha: ${fecha}\n🕒 Hora: ${hora}${tel}${notas}\n\nGracias por la colaboración.`;
  }
  return `Hola ${v.nombre || ""}. Te escribo por la visita programada a Villa Fiad.\n\n📌 ${tipo}\n📍 Congregación: ${v.congregacion||"—"}\n🗓️ Fecha: ${fecha}\n🕒 Hora: ${hora}${tel}${notas}\n\nGracias.`;
}

async function guardar(){
  if(!canEdit) return;
  const nombre = getVal("#v_nombre");
  const congregacion = getVal("#v_cong");
  const telefono = getVal("#v_tel");
  const tipo = getVal("#v_tipo") || "visitante";
  const fecha = getVal("#v_fecha");
  const hora = getVal("#v_hora") || "";
  const notas = getVal("#v_notas");

  if(!nombre){ toast("Falta el nombre.", "err"); return; }
  if(!fecha){ toast("Falta la fecha.", "err"); return; }

  try{
    await addDoc(collection(db,"visitas"), {
      nombre, congregacion, telefono, tipo, fecha, hora, notas,
      creadoEn: serverTimestamp(),
      creadoPor: session.user.email || ""
    });
    toast("Guardado.", "ok");
  }catch(e){
    toast("Error: "+(e?.message||e), "err");
  }
}

$("#btnGuardar").addEventListener("click", guardar);

$("#btnMsg").addEventListener("click", ()=>{
  const v = {
    nombre:getVal("#v_nombre"),
    congregacion:getVal("#v_cong"),
    telefono:getVal("#v_tel"),
    tipo:getVal("#v_tipo"),
    fecha:getVal("#v_fecha"),
    hora:getVal("#v_hora"),
    notas:getVal("#v_notas"),
  };
  $("#msg").value = makeMessage(v);
  $("#msg").focus();
  $("#msg").select();
  toast("Mensaje generado (copiar/pegar).", "ok");
});

let all = [];
function render(){
  const q = ($("#q").value||"").toLowerCase();
  const rows = all.filter(x => JSON.stringify(x).toLowerCase().includes(q));
  tbody.innerHTML = rows.map(x=>`
    <tr>
      <td>
        <b>${x.nombre||""}</b> <span class="pill">${x.tipo||"visitante"}</span>
        <div class="small muted">${x.congregacion||"—"} · ${x.fecha||"—"} ${x.hora||""}</div>
        ${x.notas?`<div class="small">${x.notas}</div>`:""}
      </td>
      <td class="no-print">
        <button class="btn" data-act="msg" data-id="${x.id}">Mensaje</button>
        ${canEdit?`<button class="btn danger" data-act="del" data-id="${x.id}">Borrar</button>`:`<span class="muted small">Solo lectura</span>`}
      </td>
    </tr>
  `).join("");
}

$("#q").addEventListener("input", render);

tbody.addEventListener("click", async (e)=>{
  const b = e.target.closest("button");
  if(!b) return;
  const id = b.dataset.id;
  const act = b.dataset.act;
  const v = all.find(x=>x.id===id);
  if(act==="msg"){
    $("#msg").value = makeMessage(v||{});
    $("#msg").focus();
    $("#msg").select();
    toast("Mensaje generado.", "ok");
  }
  if(act==="del"){
    if(!canEdit) return;
    if(!confirm("¿Borrar este registro?")) return;
    try{
      await deleteDoc(doc(db,"visitas", id));
      toast("Borrado.", "ok");
    }catch(err){
      toast("Error: "+(err?.message||err), "err");
    }
  }
});

onSnapshot(query(collection(db,"visitas"), orderBy("fecha","desc")), (snap)=>{
  all = snap.docs.map(d=>({id:d.id, ...d.data()}));
  render();
});
