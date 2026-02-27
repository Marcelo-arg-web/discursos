export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

export function fmtDate(d){
  if(!d) return "";
  const dt = (d instanceof Date) ? d : new Date(d);
  const pad = n => String(n).padStart(2,'0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}`;
}

export function fmtTime(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  const pad = n => String(n).padStart(2,'0');
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function toast(msg, type="ok"){
  const el = document.createElement("div");
  el.className = `toast ${type==="err"?"err":"ok"}`;
  el.textContent = msg;
  const host = document.querySelector("#toastHost") || document.body;
  host.prepend(el);
  setTimeout(()=>el.remove(), 4200);
}

export function safeId(s){
  return String(s||"").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
}

export function groupBy(arr, keyFn){
  const m = new Map();
  for(const x of arr){
    const k = keyFn(x);
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
