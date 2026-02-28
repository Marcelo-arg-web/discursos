// js/services/personasService.js
// Utilidades para normalizar nombres y matchear por nombre o aliases.
// NO modifica Firebase.

export function normalizeName(s){
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\.\,\;\:]+$/g, "")
    .replace(/\s+/g, " ");
}

export function uniqueById(personas){
  const m = new Map();
  (personas || []).forEach(p=>{
    if(p && p.id) m.set(p.id, p);
  });
  return Array.from(m.values());
}

export function matchByNameOrAlias(persona, targetName){
  if(!persona) return false;
  const t = normalizeName(targetName);
  const n = normalizeName(persona.nombre);
  if(n === t) return true;

  const aliases = Array.isArray(persona.aliases) ? persona.aliases : [];
  return aliases.some(a => normalizeName(a) === t);
}

// Permite match "Brian" <-> "Braian"
export function matchByNameAliasWithVariants(persona, targetName){
  if(matchByNameOrAlias(persona, targetName)) return true;
  const t = normalizeName(targetName);
  const variants = [];
  if(t.startsWith("brian ")) variants.push("braian " + t.slice(6));
  if(t.startsWith("braian ")) variants.push("brian " + t.slice(7));
  return variants.some(v => matchByNameOrAlias(persona, v));
}

export function filterByWhitelist(personas, names){
  const allowed = [];
  (personas || []).forEach(p=>{
    if(!p?.activo) return;
    const ok = (names || []).some(n => matchByNameAliasWithVariants(p, n));
    if(ok) allowed.push(p);
  });
  return uniqueById(allowed);
}

export function hasRole(persona, role){
  const rs = Array.isArray(persona?.roles) ? persona.roles : [];
  const t = normalizeName(role);
  return rs.some(r => normalizeName(r) === t);
}

export function filterByRole(personas, role){
  return uniqueById((personas || []).filter(p => p?.activo && hasRole(p, role)));
}

export function filterByAnyRole(personas, roles){
  const wanted = new Set((roles||[]).map(normalizeName));
  return uniqueById((personas || []).filter(p => {
    if(!p?.activo) return false;
    const rs = Array.isArray(p.roles) ? p.roles.map(normalizeName) : [];
    return rs.some(r => wanted.has(r));
  }));
}
