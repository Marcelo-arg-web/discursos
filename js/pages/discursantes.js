// Discursantes (visitas (visitantes + salidas)) y Conferenciantes locales
// Requiere: firebase-config.js exporte { auth, db }

import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
import { renderTopbar } from "../shared/topbar.js";
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function toast(msg, isError = false) {
  const host = $("toastHost");
  if (!host) return alert(msg);
  host.innerHTML = `<div class="toast ${isError ? "err" : ""}">${msg}</div>`;
  setTimeout(() => {
    host.innerHTML = "";
  }, 5000);
}

async function getUsuario(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
}

function ensureTopbarStyles() {
  if (document.getElementById("topbarStyle")) return;
  const s = document.createElement("style");
  s.id = "topbarStyle";
  s.textContent = `
    .topbar{display:flex;justify-content:space-between;align-items:center;gap:14px;
      background:#1a4fa3;color:#fff;padding:10px 14px;border-radius:14px;margin:14px auto;max-width:1100px;}
    .topbar .brand{font-weight:800}
    .topbar .links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .topbar a{color:#fff;text-decoration:none;font-weight:700;font-size:13px;opacity:.92}
    .topbar a.active{text-decoration:underline;opacity:1}
    .topbar .btn.danger{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}
  `;
  document.head.appendChild(s);
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
    nombre: (document.getElementById("l_nombre")?.value || "").trim(),
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

async function cargarLocales() {
  // Intento 1: colección dedicada (si tus reglas la permiten)
  try {
    localesFromPersonasFallback = false;
    const qy = query(collection(db, "conferenciantesLocales"), orderBy("nombre", "asc"));
    const snap = await getDocs(qy);
    cacheLoc = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLocales();
    return;
  } catch (e) {
    console.warn("No pude leer conferenciantesLocales; uso Personas como respaldo.", e);
    localesFromPersonasFallback = true;
  }

  // Respaldo: usar Personas (roles contiene "discursante")
  // Nota: si querés editar/crear locales, hacelo desde Personas.
  try {
    const snap = await getDocs(query(collection(db, "personas"), orderBy("nombre", "asc")));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cacheLoc = all
      .filter((p) => p.activo !== false)
      .filter((p) => Array.isArray(p.roles) && p.roles.map((r)=>String(r).toLowerCase()).includes("discursante"))
      .map((p) => ({
        id: p.id,
        nombre: p.nombre || "",
        telefono: p.telefono || "",
        bosquejos: Array.isArray(p.bosquejos) ? p.bosquejos : [],
        proximo: false,
        provisorio: false,
        activo: p.activo !== false
      }));
    renderLocales();
    // Deshabilitar botones de guardado local si estamos en fallback
    document.getElementById("btnGuardarLocal")?.setAttribute("disabled", "disabled");
    document.getElementById("btnLimpiarLocal")?.setAttribute("disabled", "disabled");
    document.getElementById("btnMsgLocales")?.removeAttribute("disabled");
    toast("Locales: leyendo desde Personas. Para editar/agregar, usá la pantalla Personas.");
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
        <div><b>${l.nombre || ""}</b> ${tags.length ? `<span class="pill">${tags.join(" · ")}</span>` : ""}</div>
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
        await updateDoc(doc(db, "conferenciantesLocales", id), { activo: false, updatedAt: serverTimestamp() });
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

  try {
    if (editLocId) {
      await updateDoc(doc(db, "conferenciantesLocales", editLocId), payload);
      toast("Local actualizado.");
    } else {
      await addDoc(collection(db, "conferenciantesLocales"), { ...payload, createdAt: serverTimestamp() });
      toast("Local guardado.");
    }
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
    return `• ${l.nombre}${tagStr}${tel}${bosq}`;
  });

  const msg = `*Conferenciantes locales (Villa Fiad)*\n\n${lines.join("\n")}`;
  const out = document.getElementById("msgLocales");
  if (out) out.value = msg;
  toast("Mensaje de locales generado (copiar/pegar)." );
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

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(visRows.length ? visRows : [{ Fecha: "", Hora: "", Tipo: "", Nombre: "", "Congregación": "", "Teléfono": "", Notas: "" }]);
  const ws2 = XLSX.utils.json_to_sheet(locRows.length ? locRows : [{ Nombre: "", "Teléfono": "", Bosquejos: "", Provisorio: "", "Próximo": "" }]);

  XLSX.utils.book_append_sheet(wb, ws1, "Visitas");
  XLSX.utils.book_append_sheet(wb, ws2, "Locales");

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

  // eventos
  $("btnGuardar")?.addEventListener("click", guardarVis);
  $("btnMsg")?.addEventListener("click", generarMensajeVis);
  $("q")?.addEventListener("input", renderVis);

  $("btnGuardarLocal")?.addEventListener("click", guardarLocal);
  $("btnMsgLocales")?.addEventListener("click", generarMensajeLocales);
  $("btnLimpiarLocal")?.addEventListener("click", () => {
    limpiarLocForm();
    toast("Formulario local limpio.");
  });

  await cargarVis();
  await cargarLocales();
})();