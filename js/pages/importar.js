import { db } from "../firebase.js";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { mountTopbar, requireAuth } from "../guard.js";
import { qs, toast } from "../utils.js";

mountTopbar("importar");
const session = await requireAuth({ minRole:"editor" }); // solo editores/admin
const $ = (id)=>qs(id);

let wb = null;
let rows = [];
let headers = [];

$("#file").addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f){ return; }
  const data = await f.arrayBuffer();
  wb = XLSX.read(data, { type:"array" });

  $("#sheet").innerHTML = wb.SheetNames.map(n=>`<option value="${n}">${n}</option>`).join("");
  $("#sheet").disabled = false;
  toast("Archivo cargado. Elegí hoja y hacé vista previa.", "ok");
});

function readSheet(){
  if(!wb) return [];
  const name = $("#sheet").value;
  const ws = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json(ws, { defval:"" });
  return json;
}

function renderPreview(){
  rows = readSheet();
  headers = rows.length ? Object.keys(rows[0]) : [];

  const thead = qs("#tbl thead");
  const tbody = qs("#tbl tbody");
  thead.innerHTML = `<tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>`;
  tbody.innerHTML = rows.slice(0,20).map(r=>`
    <tr>${headers.map(h=>`<td>${String(r[h]??"")}</td>`).join("")}</tr>
  `).join("");

  toast(`Vista previa lista: ${rows.length} filas.`, "ok");
}

$("#btnPreview").addEventListener("click", renderPreview);

function normDate(val){
  // acepta "2026-03-07", "07/03/2026" o número Excel
  if(typeof val === "number"){
    // XLSX date code: days since 1899-12-30
    const epoch = new Date(Date.UTC(1899,11,30));
    const d = new Date(epoch.getTime() + val*24*3600*1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const dd = String(d.getUTCDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(val||"").trim();
  if(!s) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const dd = String(m[1]).padStart(2,'0');
    const mm = String(m[2]).padStart(2,'0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return s; // último recurso
}

async function importRows(){
  rows = rows.length ? rows : readSheet();
  if(!rows.length){ toast("No hay filas para importar (hacé vista previa primero).", "err"); return; }

  let ok = 0, skip = 0, fail = 0;

  for(const r of rows){
    const fechaSab = normDate(r.fechaSab || r.FechaSab || r.FECHASAB || r.fecha || r.Fecha || "");
    if(!fechaSab){ fail++; continue; }

    // si ya existe esa fechaSab, saltear
    const exists = await getDocs(query(collection(db,"asignaciones"), where("fechaSab","==",fechaSab)));
    if(!exists.empty){ skip++; continue; }

    const docData = {
      fechaSab,
      horaSab: String(r.horaSab || r.HoraSab || r.hora || r.Hora || "19:30"),
      hayDom: String(r.hayDom || r.HayDom || r.domingo || "no").toLowerCase().startsWith("s"),
      fechaDom: normDate(r.fechaDom || r.FechaDom || ""),
      horaDom: String(r.horaDom || r.HoraDom || "10:00"),
      roles: {
        presidente: String(r.presidente || r.Presidente || ""),
        plataforma: String(r.plataforma || r.Plataforma || ""),
        micro1: String(r.micro1 || r.Micro1 || r.microfonista1 || ""),
        micro2: String(r.micro2 || r.Micro2 || r.microfonista2 || ""),
        acomodador: String(r.acomodador || r.Acomodador || ""),
        audio: String(r.audio || r.Audio || ""),
        video: String(r.video || r.Video || ""),
      },
      notas: String(r.notas || r.Notas || ""),
      creadoEn: serverTimestamp(),
      creadoPor: session.user.email || "import"
    };

    try{
      await addDoc(collection(db,"asignaciones"), docData);
      ok++;
    }catch(e){
      fail++;
    }
  }

  toast(`Importación lista: ${ok} agregadas, ${skip} salteadas, ${fail} fallidas.`, fail? "err":"ok");
}

$("#btnImport").addEventListener("click", importRows);
