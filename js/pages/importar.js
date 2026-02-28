import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { renderTopbar } from "../shared/topbar.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError=false){
  const host = $("toastHost");
  if(!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(()=>{ host.innerHTML=""; }, 6500);
}

async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}

async function requireActiveUser(activeKey){
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u || u.activo !== true){
        toast("Tu usuario no está activo. Pedile a un administrador que te habilite.", true);
        await auth.signOut?.();
        window.location.href="index.html";
        return;
      }
      // roles: superadmin / admin pueden importar
      const rol = (u.rol || "").toLowerCase();
      if(rol !== "superadmin" && rol !== "admin"){
        toast("No tenés permisos para importar.", true);
        window.location.href="panel.html";
        return;
      }
      renderTopbar({ auth, active: activeKey });
      resolve({ user, usuario:u });
    });
  });
}

// ---------- Excel parsing helpers ----------

function norm(s){
  return (s||"")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}

function isDateCell(v){
  return v instanceof Date || (typeof v === "number" && v > 20000); // excel serial
}

function excelSerialToDate(n){
  // Excel date serial (1900 system). Good enough for your file.
  const utc_days = Math.floor(n - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
}

function toDate(v){
  if(v instanceof Date) return v;
  if(typeof v === "number") return excelSerialToDate(v);
  return null;
}

function ymd(d){
  const yy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yy}-${mm}-${dd}`;
}

function addDays(d, n){
  const x = new Date(d);
  x.setDate(x.getDate()+n);
  return x;
}

function parseProgramaSheet(ws){
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const weeks = []; // {date, fields}
  let current = null;

  const pushCurrent = ()=>{
    if(current && current.date){
      weeks.push(current);
    }
  };

  for(const row of rows){
    const a = row?.[0];
    const b = row?.[1];
    const c = row?.[2];
    const d = row?.[3];

    if(a === null && b === null && c === null && d === null) continue;

    if(isDateCell(a)){
      pushCurrent();
      current = { date: toDate(a), fields: {} };
      continue;
    }

    if(!current || !current.date) continue;

    const la = norm(a);
    const lc = norm(c);

    if(la.startsWith("presidente")){
      if(b) current.fields.presidenteNombre = b;
      if(lc.startsWith("oracion") && d) current.fields.oracionNombre = d;
    } else if(la.startsWith("oración") || la.startsWith("oracion")){
      if(b) current.fields.oracionNombre = b;
    } else if(la.startsWith("discursante")){
      if(b) current.fields.oradorNombre = b;
      if(lc.startsWith("congregacion") && d) current.fields.congregacion = d;
    } else if(la.startsWith("congregación") || la.startsWith("congregacion")){
      if(b) current.fields.congregacion = b;
    } else if(la.startsWith("titulo")){
      if(b) current.fields.tituloDiscurso = b;
    } else if(la.startsWith("atalaya")){
      if(b) current.fields.conductorAtalayaNombre = b;
      if(lc.startsWith("lector") && d) current.fields.lectorAtalayaNombre = d;
    }
  }

  pushCurrent();
  return weeks;
}

function parseMonthMarker(v){
  const d = toDate(v);
  if(!d) return null;
  return { year: d.getFullYear(), month: d.getMonth()+1 };
}

function parseDiaTexto(txt){
  // "Jueves/15", "Sábado/7", "Sabado/14"
  const m = (txt||"").toString().match(/\/\s*(\d{1,2})\s*$/);
  return m ? parseInt(m[1],10) : null;
}

function parseAcomodadoresSheet(ws){
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  let ctx = null; // {year, month}
  const out = new Map(); // ymd -> { entradaNombre, auditorioNombre }

  for(const row of rows){
    const a=row?.[0], b=row?.[1], c=row?.[2];
    if(isDateCell(a)){
      ctx = parseMonthMarker(a);
      continue;
    }
    const t = (a||"").toString();
    if(!ctx) continue;
    if(/^jue/i.test(norm(t))){
      const day = parseDiaTexto(t);
      if(!day) continue;
      const jueves = new Date(ctx.year, ctx.month-1, day);
      const sabado = addDays(jueves, 2);
      out.set(ymd(sabado), { entradaNombre: b || null, auditorioNombre: c || null });
    }
  }
  return out;
}

function parseMultimediaSheet(ws){
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  let ctx = null;
  const jueves = new Map(); // ymd(sabado) -> { sonidoNombre, microNombre, plataformaNombre }
  const sabado = new Map(); // ymd(sabado) -> { sonidoNombre, microNombre, plataformaNombre }

  for(const row of rows){
    const a=row?.[0], b=row?.[1], c=row?.[2], d=row?.[3];
    if(isDateCell(a)){
      ctx = parseMonthMarker(a);
      continue;
    }
    if(!ctx) continue;
    const t=(a||"").toString();
    const nt=norm(t);
    const day=parseDiaTexto(t);
    if(!day) continue;
    if(nt.startsWith("jueves")){
      const juevesDate = new Date(ctx.year, ctx.month-1, day);
      const sabDate = addDays(juevesDate, 2);
      jueves.set(ymd(sabDate), { sonidoNombre: b||null, microNombre: c||null, plataformaNombre: d||null });
    } else if(nt.startsWith("sabado") || nt.startsWith("sábado")){
      const sabDate = new Date(ctx.year, ctx.month-1, day);
      sabado.set(ymd(sabDate), { sonidoNombre: b||null, microNombre: c||null, plataformaNombre: d||null });
    }
  }

  // merge pref: sonido/micro de sábado si existe, sino jueves. plataforma de jueves si existe, sino sábado
  const out = new Map();
  const keys = new Set([...jueves.keys(), ...sabado.keys()]);
  for(const k of keys){
    const j = jueves.get(k) || {};
    const s = sabado.get(k) || {};
    out.set(k, {
      sonidoNombre: s.sonidoNombre || j.sonidoNombre || null,
      microNombre: s.microNombre || j.microNombre || null,
      plataformaNombre: j.plataformaNombre || s.plataformaNombre || null
    });
  }
  return out;
}

// ---------- Firestore helpers ----------

async function loadPersonasMap(){
  const snap = await getDocs(collection(db,"personas"));
  const map = new Map(); // norm(nombre) -> {id, nombre}
  snap.forEach(d=>{
    const data = d.data() || {};
    const nombre = data.nombre || data.name || "";
    if(!nombre) return;
    map.set(norm(nombre), { id: d.id, nombre });
  });
  return map;
}

function resolvePersonaId(nombre, personasMap){
  if(!nombre) return null;
  const n = norm(nombre);
  if(personasMap.has(n)) return personasMap.get(n).id;

  // fuzzy: match by last name + first initial
  const parts = n.split(" ").filter(Boolean);
  if(parts.length >= 2){
    const last = parts[parts.length-1];
    const firstInit = parts[0][0];
    for(const [k,v] of personasMap.entries()){
      const kp = k.split(" ").filter(Boolean);
      if(kp.length>=2){
        const klast = kp[kp.length-1];
        const kfirstInit = kp[0][0];
        if(klast === last && kfirstInit === firstInit) return v.id;
      }
    }
  }
  return null;
}

async function mergeAsignacion(dateKey, patch){
  const ref = doc(db,"asignaciones", dateKey);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data().asignaciones || {}) : {};
  const next = { ...existing };

  // solo completar vacíos
  for(const [k,v] of Object.entries(patch)){
    if(v === null || v === undefined || v === "") continue;
    if(next[k] === null || next[k] === undefined || next[k] === ""){
      next[k] = v;
    }
  }

  await setDoc(ref, {
    asignaciones: next,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return { updated: Object.keys(patch).filter(k=>patch[k] && (!existing[k])) };
}

// ---------- UI ----------

let workbook = null;
let personasMap = null;
let previewRows = []; // {dateKey, resumen, patch, missing[]}

function fillPreviewTable(){
  const tbl = $("tbl");
  const tbody = tbl?.querySelector("tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  previewRows.slice(0, 40).forEach(r=>{
    const miss = (r.missing||[]).join(", ");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.dateKey}</td>
      <td>${r.resumen || ""}</td>
      <td>${miss ? `<span class="badge warn">Faltan: ${miss}</span>` : `<span class="badge ok">OK</span>`}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function buildPreview(){
  if(!workbook) throw new Error("No hay Excel cargado.");
  if(!personasMap) personasMap = await loadPersonasMap();

  const wsProg = workbook.Sheets["Programa"];
  const wsAco = workbook.Sheets["Acomodadores"];
  const wsMul = workbook.Sheets["Multimedia"];

  if(!wsProg) throw new Error("No encontré la hoja 'Programa' en el Excel.");
  if(!wsAco) throw new Error("No encontré la hoja 'Acomodadores' en el Excel.");
  if(!wsMul) throw new Error("No encontré la hoja 'Multimedia' en el Excel.");

  const progWeeks = parseProgramaSheet(wsProg);
  const acoMap = parseAcomodadoresSheet(wsAco);
  const mulMap = parseMultimediaSheet(wsMul);

  previewRows = progWeeks.map(w=>{
    const dateKey = ymd(w.date);
    const missing = [];
    const patch = {};

    // Programa
    const pid = resolvePersonaId(w.fields.presidenteNombre, personasMap);
    if(w.fields.presidenteNombre && !pid) missing.push(`Presidente: ${w.fields.presidenteNombre}`);
    if(pid) patch.presidenteId = pid;

    const oid = resolvePersonaId(w.fields.oracionNombre, personasMap);
    if(w.fields.oracionNombre && !oid) missing.push(`Oración: ${w.fields.oracionNombre}`);
    if(oid){
      patch.oracionInicialId = oid;
      patch.oracionFinalId = oid;
    }

    const caid = resolvePersonaId(w.fields.conductorAtalayaNombre, personasMap);
    if(w.fields.conductorAtalayaNombre && !caid) missing.push(`Atalaya: ${w.fields.conductorAtalayaNombre}`);
    if(caid) patch.conductorAtalayaId = caid;

    const laid = resolvePersonaId(w.fields.lectorAtalayaNombre, personasMap);
    if(w.fields.lectorAtalayaNombre && !laid) missing.push(`Lector: ${w.fields.lectorAtalayaNombre}`);
    if(laid) patch.lectorAtalayaId = laid;

    if(w.fields.oradorNombre) patch.oradorPublico = w.fields.oradorNombre;
    if(w.fields.congregacion) patch.congregacionVisitante = w.fields.congregacion;
    if(w.fields.tituloDiscurso) patch.tituloDiscurso = w.fields.tituloDiscurso;

    // Acomodadores (entrada / auditorio)
    const aco = acoMap.get(dateKey);
    if(aco){
      const eid = resolvePersonaId(aco.entradaNombre, personasMap);
      if(aco.entradaNombre && !eid) missing.push(`Entrada: ${aco.entradaNombre}`);
      if(eid) patch.acomodadorEntradaId = eid;

      const auid = resolvePersonaId(aco.auditorioNombre, personasMap);
      if(aco.auditorioNombre && !auid) missing.push(`Auditorio: ${aco.auditorioNombre}`);
      if(auid) patch.acomodadorAuditorioId = auid;
    }

    // Multimedia + Plataforma + Micro
    const mul = mulMap.get(dateKey);
    if(mul){
      const mid = resolvePersonaId(mul.sonidoNombre, personasMap);
      if(mul.sonidoNombre && !mid) missing.push(`Sonido: ${mul.sonidoNombre}`);
      if(mid) patch.multimedia1Id = mid;

      const mic = resolvePersonaId(mul.microNombre, personasMap);
      if(mul.microNombre && !mic) missing.push(`Micrófonos: ${mul.microNombre}`);
      if(mic) patch.microfonista1Id = mic;

      const pl = resolvePersonaId(mul.plataformaNombre, personasMap);
      if(mul.plataformaNombre && !pl) missing.push(`Plataforma: ${mul.plataformaNombre}`);
      if(pl) patch.plataformaId = pl;
    }

    const resumen = [
      w.fields.presidenteNombre ? `Pres.: ${w.fields.presidenteNombre}` : "",
      w.fields.oradorNombre ? `Orador: ${w.fields.oradorNombre}` : "",
      w.fields.tituloDiscurso ? `“${w.fields.tituloDiscurso}”` : ""
    ].filter(Boolean).join(" · ");

    return { dateKey, resumen, patch, missing };
  });

  // order by date
  previewRows.sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
  fillPreviewTable();
  toast(`Vista previa lista: ${previewRows.length} semanas detectadas.`);
}

async function importToFirestore(){
  if(previewRows.length === 0) await buildPreview();

  let ok=0, fail=0;
  for(const r of previewRows){
    try{
      await mergeAsignacion(r.dateKey, r.patch);
      ok++;
    }catch(e){
      console.error("Error importando", r.dateKey, e);
      fail++;
    }
  }
  if(fail===0) toast(`Importación terminada: ${ok} semanas actualizadas.`);
  else toast(`Importación con errores: OK ${ok}, fallaron ${fail}. Mirá la consola.`, true);
}

// ---------- main ----------
(async function(){
  await requireActiveUser("importar");

  const fileInput = $("file");
  const sheetSel = $("sheet");

  function setSheets(){
    if(!sheetSel) return;
    sheetSel.innerHTML = "";
    (workbook?.SheetNames || []).forEach(n=>{
      const opt=document.createElement("option");
      opt.value=n; opt.textContent=n;
      sheetSel.appendChild(opt);
    });
    // sugerido
    const pref = workbook?.SheetNames?.includes("Programa") ? "Programa" : (workbook?.SheetNames?.[0] || "");
    if(pref) sheetSel.value=pref;
  }

  fileInput?.addEventListener("change", async ()=>{
    try{
      const f = fileInput.files?.[0];
      if(!f) return;
      if(typeof XLSX === "undefined"){
        toast("No se cargó la librería XLSX (SheetJS). Probá desactivar bloqueador/Brave Shields para este sitio.", true);
        return;
      }
      const buf = await f.arrayBuffer();
      workbook = XLSX.read(buf, { type:"array", cellDates:true });
      setSheets();
      previewRows = [];
      fillPreviewTable();
      toast(`Excel cargado: ${f.name}`);
    }catch(e){
      console.error(e);
      toast(`Error leyendo Excel: ${e.message || e}`, true);
    }
  });

  $("btnPreview")?.addEventListener("click", async ()=>{
    try{
      await buildPreview();
    }catch(e){
      console.error(e);
      toast(e.message || String(e), true);
    }
  });

  $("btnImport")?.addEventListener("click", async ()=>{
    try{
      await importToFirestore();
    }catch(e){
      console.error(e);
      toast(e.message || String(e), true);
    }
  });
})();