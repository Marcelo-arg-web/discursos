import { db } from "../firebase.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { mountTopbar, requireAuth } from "../guard.js";
import { qs } from "../utils.js";

mountTopbar("imprimir");
await requireAuth({ minRole: "viewer" });

const $ = (id) => qs(id);

const contenido = qs("#contenido");
const mesInput = $("#mes");

function guessMonth() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}
mesInput.value = guessMonth();

function showAcomodadores(x) {
  const aud = x.roles?.acomodadorAuditorio || "";
  const ent = x.roles?.acomodadorEntrada || "";
  const viejo = x.roles?.acomodador || "";
  if (aud || ent) return `${aud || "—"} / ${ent || "—"}`;
  if (viejo) return viejo;
  return "—";
}

function render(list) {
  const mes = (mesInput.value || "").trim();
  const rows = mes ? list.filter((x) => String(x.fechaSab || "").startsWith(mes)) : list;

  if (!rows.length) {
    contenido.innerHTML = `<div class="muted">No hay asignaciones para ese filtro.</div>`;
    return;
  }

  contenido.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px;">
      <div>
        <div class="h2">Villa Fiad · Tablero de asignaciones</div>
        <div class="muted small">Mes: <b>${mes || "—"}</b></div>
      </div>
      <div class="muted small">Generado: ${new Date().toLocaleString()}</div>
    </div>
    <hr class="sep"/>
    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Presidente</th>
          <th>Plataforma</th>
          <th>Microfonistas</th>
          <th>Acomodadores (Aud/Ent)</th>
          <th>Audio / Video</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((x) => `
          <tr>
            <td>
              <b>Sáb ${x.fechaSab}</b> <span class="small muted">${x.horaSab || ""}</span>
              ${x.hayDom ? `<div class="small muted">Dom ${x.fechaDom || ""} ${x.horaDom || ""}</div>` : ``}
            </td>
            <td>${x.roles?.presidente || "—"}</td>
            <td>${x.roles?.plataforma || "—"}</td>
            <td>${(x.roles?.micro1 || "—")}<br>${(x.roles?.micro2 || "—")}</td>
            <td>${showAcomodadores(x)}</td>
            <td>${(x.roles?.audio || "—")}<br>${(x.roles?.video || "—")}</td>
            <td>${x.notas ? `<span class="small">${x.notas}</span>` : ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

$("#btnPrint").addEventListener("click", () => window.print());
mesInput.addEventListener("input", () => render(all));

let all = [];
onSnapshot(query(collection(db, "asignaciones"), orderBy("fechaSab", "asc")), (snap) => {
  all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render(all);
});
