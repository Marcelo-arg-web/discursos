// js/roles/getRoleCandidates.js
// Construye "candidatos" para cada dropdown desde la lista blanca + (opcional) roles en base.

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
  // Si en tu base guardás rol "anciano", también se suma
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

export function getAcomodadores(personas){
  // Acomodadores = lista + ancianos/siervos (por si hay cambios)
  const porLista = filterByWhitelist(personas, ACOMODADORES);
  const base = getAncianosOSiervos(personas);
  return uniqueById([...porLista, ...base]);
}

export function getPlataforma(personas){
  // Plataforma = SOLO lista
  return filterByWhitelist(personas, PLATAFORMA);
}

export function getMultimedia(personas){
  // Multimedia = lista + ancianos/siervos
  const porLista = filterByWhitelist(personas, MULTIMEDIA);
  const base = getAncianosOSiervos(personas);
  return uniqueById([...porLista, ...base]);
}

export function getMicrofonistas(personas){
  // Microfonistas = lista + ancianos/siervos
  const porLista = filterByWhitelist(personas, MICROFONISTAS);
  const base = getAncianosOSiervos(personas);
  return uniqueById([...porLista, ...base]);
}

export function getLectoresAtalaya(personas){
  // Lectores = ancianos/siervos + rol "lector" + lista extra (Maxi)
  const base = getAncianosOSiervos(personas);
  const porRol = filterByRole(personas, "lector");
  const extra = filterByWhitelist(personas, LECTORES_ATALAYA_EXTRA);
  // Muchos lectores también son microfonistas; si querés, habilita esta línea:
  // const micros = getMicrofonistas(personas);
  return uniqueById([...base, ...porRol, ...extra]);
}
