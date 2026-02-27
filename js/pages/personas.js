import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { mountTopbar, requireAuth } from "./guard.js";
import { qs, toast } from "./utils.js";

mountTopbar("personas");
const session = await requireAuth({ minRole: "viewer" });

const canEdit = session.canEdit;
if (!canEdit) toast("Modo solo lectura: no podés modificar personas.", "err");

const $ = (id) => qs(id);
const tbody = qs("#tbl tbody");

function parseRoles(s) {
  return (s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

async function save() {
  if (!canEdit) return;

  const nombre = ($("#p_nombre").value || "").trim();
  const telefono = ($("#p_tel").value || "").trim();
  const roles = parseRoles($("#p_roles").value);

  if (!nombre) {
    toast("Falta el nombre.", "err");
    return;
  }

  try {
    await addDoc(collection(db, "personas"), {
      nombre,
      telefono,
      roles,
      activo: true,
      creadoEn: serverTimestamp(),
    });
    toast("Guardado.", "ok");
    $("#p_nombre").value = "";
    $("#p_tel").value = "";
    $("#p_roles").value = "";
  } catch (e) {
    toast("Error al guardar: " + (e?.message || e), "err");
  }
}

$("#btnGuardar").addEventListener("click", save);
$("#btnLimpiar").addEventListener("click", () => {
  $("#p_nombre").value = "";
  $("#p_tel").value = "";
  $("#p_roles").value = "";
});

let all = [];

function render() {
  const q = ($("#q").value || "").toLowerCase();
  const rol = ($("#filtroRol").value || "").toLowerCase();

  const rows = all.filter((p) => {
    const hit =
      (p.nombre || "").toLowerCase().includes(q) ||
      (p.telefono || "").toLowerCase().includes(q);
    const hitRol = !rol || (p.roles || []).includes(rol);
    return hit && hitRol;
  });

  tbody.innerHTML = rows
    .map(
      (p) => `
    <tr>
      <td>
        <b>${p.nombre || ""}</b>
        <div class="small muted">${p.activo === false ? "INACTIVO" : ""}</div>
      </td>
      <td>${p.telefono || ""}</td>
      <td>${(p.roles || []).map((r) => `<span class="pill">${r}</span>`).join(" ")}</td>
      <td class="no-print">
        ${
          canEdit
            ? `
          <button class="btn" data-act="edit" data-id="${p.id}">Editar</button>
          <button class="btn" data-act="toggle" data-id="${p.id}">
            ${p.activo === false ? "Activar" : "Desactivar"}
          </button>
          <button class="btn danger" data-act="del" data-id="${p.id}">Borrar</button>
        `
            : `<span class="muted small">Solo lectura</span>`
        }
      </td>
    </tr>
  `
    )
    .join("");
}

$("#q").addEventListener("input", render);
$("#filtroRol").addEventListener("change", render);

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn || !canEdit) return;

  const id = btn.dataset.id;
  const act = btn.dataset.act;

  try {
    if (act === "del") {
      if (!confirm("¿Borrar esta persona?")) return;
      await deleteDoc(doc(db, "personas", id));
      toast("Borrado.", "ok");
      return;
    }

    if (act === "toggle") {
      const p = all.find((x) => x.id === id);
      await updateDoc(doc(db, "personas", id), { activo: !(p?.activo === true) });
      toast("Actualizado.", "ok");
      return;
    }

    if (act === "edit") {
      const p = all.find((x) => x.id === id);
      if (!p) return;

      const nuevoNombre = prompt("Nombre:", p.nombre || "");
      if (!nuevoNombre) return;

      const nuevoTel = prompt("Teléfono (opcional):", p.telefono || "");
      const nuevosRoles = prompt(
        "Roles (separados por coma):",
        (p.roles || []).join(", ")
      );

      const roles = parseRoles(nuevosRoles || "");

      await updateDoc(doc(db, "personas", id), {
        nombre: nuevoNombre.trim(),
        telefono: (nuevoTel || "").trim(),
        roles,
      });

      toast("Persona actualizada.", "ok");
      return;
    }
  } catch (err) {
    toast("Error: " + (err?.message || err), "err");
  }
});

onSnapshot(query(collection(db, "personas"), orderBy("nombre", "asc")), (snap) => {
  all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
});