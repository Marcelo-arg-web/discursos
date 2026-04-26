// Discursantes (visitas (visitantes + salidas)) y Conferenciantes locales
// Requiere: firebase-config.js exporte { auth, db }

import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const LS_KEY_LOCALES = "vf_conferenciantesLocales_local";
const LS_KEY_SUPLENCIAS = "vf_suplenciasDiscursantes_local";

// Lee locales guardados en este navegador (respaldo cuando no hay permisos en Firestore)
function readLocalesLocal(){
  try{
    const raw = localStorage.getItem(LS_KEY_LOCALES);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(_){ return []; }
}
function writeLocalesLocal(arr){
  try{ localStorage.setItem(LS_KEY_LOCALES, JSON.stringify(arr||[])); }catch(_){}
}
function upsertLocalesLocal(item){
  const arr = readLocalesLocal();
  const key = String(item.nombre||"").trim().toLowerCase();
  const idx = arr.findIndex(x => String(x.nombre||"").trim().toLowerCase() === key);
  if(idx >= 0) arr[idx] = { ...arr[idx], ...item };
  else arr.push(item);
  writeLocalesLocal(arr);
}

function readSuplenciasLocal(){
  try{
    const raw = localStorage.getItem(LS_KEY_SUPLENCIAS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(_){ return []; }
}
function writeSuplenciasLocal(arr){
  try{ localStorage.setItem(LS_KEY_SUPLENCIAS, JSON.stringify(arr||[])); }catch(_){}
}
function upsertSuplenciaLocal(item){
  const arr = readSuplenciasLocal();
  const key = String(item.mes||"").trim();
  const idx = arr.findIndex(x => String(x.mes||"").trim() === key);
  if(idx >= 0) arr[idx] = { ...arr[idx], ...item };
  else arr.push(item);
  writeSuplenciasLocal(arr);
}
function removeSuplenciaLocal(mes){
  const key = String(mes||"").trim();
  writeSuplenciasLocal(readSuplenciasLocal().filter(x => String(x.mes||"").trim() !== key));
}

function toast(msg, isError = false) {
  const host = $("toastHost");
  if (!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(() => {
    host.innerHTML = "";
  }, 5000);
}

function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function currentMonthValue(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function monthLabel(ym){
  const m = String(ym||"").match(/^(\d{4})-(\d{2})$/);
  if(!m) return ym || "—";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const txt = d.toLocaleDateString("es-AR", { month:"long", year:"numeric" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function normalKey(s){
  return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const LOCALES_FIJOS_VILLA_FIAD = [
  { id: "marcelo-palavecino", nombre: "Marcelo Palavecino", telefono: "", bosquejos: [181, 28, 88, 180, 51], activo: true, fijoVillaFiad: true },
  { id: "sergio-saldana", nombre: "Sergio Saldaña", telefono: "", bosquejos: [55, 77], activo: true, fijoVillaFiad: true },
  { id: "luis-navarro", nombre: "Luis Navarro", telefono: "", bosquejos: [87, 146, 10, 165, 68, 7], activo: true, fijoVillaFiad: true },
  { id: "leonardo-araya", nombre: "Leonardo Araya", telefono: "", bosquejos: [135, 100, 57, 181, 189], activo: true, fijoVillaFiad: true },
  { id: "marcelo-rodriguez", nombre: "Marcelo Rodríguez", telefono: "", bosquejos: [15], activo: true, fijoVillaFiad: true }
];

function canonicalLocalName(nombre){
  const k = normalKey(nombre);
  if(k === "marcelo rodriguez" || k === "marcelo rodrigez") return "Marcelo Rodríguez";
  if(k === "marcelo palevecino") return "Marcelo Palavecino";
  if(k === "lis navarro") return "Luis Navarro";
  if(k === "lionardo araya") return "Leonardo Araya";
  const found = LOCALES_FIJOS_VILLA_FIAD.find(l => normalKey(l.nombre) === k);
  return found ? found.nombre : String(nombre||"").trim();
}


function localKey(l){
  return String(l?.id || normalKey(l?.nombre) || "");
}

function activeLocales(){
  return (cacheLoc || [])
    .filter(l => l && l.activo !== false && String(l.nombre||"").trim())
    .sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"", "es"));
}

async function getUsuario(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
}

function ensureTopbarStyles(){ /* estilos unificados en css/styles.css */ }

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        <a href="programa-mensual.html" class="${active==='programa'?'active':''}">Programa mensual</a>
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Asignaciones Villa Fiad</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>
      </div>
      <div class="actions">
        <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>
  `;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch(e){}
    window.location.href = "index.html";
  });
}


async function requireActiveUser(activePage) {
  ensureTopbarStyles();
  renderTopbar(activePage);

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      const u = await getUsuario(user.uid);
      if (!u?.activo) {
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }
      resolve({ user, usuario: u });
    });
  });
}

// -------------------- VISITANTES / SALIDAS --------------------
let cacheVis = []; // {id, fecha, nombre, congregacion, telefono, tipo, hora, notas, bosquejo, titulo}
let editVisId = "";

function visFromForm() {
  return {
    nombre: ($("v_nombre")?.value || "").trim(),
    congregacion: ($("v_cong")?.value || "").trim(),
    telefono: ($("v_tel")?.value || "").trim(),
    tipo: $("v_tipo")?.value || "visitante",
    fecha: $("v_fecha")?.value || "",
    hora: $("v_hora")?.value || "",
    notas: ($("v_notas")?.value || "").trim()
  };
}

function setVisForm(v = {}) {
  $("v_nombre").value = v.nombre || "";
  $("v_cong").value = v.congregacion || "";
  $("v_tel").value = v.telefono || "";
  $("v_tipo").value = v.tipo || "visitante";
  $("v_fecha").value = v.fecha || "";
  $("v_hora").value = v.hora || "19:30";
  $("v_notas").value = v.notas || "";
}

function limpiarVisForm() {
  editVisId = "";
  setVisForm({});
}

function matchesQ(v, q) {
  if (!q) return true;
  const hay = `${v.nombre || ""} ${v.congregacion || ""} ${v.fecha || ""} ${v.tipo || ""} ${v.notas || ""}`.toLowerCase();
  return hay.includes(q);
}

function renderVis() {
  const q = (document.getElementById("q")?.value || "").trim().toLowerCase();
  const tbody = document.querySelector("#tbl tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const rows = cacheVis
    .filter((v) => matchesQ(v, q))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  for (const v of rows) {
    const detalle = `
      <div><b>${v.nombre || ""}</b> ${v.congregacion ? `· ${v.congregacion}` : ""}</div>
      <div class="small muted">${v.fecha || ""}${v.hora ? ` ${v.hora}` : ""} · ${v.tipo || ""}${v.telefono ? ` · ${v.telefono}` : ""}</div>
      ${v.notas ? `<div class="small">${v.notas}</div>` : ""}
    `;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${detalle}</td>
      <td class="no-print">
        <button class="btn" data-act="edit" data-id="${v.id}">Editar</button>
        <button class="btn danger" data-act="del" data-id="${v.id}">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      const v = cacheVis.find((x) => x.id === id);
      if (!v) return;

      if (act === "edit") {
        editVisId = id;
        setVisForm(v);
        toast(`Editando: ${v.nombre || ""}`);
      }
      if (act === "del") {
        if (!confirm("¿Borrar este registro?")) return;
        await deleteDoc(doc(db, "visitas", id));
        await cargarVis();
        toast("Borrado.");
      }
    });
  });
}

async function cargarVis() {
  const qy = query(collection(db, "visitas"), orderBy("fecha", "desc"));
  const snap = await getDocs(qy);
  cacheVis = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderVis();
}

async function guardarVis() {
  const v = visFromForm();
  if (!v.nombre) return toast("Falta nombre.", true);
  if (!v.fecha) return toast("Falta fecha.", true);

  const payload = {
    ...v,
    updatedAt: serverTimestamp()
  };

  try {
    if (editVisId) {
      await updateDoc(doc(db, "visitas", editVisId), payload);
      toast("Actualizado.");
    } else {
      // Usamos la fecha como id si está libre (compatibilidad con asignaciones.js)
      // Si ya existe, Firestore no permite setear el id con addDoc, así que lo dejamos como auto-id.
      await addDoc(collection(db, "visitas"), { ...payload, createdAt: serverTimestamp() });
      toast("Guardado.");
    }
    limpiarVisForm();
    await cargarVis();
  } catch (e) {
    console.error(e);
    toast("No pude guardar. Revisá permisos.", true);
  }
}

function generarMensajeVis() {
  const v = visFromForm();
  if (!v.nombre) return toast("Completá al menos el nombre.", true);
  const tipo = v.tipo === "salida" ? "Salida" : "Visitante";
  const lineaFecha = v.fecha ? `Fecha: ${v.fecha}${v.hora ? ` ${v.hora}` : ""}` : "";
  const lineaCong = v.congregacion ? `Congregación: ${v.congregacion}` : "";
  const lineaTel = v.telefono ? `Tel: ${v.telefono}` : "";
  const lineaNotas = v.notas ? `Notas: ${v.notas}` : "";
  const msg = [
    `*${tipo}*`,
    `Nombre: ${v.nombre}`,
    lineaCong,
    lineaFecha,
    lineaTel,
    lineaNotas
  ].filter(Boolean).join("\n");

  const out = document.getElementById("msg");
  if (out) out.value = msg;
  toast("Mensaje generado (copiar/pegar). ");
}

// -------------------- CONFERENCIANTES LOCALES --------------------
let cacheLoc = []; // {id,nombre,telefono,bosquejos[],activo,proximo,provisorio,updatedAt}
let editLocId = "";
let localesFromPersonasFallback = false;

function locFromForm() {
  const bosquejosRaw = (document.getElementById("l_bosquejos")?.value || "").trim();
  const bosquejos = bosquejosRaw
    ? bosquejosRaw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    nombre: canonicalLocalName((document.getElementById("l_nombre")?.value || "").trim()),
    telefono: (document.getElementById("l_tel")?.value || "").trim(),
    bosquejos,
    proximo: Boolean(document.getElementById("l_proximo")?.checked),
    provisorio: Boolean(document.getElementById("l_provisorio")?.checked)
  };
}

function setLocForm(l = {}) {
  document.getElementById("l_nombre").value = l.nombre || "";
  document.getElementById("l_tel").value = l.telefono || "";
  document.getElementById("l_bosquejos").value = Array.isArray(l.bosquejos) ? l.bosquejos.join(", ") : "";
  document.getElementById("l_proximo").checked = Boolean(l.proximo);
  document.getElementById("l_provisorio").checked = Boolean(l.provisorio);
}

function limpiarLocForm() {
  editLocId = "";
  setLocForm({});
}

async function leerLocalesDesdePersonas(){
  const snap = await getDocs(query(collection(db, "personas"), orderBy("nombre", "asc")));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all
    .filter((p) => p.activo !== false)
    .filter((p) => Array.isArray(p.roles) && p.roles.map((r)=>String(r).toLowerCase()).includes("discursante"))
    .map((p) => ({
      id: p.id,
      nombre: p.nombre || "",
      telefono: p.telefono || "",
      bosquejos: Array.isArray(p.bosquejos) ? p.bosquejos : [],
      proximo: false,
      provisorio: false,
      activo: p.activo !== false,
      origenPersonas: true
    }));
}

function mergeLocalesPorNombre(base, extra){
  const out = (Array.isArray(base) ? base.slice() : []).map(x => ({ ...x, nombre: canonicalLocalName(x?.nombre) }));
  (extra || []).forEach((raw)=>{
    const x = { ...raw, nombre: canonicalLocalName(raw?.nombre) };
    const key = normalKey(x.nombre);
    if(!key) return;
    const i = out.findIndex(y => normalKey(canonicalLocalName(y.nombre)) === key || (x.id && y.id === x.id));
    if(i >= 0){
      const bosq = Array.from(new Set([...(Array.isArray(x.bosquejos)?x.bosquejos:[]), ...(Array.isArray(out[i].bosquejos)?out[i].bosquejos:[])]));
      const fijo = LOCALES_FIJOS_VILLA_FIAD.find(f => normalKey(f.nombre) === key);
      out[i] = { ...x, ...out[i], nombre: canonicalLocalName(out[i].nombre || x.nombre), activo: fijo ? true : (out[i].activo ?? x.activo), fijoVillaFiad: Boolean(out[i].fijoVillaFiad || x.fijoVillaFiad || fijo), bosquejos: bosq, origenPersonas: out[i].origenPersonas && !out[i].createdAt ? true : out[i].origenPersonas };
    }
    else out.push(x);
  });
  return out;
}

async function cargarLocales() {
  // Intento 1: colección dedicada. Además suma los que ya estén marcados como discursante en Personas.
  try {
    localesFromPersonasFallback = false;
    const qy = query(collection(db, "conferenciantesLocales"), orderBy("nombre", "asc"));
    const snap = await getDocs(qy);
    const dedicados = snap.docs.map((d) => ({ id: d.id, ...d.data(), origenPersonas:false }));
    let desdePersonas = [];
    try { desdePersonas = await leerLocalesDesdePersonas(); } catch(ePersonas) { console.warn("No pude sumar locales desde Personas.", ePersonas); }
    cacheLoc = mergeLocalesPorNombre(mergeLocalesPorNombre(LOCALES_FIJOS_VILLA_FIAD, dedicados), desdePersonas)
      .filter((l) => l.activo !== false)
      .sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"", "es"));
    renderLocales();
    actualizarSelectSuplentes();
    return;
  } catch (e) {
    console.warn("No pude leer conferenciantesLocales; uso Personas como respaldo.", e);
    localesFromPersonasFallback = true;
  }

  // Respaldo: usar Personas (roles contiene "discursante") + localStorage.
  try {
    cacheLoc = mergeLocalesPorNombre(LOCALES_FIJOS_VILLA_FIAD, await leerLocalesDesdePersonas());
    const localExtra = readLocalesLocal();
    localExtra.forEach((x)=>{
      const key = normalKey(x.nombre);
      if(!key) return;
      const i = cacheLoc.findIndex((y)=>normalKey(y.nombre)===key);
      if(i>=0){
        const bosq = Array.from(new Set([...(Array.isArray(cacheLoc[i].bosquejos)?cacheLoc[i].bosquejos:[]), ...(Array.isArray(x.bosquejos)?x.bosquejos:[])]));
        cacheLoc[i] = { ...cacheLoc[i], ...x, nombre: canonicalLocalName(cacheLoc[i].nombre || x.nombre), activo: cacheLoc[i].fijoVillaFiad ? true : (x.activo ?? cacheLoc[i].activo), bosquejos: bosq };
      }
      else cacheLoc.push(x);
    });
    cacheLoc.sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"", "es"));
    renderLocales();
    actualizarSelectSuplentes();

    document.getElementById("btnGuardarLocal")?.removeAttribute("disabled");
    document.getElementById("btnLimpiarLocal")?.removeAttribute("disabled");
    document.getElementById("btnMsgLocales")?.removeAttribute("disabled");
    toast("Locales: leyendo desde Personas. Si no tenés permisos, podés guardar cambios en este navegador.");
  } catch (e) {
    console.error(e);
    toast("No pude cargar conferenciantes locales. Revisá permisos.", true);
  }
}

function renderLocales() {
  const tbody = document.querySelector("#tblLocales tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const rows = cacheLoc
    .filter((l) => l.activo !== false)
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  for (const l of rows) {
    const tags = [
      l.provisorio ? "provisorio" : "",
      l.proximo ? "próximo" : ""
    ].filter(Boolean);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div><b>${canonicalLocalName(l.nombre) || ""}</b> ${tags.length ? `<span class="pill">${tags.join(" · ")}</span>` : ""}</div>
        <div class="small muted">${l.telefono || ""}</div>
        <div class="small">${Array.isArray(l.bosquejos) && l.bosquejos.length ? `Bosquejos: ${l.bosquejos.join(", ")}` : "Bosquejos: —"}</div>
      </td>
      <td class="no-print">
        ${localesFromPersonasFallback ? `<span class="small muted">Editar desde Personas</span>` : `<button class="btn" data-act="edit" data-id="${l.id}">Editar</button>
        <button class="btn" data-act="toggle" data-id="${l.id}">Desactivar</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      const l = cacheLoc.find((x) => x.id === id);
      if (!l) return;

      if (act === "edit") {
        editLocId = id;
        setLocForm(l);
        toast(`Editando local: ${l.nombre || ""}`);
      }
      if (act === "toggle") {
        await setDoc(doc(db, "conferenciantesLocales", id), { ...l, activo: false, updatedAt: serverTimestamp() }, { merge:true });
        await cargarLocales();
        toast("Desactivado.");
      }
    });
  });
}

async function guardarLocal() {
  const l = locFromForm();
  if (!l.nombre) return toast("Falta nombre (local).", true);

  // Regla: Juan Carlos Fresia queda provisorio
  if (l.nombre.toLowerCase().includes("juan carlos fresia")) {
    l.provisorio = true;
  }

  const payload = {
    ...l,
    activo: true,
    updatedAt: serverTimestamp()
  };

  // Si estamos en modo fallback (sin permisos/lectura desde Personas), guardamos en este navegador
  if (localesFromPersonasFallback) {
    upsertLocalesLocal({ ...l, activo: true, updatedAt: new Date().toISOString() });
    toast("Local guardado (este navegador).");
    limpiarLocForm();
    await cargarLocales();
    return;
  }

  try {
    if (editLocId) {
      await setDoc(doc(db, "conferenciantesLocales", editLocId), payload, { merge:true });
      toast("Local actualizado.");
    } else {
      await addDoc(collection(db, "conferenciantesLocales"), { ...payload, createdAt: serverTimestamp() });
      toast("Local guardado.");
    }

    // Si existía guardado local (respaldo), lo limpiamos
    try {
      const arr = readLocalesLocal();
      const key = String(l.nombre || "").trim().toLowerCase();
      writeLocalesLocal(arr.filter(x => String(x.nombre || "").trim().toLowerCase() !== key));
    } catch (_) {}

    limpiarLocForm();
    await cargarLocales();
  } catch (e) {
    console.error(e);
    toast("No pude guardar local. Revisá permisos.", true);
  }
}

function generarMensajeLocales() {
  const activos = cacheLoc
    .filter((l) => l.activo !== false)
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  if (!activos.length) return toast("No hay conferenciantes locales cargados.", true);

  const lines = activos.map((l) => {
    const bosq = Array.isArray(l.bosquejos) && l.bosquejos.length ? ` (Bosquejos: ${l.bosquejos.join(", ")})` : "";
    const tel = l.telefono ? ` · ${l.telefono}` : "";
    const tags = [l.provisorio ? "provisorio" : "", l.proximo ? "próximo" : ""].filter(Boolean);
    const tagStr = tags.length ? ` [${tags.join(" · ")}]` : "";
    return `• ${canonicalLocalName(l.nombre)}${tagStr}${tel}${bosq}`;
  });

  const msg = `*Conferenciantes locales (Villa Fiad)*\n\n${lines.join("\n")}`;
  const out = document.getElementById("msgLocales");
  if (out) out.value = msg;
  toast("Mensaje de locales generado (copiar/pegar)." );
}


// -------------------- TURNOS DE SUPLENCIA MENSUAL --------------------
let cacheSup = []; // {mes, localId, nombre, telefono, notas, activo}
let suplenciasFromLocalFallback = false;

function actualizarSelectSuplentes(){
  const sel = $("s_local");
  if(!sel) return;
  const prev = sel.value;
  const locs = activeLocales();
  if(!locs.length){
    sel.innerHTML = `<option value="">Primero cargá conferenciantes locales</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = `<option value="">Elegir discursante local…</option>` + locs.map(l => {
    const key = escapeHtml(localKey(l));
    const nombre = escapeHtml(l.nombre || "");
    const tel = escapeHtml(l.telefono || "");
    return `<option value="${key}" data-nombre="${nombre}" data-telefono="${tel}">${nombre}${tel ? ` · ${tel}` : ""}</option>`;
  }).join("");
  if(prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
}

function suplenciaFromForm(){
  const sel = $("s_local");
  const opt = sel?.selectedOptions?.[0];
  const key = sel?.value || "";
  const local = activeLocales().find(l => localKey(l) === key);
  return {
    mes: $("s_mes")?.value || "",
    localId: key,
    nombre: local?.nombre || opt?.dataset?.nombre || "",
    telefono: local?.telefono || opt?.dataset?.telefono || "",
    notas: ($("s_notas")?.value || "").trim()
  };
}

function setSuplenciaForm(s = {}){
  if($("s_mes")) $("s_mes").value = s.mes || currentMonthValue();
  actualizarSelectSuplentes();
  const sel = $("s_local");
  if(sel){
    let key = s.localId || "";
    if(!key && s.nombre){
      const found = activeLocales().find(l => normalKey(l.nombre) === normalKey(s.nombre));
      key = found ? localKey(found) : normalKey(s.nombre);
    }
    if(key && !Array.from(sel.options).some(o => o.value === key)){
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${s.nombre || "Registro anterior"}${s.telefono ? ` · ${s.telefono}` : ""}`;
      opt.dataset.nombre = s.nombre || "";
      opt.dataset.telefono = s.telefono || "";
      sel.appendChild(opt);
    }
    sel.value = key;
  }
  if($("s_notas")) $("s_notas").value = s.notas || "";
}

function limpiarSuplenciaForm(){
  setSuplenciaForm({ mes: currentMonthValue(), localId: "", nombre: "", notas: "" });
}

function renderSuplencias(){
  const tbody = document.querySelector("#tblSuplencias tbody");
  if(!tbody) return;
  const rows = (cacheSup || [])
    .filter(s => s.activo !== false)
    .sort((a,b)=>String(b.mes||"").localeCompare(String(a.mes||"")));

  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Todavía no hay turnos de suplencia guardados.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(s => `
    <tr>
      <td><b>${escapeHtml(monthLabel(s.mes))}</b><div class="small muted">${escapeHtml(s.mes || "")}</div></td>
      <td>${escapeHtml(s.nombre || "—")}${s.telefono ? `<div class="small muted">${escapeHtml(s.telefono)}</div>` : ""}</td>
      <td>${escapeHtml(s.notas || "—")}</td>
      <td class="no-print">
        <button class="btn" data-sup-act="edit" data-mes="${escapeHtml(s.mes)}">Editar</button>
        <button class="btn danger" data-sup-act="del" data-mes="${escapeHtml(s.mes)}">Borrar</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button[data-sup-act]").forEach(btn => {
    btn.addEventListener("click", async ()=>{
      const mes = btn.getAttribute("data-mes");
      const act = btn.getAttribute("data-sup-act");
      const s = cacheSup.find(x => String(x.mes||"") === String(mes||""));
      if(!s) return;
      if(act === "edit"){
        setSuplenciaForm(s);
        toast(`Editando suplencia de ${monthLabel(s.mes)}.`);
      }
      if(act === "del"){
        if(!confirm(`¿Borrar el turno de ${monthLabel(s.mes)}?`)) return;
        await borrarSuplencia(mes);
      }
    });
  });
}

async function cargarSuplencias(){
  try{
    suplenciasFromLocalFallback = false;
    const qy = query(collection(db, "suplenciasDiscursantes"), orderBy("mes", "desc"));
    const snap = await getDocs(qy);
    cacheSup = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSuplencias();
    return;
  }catch(e){
    console.warn("No pude leer suplenciasDiscursantes; uso respaldo local.", e);
    suplenciasFromLocalFallback = true;
    cacheSup = readSuplenciasLocal();
    renderSuplencias();
    toast("Suplencias: sin permiso de Firestore por ahora; se usará respaldo en este navegador.", true);
  }
}

async function guardarSuplencia(){
  const s = suplenciaFromForm();
  if(!s.mes) return toast("Elegí el mes de la suplencia.", true);
  if(!s.nombre) return toast("Elegí el discursante local de turno.", true);

  if(suplenciasFromLocalFallback){
    upsertSuplenciaLocal({ ...s, activo:true, updatedAt:new Date().toISOString() });
    cacheSup = readSuplenciasLocal();
    renderSuplencias();
    toast("Turno guardado en este navegador.");
    return;
  }

  try{
    await setDoc(doc(db, "suplenciasDiscursantes", s.mes), {
      ...s,
      activo: true,
      updatedAt: serverTimestamp()
    }, { merge:true });
    await cargarSuplencias();
    toast("Turno de suplencia guardado.");
  }catch(e){
    console.error(e);
    upsertSuplenciaLocal({ ...s, activo:true, updatedAt:new Date().toISOString() });
    cacheSup = readSuplenciasLocal();
    renderSuplencias();
    toast("No pude guardar en Firestore. Lo dejé guardado en este navegador; revisá/deployá las reglas incluidas.", true);
  }
}

async function borrarSuplencia(mes){
  if(suplenciasFromLocalFallback){
    removeSuplenciaLocal(mes);
    cacheSup = readSuplenciasLocal();
    renderSuplencias();
    toast("Turno borrado del respaldo local.");
    return;
  }
  try{
    await deleteDoc(doc(db, "suplenciasDiscursantes", mes));
    await cargarSuplencias();
    toast("Turno de suplencia borrado.");
  }catch(e){
    console.error(e);
    toast("No pude borrar. Revisá permisos de Firestore.", true);
  }
}

function sugerirSuplencia(){
  const mes = $("s_mes")?.value || currentMonthValue();
  if($("s_mes")) $("s_mes").value = mes;
  const locs = activeLocales();
  if(!locs.length) return toast("Primero cargá los 5 discursantes locales activos.", true);

  const existentes = (cacheSup || []).filter(s => s.activo !== false && s.mes !== mes);
  const stats = locs.map(l => {
    const key = localKey(l);
    const asignadas = existentes.filter(s => {
      const skey = s.localId || normalKey(s.nombre);
      return skey === key || normalKey(s.nombre) === normalKey(l.nombre);
    });
    const last = asignadas.map(s => s.mes || "").sort().pop() || "";
    return { key, nombre:l.nombre || "", count:asignadas.length, last };
  });

  stats.sort((a,b)=>{
    if(a.count !== b.count) return a.count - b.count;
    if(a.last !== b.last) return String(a.last).localeCompare(String(b.last));
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const elegido = stats[0];
  if($("s_local")) $("s_local").value = elegido.key;
  toast(`Sugerido para ${monthLabel(mes)}: ${elegido.nombre}.`);
}

function cargarSuplenciaDelMes(){
  const mes = $("s_mes")?.value || "";
  if(!mes) return;
  const existente = (cacheSup || []).find(s => s.activo !== false && String(s.mes||"") === mes);
  if(existente){
    setSuplenciaForm(existente);
    toast(`Ya había un turno cargado para ${monthLabel(mes)}.`);
  }
}


// -------------------- EXPORTAR EXCEL --------------------
function safeStr(v) { return (v == null) ? "" : String(v); }

function exportarExcel() {
  const XLSX = window.XLSX;
  if (!XLSX) {
    toast("No pude cargar el exportador (XLSX). Revisá tu conexión a internet y recargá.", true);
    return;
  }

  // Hoja 1: Visitas (visitantes + salidas)
  const visRows = (cacheVis || [])
    .slice()
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
    .map((v) => ({
      Fecha: safeStr(v.fecha),
      Hora: safeStr(v.hora),
      Tipo: safeStr(v.tipo),
      Nombre: safeStr(v.nombre),
      Congregación: safeStr(v.congregacion),
      Teléfono: safeStr(v.telefono),
      Notas: safeStr(v.notas)
    }));

  // Hoja 2: Locales
  const locRows = (cacheLoc || [])
    .filter((l) => l.activo !== false)
    .slice()
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"))
    .map((l) => ({
      Nombre: safeStr(l.nombre),
      Teléfono: safeStr(l.telefono),
      Bosquejos: Array.isArray(l.bosquejos) ? l.bosquejos.join(", ") : safeStr(l.bosquejos),
      Provisorio: l.provisorio ? "Sí" : "No",
      Próximo: l.proximo ? "Sí" : "No"
    }));

  // Hoja 3: Suplencias mensuales
  const supRows = (cacheSup || [])
    .filter((s) => s.activo !== false)
    .slice()
    .sort((a, b) => (a.mes || "").localeCompare(b.mes || ""))
    .map((s) => ({
      Mes: safeStr(s.mes),
      "Mes legible": safeStr(monthLabel(s.mes)),
      Discursante: safeStr(s.nombre),
      Teléfono: safeStr(s.telefono),
      Notas: safeStr(s.notas)
    }));

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(visRows.length ? visRows : [{ Fecha: "", Hora: "", Tipo: "", Nombre: "", "Congregación": "", "Teléfono": "", Notas: "" }]);
  const ws2 = XLSX.utils.json_to_sheet(locRows.length ? locRows : [{ Nombre: "", "Teléfono": "", Bosquejos: "", Provisorio: "", "Próximo": "" }]);
  const ws3 = XLSX.utils.json_to_sheet(supRows.length ? supRows : [{ Mes: "", "Mes legible": "", Discursante: "", "Teléfono": "", Notas: "" }]);

  XLSX.utils.book_append_sheet(wb, ws1, "Visitas");
  XLSX.utils.book_append_sheet(wb, ws2, "Locales");
  XLSX.utils.book_append_sheet(wb, ws3, "Suplencias");

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const filename = `discursantes_${y}-${m}-${d}.xlsx`;

  XLSX.writeFile(wb, filename);
  toast("Excel exportado.");
}

// -------------------- INIT --------------------
(async function init() {
  await requireActiveUser("discursantes");

  // defaults
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  if ($("v_fecha")) $("v_fecha").value = `${yyyy}-${mm}-${dd}`;
  if ($("s_mes")) $("s_mes").value = currentMonthValue();

  // eventos
  $("btnGuardar")?.addEventListener("click", guardarVis);
  $("btnMsg")?.addEventListener("click", generarMensajeVis);
  $("q")?.addEventListener("input", renderVis);
  $("btnExportXlsx")?.addEventListener("click", exportarExcel);

  $("btnGuardarLocal")?.addEventListener("click", guardarLocal);
  $("btnMsgLocales")?.addEventListener("click", generarMensajeLocales);
  $("btnLimpiarLocal")?.addEventListener("click", () => {
    limpiarLocForm();
    toast("Formulario local limpio.");
  });

  $("btnSugerirSuplencia")?.addEventListener("click", sugerirSuplencia);
  $("btnGuardarSuplencia")?.addEventListener("click", guardarSuplencia);
  $("btnLimpiarSuplencia")?.addEventListener("click", () => {
    limpiarSuplenciaForm();
    toast("Formulario de suplencia limpio.");
  });
  $("s_mes")?.addEventListener("change", cargarSuplenciaDelMes);

  await cargarVis();
  await cargarLocales();
  await cargarSuplencias();
})();
