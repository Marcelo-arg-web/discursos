export function hasPublicAccess(){
  try { return sessionStorage.getItem("vf_public") === "1"; } catch { return false; }
}

export function requirePublicAccess(){
  if(hasPublicAccess()) return true;
  window.location.href = "public-login.html";
  return false;
}

export function setPublicAccess(enabled){
  try {
    if(enabled) sessionStorage.setItem("vf_public","1");
    else sessionStorage.removeItem("vf_public");
  } catch {}
}
