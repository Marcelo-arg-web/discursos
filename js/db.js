import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, onSnapshot, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const fs = {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, onSnapshot, query, where, orderBy, limit
};

export async function ensureUserDoc(user, roleFallback){
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || "",
      nombre: user.displayName || "",
      rol: roleFallback,
      activo: true,
      creadoEn: new Date().toISOString()
    }, { merge:true });
  }else{
    // Mantener email actualizado
    await setDoc(ref, { email: user.email || "" }, { merge:true });
  }
  const latest = await getDoc(ref);
  return latest.data();
}

export async function getUserDoc(uid){
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function upsertCatalogItem(kind, num, titulo){
  const id = String(num).trim();
  const ref = doc(db, kind, id);
  await setDoc(ref, { num: id, titulo: titulo || "", actualizadoEn: new Date().toISOString() }, { merge:true });
}

export async function deleteCatalogItem(kind, num){
  const ref = doc(db, kind, String(num).trim());
  await deleteDoc(ref);
}

export async function listCatalog(kind){
  const col = collection(db, kind);
  const q = query(col, orderBy("num"));
  const snap = await getDocs(q);
  return snap.docs.map(d=>d.data());
}

export async function listPersonas(){
  const col = collection(db, "personas");
  const q = query(col, orderBy("nombre"));
  const snap = await getDocs(q);
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

export async function upsertPersona(data){
  // if id present -> update, else add
  if(data.id){
    const ref = doc(db, "personas", data.id);
    const {id, ...rest} = data;
    await setDoc(ref, { ...rest, actualizadoEn: new Date().toISOString() }, { merge:true });
    return data.id;
  }
  const col = collection(db, "personas");
  const res = await addDoc(col, { ...data, creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString() });
  return res.id;
}

export async function deletePersona(id){
  await deleteDoc(doc(db, "personas", id));
}

export async function upsertAsignacion(data){
  if(data.id){
    const ref = doc(db, "asignaciones", data.id);
    const {id, ...rest} = data;
    await setDoc(ref, { ...rest, actualizadoEn: new Date().toISOString() }, { merge:true });
    return data.id;
  }
  const col = collection(db, "asignaciones");
  const res = await addDoc(col, { ...data, creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString() });
  return res.id;
}

export async function deleteAsignacion(id){
  await deleteDoc(doc(db, "asignaciones", id));
}

export async function listAsignaciones({fromISO=null, toISO=null}={}){
  const col = collection(db, "asignaciones");
  let q = query(col, orderBy("fechaISO"));
  if(fromISO) q = query(col, where("fechaISO", ">=", fromISO), orderBy("fechaISO"));
  if(fromISO && toISO) q = query(col, where("fechaISO", ">=", fromISO), where("fechaISO","<=",toISO), orderBy("fechaISO"));
  const snap = await getDocs(q);
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

export async function latestAsignaciones(n=6){
  const col = collection(db, "asignaciones");
  const q = query(col, orderBy("fechaISO","desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
