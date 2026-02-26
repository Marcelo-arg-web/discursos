import { SUPERADMINS, ADMINS } from "./firebase-config.js";

export function roleFromEmail(email=""){
  const e = (email||"").toLowerCase();
  if(SUPERADMINS.map(x=>x.toLowerCase()).includes(e)) return "superadmin";
  if(ADMINS.map(x=>x.toLowerCase()).includes(e)) return "admin";
  return "lector";
}

export function canEdit(role){
  return role === "admin" || role === "superadmin";
}
