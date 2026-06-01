import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function cleanText(v){
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

export function normalKey(s){
  return cleanText(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function addDaysISO(iso, days){
  const d = new Date(String(iso || "").slice(0, 10) + "T00:00:00");
  if(Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function publicTalkDates(semanaISO){
  const s = String(semanaISO || "").slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return [];
  return Array.from(new Set([s, addDaysISO(s, 1), addDaysISO(s, -1)].filter(Boolean)));
}

export function semanaTipoLabel(tipo){
  const t = normalKey(tipo || "normal");
  if(t === "asamblea") return "Asamblea";
  if(t === "conmemoracion") return "Conmemoración";
  if(t === "visita" || t === "visita viajante" || t === "viajante") return "Visita del viajante";
  return "Normal";
}

export function isSemanaSinReunion(tipo){
  const t = normalKey(tipo || "normal");
  return t === "asamblea" || t === "conmemoracion";
}

export function isSemanaVisitaViajante(tipo){
  const t = normalKey(tipo || "normal");
  return t === "visita" || t === "visita viajante" || t === "viajante";
}

export function isSemanaSinSalidasNiVisitantes(tipo){
  return isSemanaSinReunion(tipo) || isSemanaVisitaViajante(tipo);
}

export function isViajanteRecord(record){
  const txt = [record?.nombre, record?.orador, record?.oradorPublico, record?.congregacion, record?.congregacionVisitante, record?.detalle, record?.notas]
    .map(normalKey)
    .join(" ");
  return /\bviajante\b/.test(txt) || /superintendente de circuito/.test(txt);
}

export async function tipoSemanaForDate(db, semanaISO){
  const s = String(semanaISO || "").slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "normal";
  try{
    const snap = await getDoc(doc(db, "asignaciones", s));
    if(!snap.exists()) return "normal";
    const data = snap.data() || {};
    const a = data.asignaciones || data || {};
    return cleanText(a.tipoSemana || "normal").toLowerCase() || "normal";
  }catch(e){
    console.warn("No pude leer tipo de semana especial", e);
    return "normal";
  }
}

function salienteFechaCompatible(fecha, semanaISO){
  const f = String(fecha || "").slice(0, 10);
  return publicTalkDates(semanaISO).includes(f);
}

function salienteEsArregloReal(r){
  const tipo = normalKey(r?.tipo || "normal");
  if(tipo === "asamblea" || tipo === "conmemoracion") return false;
  return Boolean(cleanText(r?.orador || r?.oradorNombre || r?.nombre || r?.destino || r?.congregacionDestino || r?.bosquejo || r?.detalle));
}

export async function buscarConflictosArreglos(db, semanaISO, tipoSemana){
  const tipo = cleanText(tipoSemana || "normal").toLowerCase() || "normal";
  const out = { tipo, visitantes: [], salientes: [] };
  if(!isSemanaSinSalidasNiVisitantes(tipo)) return out;

  const fechas = publicTalkDates(semanaISO);

  for(const f of fechas){
    try{
      const snap = await getDoc(doc(db, "visitas", f));
      if(snap.exists()){
        const v = { id: snap.id, ...snap.data() };
        const clase = normalKey(v.tipo || v.clase || "visitante");
        if(clase !== "evento"){
          if(isSemanaVisitaViajante(tipo)){
            if(!isViajanteRecord(v)) out.visitantes.push(v);
          }else{
            out.visitantes.push(v);
          }
        }
      }
    }catch(e){
      console.warn("No pude revisar visitante en semana especial", f, e);
    }
  }

  try{
    const snap = await getDocs(collection(db, "salientes"));
    out.salientes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => salienteFechaCompatible(r.fecha || r.id, semanaISO))
      .filter(salienteEsArregloReal);
  }catch(e){
    console.warn("No pude revisar salientes en semana especial", e);
  }

  return out;
}

export function buildAlertaConflictos(conflictos){
  const tipo = semanaTipoLabel(conflictos?.tipo || "normal");
  const partes = [];
  const v = conflictos?.visitantes || [];
  const s = conflictos?.salientes || [];
  if(v.length){
    partes.push(`hay ${v.length} visitante(s) cargado(s) para esa semana`);
  }
  if(s.length){
    partes.push(`hay ${s.length} salida(s) cargada(s) para esa semana`);
  }
  if(!partes.length) return "";
  return `Alerta: la semana está marcada como ${tipo}. Según la regla, no debe haber arreglos de visitantes ni salientes${isSemanaVisitaViajante(conflictos?.tipo) ? "; el discurso público lo da el viajante" : ""}. Revisá porque ${partes.join(" y ")}.`;
}

export async function marcarHospitalidadSkip(db, fechaISO, activo=true){
  const f = String(fechaISO || "").slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
  try{
    await setDoc(doc(db, "hospitalidad_config", "config"), {
      skips: activo ? arrayUnion(f) : arrayRemove(f),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }catch(e){
    console.warn("No pude sincronizar la semana con la rotación de hospitalidad", e);
  }
}
