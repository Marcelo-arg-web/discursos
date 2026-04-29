// js/roles/getRoleCandidates.js
// Construye candidatos para cada lista usando los tildes de Personas/Funciones
// y mantiene listas de respaldo para no perder lo ya cargado.

import {
  uniqueById,
  filterByWhitelist,
  filterByAnyRole,
  filterByRole
} from "../services/personasService.js";

import {
  ANCIANOS,
  SIERVOS,
  ACOMODADORES,
  PLATAFORMA,
  MULTIMEDIA,
  MICROFONISTAS,
  LECTORES_ATALAYA_EXTRA
} from "./rolesLists.js";

export function getAncianos(personas){
  const porLista = filterByWhitelist(personas, ANCIANOS);
  const porRol = filterByRole(personas, "anciano");
  return uniqueById([...porLista, ...porRol]);
}

export function getSiervos(personas){
  const porLista = filterByWhitelist(personas, SIERVOS);
  const porRol = filterByRole(personas, "siervo");
  const porRol2 = filterByRole(personas, "siervo ministerial");
  return uniqueById([...porLista, ...porRol, ...porRol2]);
}

export function getAncianosOSiervos(personas){
  return uniqueById([...getAncianos(personas), ...getSiervos(personas)]);
}

function preferConfigured(configured, fallback){
  const c = uniqueById(configured || []);
  return c.length ? c : uniqueById(fallback || []);
}

export function getPresidentes(personas){
  // Prioriza el tilde "Presidente". El respaldo ancianos/siervos mantiene compatibilidad.
  const porRol = filterByAnyRole(personas, ["presidente"]);
  const base = getAncianosOSiervos(personas);
  return preferConfigured(porRol, base);
}

export function getOradoresOracion(personas){
  // Tilde "Oración". El respaldo ancianos/siervos mantiene compatibilidad.
  const porRol = filterByAnyRole(personas, ["oracion", "oración"]);
  const base = getAncianosOSiervos(personas);
  return preferConfigured(porRol, base);
}

export function getConductoresAtalaya(personas){
  // Tilde "Conductor La Atalaya". Respaldo: ancianos.
  const porRol = filterByAnyRole(personas, ["conductor", "conductor atalaya", "conductor la atalaya"]);
  const base = getAncianos(personas);
  return preferConfigured(porRol, base);
}

export function getAcomodadores(personas){
  // Acomodadores = tildes + lista + ancianos/siervos (por compatibilidad).
  const porRol = filterByAnyRole(personas, ["acomodador", "acomodadores"]);
  const porLista = filterByWhitelist(personas, ACOMODADORES);
  const base = uniqueById([...porLista, ...getAncianosOSiervos(personas)]);
  return preferConfigured(porRol, base);
}

export function getPlataforma(personas){
  // Acomodador de plataforma = tilde "plataforma" + lista de respaldo.
  const porRol = filterByAnyRole(personas, ["plataforma", "acomodador plataforma", "acomodador de plataforma"]);
  const porLista = filterByWhitelist(personas, PLATAFORMA);
  return preferConfigured(porRol, porLista);
}

export function getMultimedia(personas){
  // Multimedia = tildes + lista + ancianos/siervos.
  const porRol = filterByAnyRole(personas, ["multimedia", "audio", "video"]);
  const porLista = filterByWhitelist(personas, MULTIMEDIA);
  const base = uniqueById([...porLista, ...getAncianosOSiervos(personas)]);
  return preferConfigured(porRol, base);
}

export function getMicrofonistas(personas){
  // Microfonistas = tildes + lista + ancianos/siervos.
  const porRol = filterByAnyRole(personas, ["microfonista", "microfonistas"]);
  const porLista = filterByWhitelist(personas, MICROFONISTAS);
  const base = uniqueById([...porLista, ...getAncianosOSiervos(personas)]);
  return preferConfigured(porRol, base);
}

export function getLectoresAtalaya(personas){
  // Lector de La Atalaya = ancianos/siervos + tildes + lista extra.
  const base = uniqueById([...getAncianosOSiervos(personas), ...filterByWhitelist(personas, LECTORES_ATALAYA_EXTRA)]);
  const porRol = filterByAnyRole(personas, ["lector", "lector atalaya", "lector la atalaya"]);
  return preferConfigured(porRol, base);
}
