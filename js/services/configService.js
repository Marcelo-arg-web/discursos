import { db } from "../firebase-config.js?v=20260429b75";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const DEFAULT_GENERAL_CONFIG = {
  nombreViajante: "Viajante"
};

export function cleanConfigText(value){
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function nombreViajanteFromConfig(config){
  return cleanConfigText(config?.nombreViajante) || "Viajante";
}

export async function getGeneralConfig(){
  try{
    const snap = await getDoc(doc(db, "configuracion", "general"));
    if(!snap.exists()) return { ...DEFAULT_GENERAL_CONFIG };
    return { ...DEFAULT_GENERAL_CONFIG, ...snap.data() };
  }catch(e){
    console.warn("No pude leer configuración general; uso valores por defecto.", e);
    return { ...DEFAULT_GENERAL_CONFIG };
  }
}

export async function saveGeneralConfig(data){
  const patch = {
    nombreViajante: cleanConfigText(data?.nombreViajante),
    actualizadoEn: serverTimestamp()
  };
  await setDoc(doc(db, "configuracion", "general"), patch, { merge:true });
  return patch;
}
