// === FIX: helper pick() para retrocompatibilidad ===
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== "") return v;
  }
  return "";
}

// Ejemplo de uso dentro de mapAV o render:
// const plataforma = pick(d, "plataforma", "plataformaNombre");
// const multimedia1 = pick(d, "multimedia1", "multimedia1Nombre");
// const multimedia2 = pick(d, "multimedia2", "multimedia2Nombre");
