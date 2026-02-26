import { listAsignaciones, upsertAsignacion, deleteAsignacion, listCatalog, listPersonas } from "../db.js";
import { escapeHtml, formatDateISO, toast } from "../utils.js";

export async function renderAsignaciones(root, ctx){
  ctx.setTitle("Asignaciones", ctx.canEdit ? "Cargar y editar" : "Solo lectura");
  root.innerHTML = `
    <div class="card" style="padding:16px">
      <div class="row" style="justify-content:space-between; align-items:flex-end">
        <div>
          <h2>Asignaciones por reunión</h2>
          <p class="muted small">Cargá la fecha, lugar, tipo y los participantes.</p>
        </div>
        ${ctx.canEdit ? `<button class="btn primary" id="btnNueva">Nueva asignación</button>` : ""}
      </div>

      <div class="grid grid3" style="margin-top:10px">
        <div>
          <label>Desde</label>
          <input id="from" type="date"/>
        </div>
        <div>
          <label>Hasta</label>
          <input id="to" type="date"/>
        </div>
        <div style="align-self:end">
          <button class="btn" id="btnBuscar">Buscar</button>
        </div>
      </div>

      <div class="tableWrap" id="wrap" style="margin-top:12px"></div>
    </div>

    <div class="card hidden" id="form" style="padding:16px; margin-top:14px">
      <div class="row" style="justify-content:space-between; align-items:flex-end">
        <div>
          <h2 id="fTitle">Nueva asignación</h2>
          <p class="muted small" id="fSub">Al poner números, el título se autocompleta.</p>
        </div>
        <span class="badge info" id="fMode">—</span>
      </div>

      <div class="grid grid3">
        <div>
          <label>Fecha</label>
          <input id="fecha" type="date"/>
        </div>
        <div>
          <label>Lugar</label>
          <select id="lugar">
            <option value="Villa Fiad">Villa Fiad</option>
            <option value="Santa Rosa">Santa Rosa</option>
          </select>
        </div>
        <div>
          <label>Reunión</label>
          <select id="tipo">
            <option value="Sábado 19:30">Sábado 19:30</option>
            <option value="Domingo 10:00">Domingo 10:00</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
      </div>

      <hr/>

      <h3 style="margin:0 0 10px 0">Participantes</h3>
      <div class="grid grid3">
        <div><label>Presidente</label><select id="presidente"></select></div>
        <div><label>Acomodador 1</label><select id="acom1"></select></div>
        <div><label>Acomodador 2</label><select id="acom2"></select></div>
        <div><label>Microfonista 1</label><select id="mic1"></select></div>
        <div><label>Microfonista 2</label><select id="mic2"></select></div>
        <div><label>Audio</label><select id="audio"></select></div>
        <div><label>Video</label><select id="video"></select></div>
        <div><label>Conductor La Atalaya</label><select id="conductor"></select></div>
        <div><label>Orador / Discursante</label><select id="orador"></select></div>
      </div>

      <hr/>

      <h3 style="margin:0 0 10px 0">Discursos y canciones</h3>
      <div class="grid grid3">
        <div>
          <label>N° Discurso</label>
          <input id="numDiscurso" placeholder="Ej: 12"/>
          <div class="muted tiny" id="titDiscurso">—</div>
        </div>
        <div>
          <label>Canción apertura</label>
          <input id="cA" placeholder="Ej: 3"/>
          <div class="muted tiny" id="tA">—</div>
        </div>
        <div>
          <label>Canción intermedia</label>
          <input id="cI" placeholder="Ej: 44"/>
          <div class="muted tiny" id="tI">—</div>
        </div>
        <div>
          <label>Canción final</label>
          <input id="cF" placeholder="Ej: 123"/>
          <div class="muted tiny" id="tF">—</div>
        </div>
        <div class="grid" style="grid-column: span 2">
          <label>Notas (opcional)</label>
          <input id="notas" placeholder="Ej: visitante, cambios, etc."/>
        </div>
      </div>

      <div class="row" style="margin-top:14px">
        <button class="btn primary" id="btnGuardar">Guardar</button>
        <button class="btn" id="btnCancelar">Cancelar</button>
        <button class="btn danger" id="btnEliminar" style="margin-left:auto">Eliminar</button>
      </div>
    </div>
  `;

  const wrap = root.querySelector("#wrap");
  const form = root.querySelector("#form");

  const personas = await listPersonas().catch(()=>[]);
  const discursos = await listCatalog("discursos").catch(()=>[]);
  const canciones = await listCatalog("canciones").catch(()=>[]);

  const discursoByNum = new Map(discursos.map(x=>[String(x.num), x.titulo||""]));
  const cancionByNum = new Map(canciones.map(x=>[String(x.num), x.titulo||""]));

  function fillSelect(sel){
    sel.innerHTML = `<option value="">—</option>` + personas.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre||"")}</option>`).join("");
  }

  const selIds = ["presidente","acom1","acom2","mic1","mic2","audio","video","conductor","orador"];
  selIds.forEach(id=> fillSelect(root.querySelector("#"+id)));

  let editingId = null;

  function personaName(id){
    return personas.find(p=>p.id===id)?.nombre || "";
  }

  function setAutoTitles(){
    const n = root.querySelector("#numDiscurso").value.trim();
    root.querySelector("#titDiscurso").textContent = n ? (discursoByNum.get(n) || "—") : "—";
    const a = root.querySelector("#cA").value.trim();
    const i = root.querySelector("#cI").value.trim();
    const f = root.querySelector("#cF").value.trim();
    root.querySelector("#tA").textContent = a ? (cancionByNum.get(a) || "—") : "—";
    root.querySelector("#tI").textContent = i ? (cancionByNum.get(i) || "—") : "—";
    root.querySelector("#tF").textContent = f ? (cancionByNum.get(f) || "—") : "—";
  }

  ["numDiscurso","cA","cI","cF"].forEach(id=>{
    root.querySelector("#"+id).addEventListener("input", setAutoTitles);
  });

  function closeForm(){
    form.classList.add("hidden");
    editingId = null;
  }

  function openForm(item=null){
    if(!ctx.canEdit && !item) return;
    form.classList.remove("hidden");
    editingId = item?.id || null;

    root.querySelector("#fTitle").textContent = editingId ? "Editar asignación" : "Nueva asignación";
    root.querySelector("#fMode").textContent = ctx.canEdit ? "Edición habilitada" : "Solo lectura";
    root.querySelector("#btnEliminar").classList.toggle("hidden", !editingId || !ctx.canEdit);
    root.querySelector("#btnGuardar").disabled = !ctx.canEdit;

    root.querySelector("#fecha").value = item?.fechaISO || "";
    root.querySelector("#lugar").value = item?.lugar || "Villa Fiad";
    root.querySelector("#tipo").value = item?.tipo || "Sábado 19:30";

    // selects
    root.querySelector("#presidente").value = item?.presidenteId || "";
    root.querySelector("#acom1").value = item?.acom1Id || "";
    root.querySelector("#acom2").value = item?.acom2Id || "";
    root.querySelector("#mic1").value = item?.mic1Id || "";
    root.querySelector("#mic2").value = item?.mic2Id || "";
    root.querySelector("#audio").value = item?.audioId || "";
    root.querySelector("#video").value = item?.videoId || "";
    root.querySelector("#conductor").value = item?.conductorId || "";
    root.querySelector("#orador").value = item?.oradorId || "";

    root.querySelector("#numDiscurso").value = item?.numDiscurso || "";
    root.querySelector("#cA").value = item?.cancionA || "";
    root.querySelector("#cI").value = item?.cancionI || "";
    root.querySelector("#cF").value = item?.cancionF || "";
    root.querySelector("#notas").value = item?.notas || "";
    setAutoTitles();
    form.scrollIntoView({behavior:"smooth", block:"start"});
  }

  async function loadList(){
    const fromISO = root.querySelector("#from").value || null;
    const toISO = root.querySelector("#to").value || null;
    const list = await listAsignaciones({fromISO, toISO}).catch(()=>[]);
    renderTable(list);
  }

  function renderTable(list){
    const rows = list.map(a=>{
      return `<tr>
        <td>${formatDateISO(a.fechaISO)}</td>
        <td>${escapeHtml(a.tipo||"")}</td>
        <td>${escapeHtml(a.lugar||"")}</td>
        <td>${escapeHtml(personaName(a.oradorId) || a.oradorNombre || "")}</td>
        <td class="muted">${escapeHtml(a.numDiscurso||"")}</td>
        <td>${ctx.canEdit ? `<button class="btn" data-edit="${a.id}">Editar</button>` : `<button class="btn" data-view="${a.id}">Ver</button>`}</td>
      </tr>`;
    }).join("");

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Fecha</th><th>Reunión</th><th>Lugar</th><th>Orador</th><th>Discurso</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">Sin asignaciones.</td></tr>`}</tbody>
      </table>
    `;

    wrap.querySelectorAll("[data-edit]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const item = list.find(x=>x.id===b.dataset.edit);
        openForm(item);
      });
    });
    wrap.querySelectorAll("[data-view]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const item = list.find(x=>x.id===b.dataset.view);
        openForm(item);
      });
    });
  }

  root.querySelector("#btnBuscar").addEventListener("click", loadList);

  if(ctx.canEdit){
    root.querySelector("#btnNueva").addEventListener("click", ()=> openForm(null));
  }

  root.querySelector("#btnCancelar").addEventListener("click", closeForm);

  root.querySelector("#btnGuardar").addEventListener("click", async ()=>{
    if(!ctx.canEdit) return;
    const fechaISO = root.querySelector("#fecha").value;
    if(!fechaISO) return toast("Falta la fecha");

    const oradorId = root.querySelector("#orador").value || "";
    const data = {
      id: editingId,
      fechaISO,
      lugar: root.querySelector("#lugar").value,
      tipo: root.querySelector("#tipo").value,

      presidenteId: root.querySelector("#presidente").value || "",
      acom1Id: root.querySelector("#acom1").value || "",
      acom2Id: root.querySelector("#acom2").value || "",
      mic1Id: root.querySelector("#mic1").value || "",
      mic2Id: root.querySelector("#mic2").value || "",
      audioId: root.querySelector("#audio").value || "",
      videoId: root.querySelector("#video").value || "",
      conductorId: root.querySelector("#conductor").value || "",
      oradorId,

      oradorNombre: personaName(oradorId),

      numDiscurso: root.querySelector("#numDiscurso").value.trim(),
      cancionA: root.querySelector("#cA").value.trim(),
      cancionI: root.querySelector("#cI").value.trim(),
      cancionF: root.querySelector("#cF").value.trim(),
      notas: root.querySelector("#notas").value.trim()
    };

    await upsertAsignacion(data);
    toast("Guardado");
    closeForm();
    await loadList();
  });

  root.querySelector("#btnEliminar").addEventListener("click", async ()=>{
    if(!ctx.canEdit || !editingId) return;
    if(!confirm("¿Eliminar esta asignación?")) return;
    await deleteAsignacion(editingId);
    toast("Eliminado");
    closeForm();
    await loadList();
  });

  // default range: current month
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1).toISOString().slice(0,10);
  const last = new Date(y, m+1, 0).toISOString().slice(0,10);
  root.querySelector("#from").value = first;
  root.querySelector("#to").value = last;

  await loadList();
}
