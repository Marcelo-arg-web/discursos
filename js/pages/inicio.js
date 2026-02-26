import { latestAsignaciones, listPersonas, listCatalog } from "../db.js";
import { formatDateISO, escapeHtml } from "../utils.js";

export async function renderInicio(root, ctx){
  ctx.setTitle("Inicio", "Resumen rápido");
  root.innerHTML = `
    <div class="grid grid2">
      <div class="kpi">
        <div class="muted tiny">Tu rol</div>
        <div class="num">${escapeHtml(ctx.role)}</div>
        <div class="muted small">${ctx.canEdit ? "Podés editar." : "Solo lectura."}</div>
      </div>
      <div class="kpi">
        <div class="muted tiny">Accesos rápidos</div>
        <div class="row" style="margin-top:8px">
          <button class="btn primary" id="goAsig">Asignaciones</button>
          <button class="btn" id="goInv">Invitaciones</button>
          <button class="btn" id="goExp">Exportar</button>
        </div>
      </div>
    </div>

    <hr/>

    <div class="grid grid2">
      <div class="card" style="padding:16px">
        <h2>Próximas asignaciones</h2>
        <p class="muted small">Últimas cargadas (hasta 6)</p>
        <div class="tableWrap" id="tblWrap"></div>
      </div>

      <div class="card" style="padding:16px">
        <h2>Estado del sistema</h2>
        <div class="grid">
          <div class="badge info" id="bPersonas">Personas: …</div>
          <div class="badge info" id="bDisc">Discursos: …</div>
          <div class="badge info" id="bCanc">Canciones: …</div>
        </div>
        <p class="muted small" style="margin-top:12px">
          Tip: cargá primero <strong>Discursos</strong> y <strong>Canciones</strong> para que los títulos salgan automáticos al poner el número.
        </p>
      </div>
    </div>
  `;

  root.querySelector("#goAsig").onclick = ()=>ctx.routeTo("asignaciones");
  root.querySelector("#goInv").onclick = ()=>ctx.routeTo("invitaciones");
  root.querySelector("#goExp").onclick = ()=>ctx.routeTo("exportar");

  const [asigs, personas, discursos, canciones] = await Promise.all([
    latestAsignaciones(6),
    listPersonas().catch(()=>[]),
    listCatalog("discursos").catch(()=>[]),
    listCatalog("canciones").catch(()=>[])
  ]);

  root.querySelector("#bPersonas").textContent = `Personas: ${personas.length}`;
  root.querySelector("#bDisc").textContent = `Discursos: ${discursos.length}`;
  root.querySelector("#bCanc").textContent = `Canciones: ${canciones.length}`;

  const rows = asigs
    .sort((a,b)=> (a.fechaISO||"").localeCompare(b.fechaISO||""))
    .map(a=>{
      const lugar = a.lugar || "—";
      const tipo = a.tipo || "—";
      const orador = a.oradorNombre || "—";
      return `<tr>
        <td>${formatDateISO(a.fechaISO)}</td>
        <td>${escapeHtml(tipo)}</td>
        <td>${escapeHtml(lugar)}</td>
        <td>${escapeHtml(orador)}</td>
      </tr>`;
    }).join("");

  root.querySelector("#tblWrap").innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Reunión</th><th>Lugar</th><th>Orador</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="muted">Todavía no hay asignaciones.</td></tr>`}</tbody>
    </table>
  `;
}
