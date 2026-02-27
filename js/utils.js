export function $(sel, root=document){ return root.querySelector(sel); }
export function $$ (sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function escapeHtml(s=""){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function initials(nameOrEmail=""){
  const s = (nameOrEmail || "").trim();
  if(!s) return "??";
  const parts = s.includes("@") ? s.split("@")[0].split(/[._-]/) : s.split(" ");
  const letters = parts.filter(Boolean).slice(0,2).map(p=>p[0]?.toUpperCase()||"").join("");
  return letters || "??";
}

export function formatDateISO(iso){
  // iso: YYYY-MM-DD
  if(!iso) return "";
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString("es-AR", { weekday:"short", year:"numeric", month:"short", day:"2-digit" });
}

export function toast(msg){
  const el = document.getElementById("toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.classList.remove("show"), 2200);
}

export function downloadText(filename, text, mime="text/plain"){
  const blob = new Blob([text], {type:mime});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

export function csvEscape(v){
  const s = (v ?? "").toString();
  if(/[",\n]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
  return s;
}
