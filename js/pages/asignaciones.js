import { db } from "../firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { mountTopbar, requireAuth } from "../guard.js";
import { qs, toast } from "../utils.js";

mountTopbar("asignaciones");
const session = await requireAuth({ minRole: "viewer" });
const canEdit = session.canEdit;
if (!canEdit) toast("Modo solo lectura: no podés crear/editar asignaciones.", "err");

const $ = (id) => qs(id);
const tbody = qs("#tbl tbody");

function setDomEnabled() {
  const on = $("#hayDom").value === "si";
  $("#fechaDom").disabled = !on;
  $("#horaDom").disabled = !on;
}
$("#hayDom").addEventListener("change", setDomEnabled);
setDomEnabled();

let personas = [];

import {
  onSnapshot as onSnapP,
  collection as colP,
  query as qP,
  orderBy as obP,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

onSnapP(qP(colP(db, "personas"), obP("nombre", "asc")), (snap) => {
  personas = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.activo !== false);
  fillSelects();
});

function optHtml(list, placeholder = "—") {
  return (
    `<option value="">${placeholder}</option>` +
    list.map((p) => `<option value="${p.nombre}">${p.nombre}</option>`).join("")
  );
}

function byRole(role) {
  const r = role.toLowerCase();
  return personas.filter((p) =>
    (p.roles || []).map((x) => String(x).toLowerCase()).includes(r)
  );
}

function pickList(roleFallback, rolePrimary) {
  const pri = byRole(rolePrimary);
  if (pri.length) return pri;

  const fb = byRole(roleFallback);
  if (fb.length) return fb;

  return personas;
}

function fillSelects() {
  $("#presidente").innerHTML = optHtml(pickList("presidente", "presidente"), "Seleccionar…");
  $("#plataforma").innerHTML = optHtml(pickList("plataforma", "plataforma"), "Seleccionar…");
  $("#micro1").innerHTML = optHtml(pickList("microfonista", "microfonista"), "Seleccionar…");
  $("#micro2").innerHTML = optHtml(pickList("microfonista", "microfonista"), "Seleccionar…");

  $("#acomodadorAuditorio").innerHTML = optHtml(
    pickList("acomodador", "acomodador-auditorio"),
    "Seleccionar…"
  );
  $("#acomodadorEntrada").innerHTML = optHtml(
    pickList("acomodador", "acomodador-entrada"),
    "Seleccionar…"
  );

  $("#audio").innerHTML = optHtml(pickList("audio", "audio"), "Seleccionar…");
  $("#video").innerHTML = optHtml(pickList("video", "video"), "Seleccionar…");
}

function getVal(id) {
  return ($(id).value || "").trim();
}

async function crear() {
  if (!canEdit) return;

  const fechaSab = getVal("#fechaSab");
  const horaSab = getVal("#horaSab") || "19:30";
  const hayDom = $("#hayDom").value === "si";
  const fechaDom = hayDom ? getVal("#fechaDom") : "";
  const horaDom = hayDom ? (getVal("#horaDom") || "10:00") : "";

  if (!fechaSab) return toast("Elegí la fecha del sábado.", "err");
  if (hayDom && !fechaDom) return toast("Elegí la fecha del domingo.", "err");

  const data = {
    fechaSab,
    horaSab,
    hayDom,
    fechaDom,
    horaDom,
    roles: {
      presidente: getVal("#presidente"),
      plataforma: getVal("#plataforma"),
      micro1: getVal("#micro1"),
      micro2: getVal("#micro2"),
      acomodadorAuditorio: getVal("#acomodadorAuditorio"),
      acomodadorEntrada: getVal("#acomodadorEntrada"),
      audio: getVal("#audio"),
      video: getVal("#video"),
    },
    notas: ($("#notas").value || "").trim(),
    creadoEn: serverTimestamp(),
    creadoPor: session.user.email || "",
  };

  try {
    await addDoc(collection(db, "asignaciones"), data);
    toast("Semana guardada.", "ok");
  } catch (e) {
    toast("Error al guardar: " + (e?.message || e), "err");
  }
}

$("#btnCrear").addEventListener("click", crear);

$("#btnNuevo").addEventListener("click", () => {
  $("#fechaSab").value = "";
  $("#horaSab").value = "19:30";
  $("#hayDom").value = "no";
  setDomEnabled();
  $("#fechaDom").value = "";
  $("#horaDom").value = "10:00";

  [
    "#presidente",
    "#plataforma",
    "#micro1",
    "#micro2",
    "#acomodadorAuditorio",
    "#acomodadorEntrada",
    "#audio",
    "#video",
  ].forEach((id) => ($(id).value = ""));

  $("#notas").value = "";
});

let all = [];

function showAcomodadores(x) {
  const aud = x.roles?.acomodadorAuditorio || "";
  const ent = x.roles?.acomodadorEntrada || "";
  const viejo = x.roles?.acomodador || "";

  if (aud || ent) return `Aud: ${aud || "—"} · Ent: ${ent || "—"}`;
  if (viejo) return viejo;
  return "—";
}

function render() {
  const q = ($("#q").value || "").toLowerCase();
  const ord = $("#orden").value;

  const sorted = [...all].sort((a, b) => {
    const da = a.fechaSab || "";
    const db = b.fechaSab || "";
    return ord === "asc" ? da.localeCompare(db) : db.localeCompare(da);
  });

  const rows = sorted.filter((x) => JSON.stringify(x).toLowerCase().includes(q));

  tbody.innerHTML = rows
    .map(
      (x) => `
    <tr>
      <td>
        <b>Sáb ${x.fechaSab} ${x.horaSab || ""}</b>
        ${
          x.hayDom
            ? `<div class="small muted">Dom ${x.fechaDom} ${x.horaDom || ""}</div>`
            : `<div class="small muted">Sin domingo</div>`
        }
      </td>
      <td>
        <div class="small">
          <b>Pres:</b> ${x.roles?.presidente || "—"} ·
          <b>Plat:</b> ${x.roles?.plataforma || "—"} ·
          <b>Mic:</b> ${(x.roles?.micro1 || "—")} / ${(x.roles?.micro2 || "—")} ·
          <b>Acom:</b> ${showAcomodadores(x)} ·
          <b>A/V:</b> ${(x.roles?.audio || "—")} / ${(x.roles?.video || "—")}
        </div>
        ${x.notas ? `<div class="small muted">${x.notas}</div>` : ``}
      </td>
      <td class="no-print">
        ${
          canEdit
            ? `<button class="btn danger" data-id="${x.id}">Borrar</button>`
            : `<span class="muted small">Solo lectura</span>`
        }
      </td>
    </tr>
  `
    )
    .join("");
}

$("#q").addEventListener("input", render);
$("#orden").addEventListener("change", render);

tbody.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || !canEdit) return;

  const id = b.dataset.id;
  if (!confirm("¿Borrar esta semana?")) return;

  try {
    await deleteDoc(doc(db, "asignaciones", id));
    toast("Borrado.", "ok");
  } catch (err) {
    toast("Error: " + (err?.message || err), "err");
  }
});

onSnapshot(query(collection(db, "asignaciones"), orderBy("fechaSab", "desc")), (snap) => {
  all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
});
