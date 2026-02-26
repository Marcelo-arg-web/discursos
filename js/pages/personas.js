import { listPersonas, upsertPersona, deletePersona } from "../db.js";
import { escapeHtml, toast } from "../utils.js";

export async function renderPersonas(root, ctx){
  ctx.setTitle("Personas", ctx.canEdit ? "Administrar base" : "Solo lectura");
  root.innerHTML = `
    <div class="card" style="padding:16px">
      <div class="row" style="justify-content:space-between; align-items:flex-end">
        <div>
          <h2>Personas</h2>
          <p class="muted small">Discursantes, conductores, audio/video, etc.</p>
        </div>
        ${ctx.canEdit ? `<button class="btn primary" id="btnNueva">Nueva persona</button>` : ""}
      </div>

      <div class="row" style="margin-top:10px">
        <input id="q" placeholder="Buscar por nombre o email…" />
      </div>

      <div class="tableWrap" id="wrap"></div>
    </div>

    <div class="card hidden" id="modal" style="padding:16px; margin-top:14px">
      <h2 id="mTitle">Nueva persona</h2>
      <div class="grid grid2">
        <div>
          <label>Nombre</label>
          <input id="mNombre" placeholder="Ej: Juan Pérez"/>
        </div>
        <div>
          <label>Teléfono (opcional)</label>
          <input id="mTel" placeholder="Ej: 381 123-4567"/>
        </div>
      </div>
      <div class="grid grid2">
        <div>
          <label>Email (opcional)</label>
          <input id="mEmail" type="email" placeholder="ej@correo.com"/>
        </div>
        <div>
          <label>Visible en invitación</label>
          <select id="mVisible">
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>
      <label>Roles (separados por coma)</label>
      <input id="mRoles" placeholder="discursante, conductor, audio, video, acomodador"/>

      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="mSave">Guardar</button>
        <button class="btn" id="mCancel">Cancelar</button>
        <button class="btn danger" id="mDelete" style="margin-left:auto">Eliminar</button>
      </div>
      <p class="muted tiny">Tip: guardá el teléfono para generar mensajes de WhatsApp.</p>
    </div>
  `;

  const wrap = root.querySelector("#wrap");
  const q = root.querySelector("#q");
  const modal = root.querySelector("#modal");

  let all = await listPersonas().catch(()=>[]);
  let editingId = null;

  function renderTable(rows){
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Roles</th><th>Invitación</th>${ctx.canEdit ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${rows.map(p=>`
            <tr>
              <td><strong>${escapeHtml(p.nombre||"")}</strong></td>
              <td class="muted">${escapeHtml(p.email||"")}</td>
              <td class="muted">${escapeHtml(p.telefono||"")}</td>
              <td class="muted">${escapeHtml((p.roles||[]).join(", "))}</td>
              <td>${p.visibleEnInvitacion ? `<span class="badge ok">Sí</span>` : `<span class="badge warn">No</span>`}</td>
              ${ctx.canEdit ? `<td><button class="btn" data-edit="${p.id}">Editar</button></td>` : ""}
            </tr>
          `).join("") || `<tr><td colspan="${ctx.canEdit ? 6 : 5}" class="muted">Sin resultados.</td></tr>`}
        </tbody>
      </table>
    `;

    if(ctx.canEdit){
      wrap.querySelectorAll("[data-edit]").forEach(b=>{
        b.addEventListener("click", ()=> openModal(b.dataset.edit));
      });
    }
  }

  function applyFilter(){
    const term = (q.value||"").toLowerCase().trim();
    const rows = !term ? all : all.filter(p=>
      (p.nombre||"").toLowerCase().includes(term) ||
      (p.email||"").toLowerCase().includes(term) ||
      (p.telefono||"").toLowerCase().includes(term)
    );
    renderTable(rows);
  }

  function openModal(id=null){
    if(!ctx.canEdit) return;
    editingId = id;
    modal.classList.remove("hidden");
    const p = id ? all.find(x=>x.id===id) : null;
    root.querySelector("#mTitle").textContent = id ? "Editar persona" : "Nueva persona";
    root.querySelector("#mNombre").value = p?.nombre || "";
    root.querySelector("#mTel").value = p?.telefono || "";
    root.querySelector("#mEmail").value = p?.email || "";
    root.querySelector("#mVisible").value = String(!!p?.visibleEnInvitacion);
    root.querySelector("#mRoles").value = (p?.roles || []).join(", ");
    root.querySelector("#mDelete").classList.toggle("hidden", !id);
  }

  function closeModal(){
    modal.classList.add("hidden");
    editingId = null;
  }

  async function refresh(){
    all = await listPersonas().catch(()=>[]);
    applyFilter();
  }

  q.addEventListener("input", applyFilter);

  if(ctx.canEdit){
    root.querySelector("#btnNueva")?.addEventListener("click", ()=> openModal(null));
    root.querySelector("#mCancel").addEventListener("click", closeModal);

    root.querySelector("#mSave").addEventListener("click", async ()=>{
      const nombre = root.querySelector("#mNombre").value.trim();
      if(!nombre) return toast("Falta el nombre");
      const data = {
        id: editingId,
        nombre,
        telefono: root.querySelector("#mTel").value.trim(),
        email: root.querySelector("#mEmail").value.trim(),
        visibleEnInvitacion: root.querySelector("#mVisible").value === "true",
        roles: root.querySelector("#mRoles").value.split(",").map(x=>x.trim()).filter(Boolean)
      };
      await upsertPersona(data);
      toast("Guardado");
      closeModal();
      await refresh();
    });

    root.querySelector("#mDelete").addEventListener("click", async ()=>{
      if(!editingId) return;
      if(!confirm("¿Eliminar esta persona?")) return;
      await deletePersona(editingId);
      toast("Eliminado");
      closeModal();
      await refresh();
    });
  }

  applyFilter();
}
