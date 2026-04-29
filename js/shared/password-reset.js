import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function resetUrl(){
  try{
    return new URL("restablecer-clave.html", window.location.href).href;
  }catch(e){
    const base = String(window.location.origin || "") + String(window.location.pathname || "").replace(/[^/]*$/, "");
    return base + "restablecer-clave.html";
  }
}

export function passwordResetActionSettings(){
  return {
    url: resetUrl(),
    handleCodeInApp: false
  };
}

export function isUnauthorizedResetDomain(err){
  const code = String(err?.code || err?.message || "").toLowerCase();
  return code.includes("unauthorized-domain") || code.includes("invalid-continue-uri") || code.includes("invalid-dynamic-link-domain");
}

export async function sendPasswordRecoveryEmail(auth, email){
  try{
    await sendPasswordResetEmail(auth, email, passwordResetActionSettings());
    return { customPage: true };
  }catch(err){
    if(isUnauthorizedResetDomain(err)){
      await sendPasswordResetEmail(auth, email);
      return { customPage: false, fallback: true };
    }
    throw err;
  }
}

export function recoveryOkMessage(email, result){
  const base = `Envié un enlace nuevo a ${email}. Usá siempre el último correo recibido; los enlaces anteriores pueden quedar vencidos o ya usados.`;
  if(result?.fallback){
    return base + " Si el correo abre la página de Firebase en inglés, igual podés cambiar la clave desde allí.";
  }
  return base;
}
