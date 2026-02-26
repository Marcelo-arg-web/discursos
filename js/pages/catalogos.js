import { listCatalog, upsertCatalogItem, deleteCatalogItem } from "../db.js";
import { escapeHtml, toast } from "../utils.js";

export async function renderCatalogos(root, ctx){
  ctx.setTitle("Discursos y canciones", ctx.canEdit ? "Catálogos" : "Solo lectura");
  root.innerHTML = `
    <div class="grid grid2">
      <div class="card" style="padding:16px">
        <div class="row" style="justify-content:space-between;align-items:flex-end">
          <div>
            <h2>Discursos</h2>
            <p class="muted small">Número → título</p>
          </div>
          ${ctx.canEdit ? `<button class="btn primary" id="addDisc">Agregar</button>` : ""}
        </div>
        <div class="row" style="margin-top:10px">
          <input id="qDisc" placeholder="Buscar…"/>
        </div>
        <div class="tableWrap" id="wrapDisc"></div>
      </div>

      <div class="card" style="padding:16px">
        <div class="row" style="justify-content:space-between;align-items:flex-end">
          <div>
            <h2>Canciones</h2>
            <p class="muted small">Número → título</p>
          </div>
          ${ctx.canEdit ? `<button class="btn primary" id="addCan">Agregar</button>` : ""}
        </div>
        <div class="row" style="margin-top:10px">
          <input id="qCan" placeholder="Buscar…"/>
        </div>
        <div class="tableWrap" id="wrapCan"></div>
      </div>
    </div>

    <div class="card hidden" id="modal" style="padding:16px; margin-top:14px">
      <h2 id="mTitle">Agregar</h2>
      <div class="grid grid2">
        <div>
          <label>Número</label>
          <input id="mNum" placeholder="Ej: 103"/>
        </div>
        <div>
          <label>Título</label>
          <input id="mTitulo" placeholder="Ej: Mantengamos la paz"/>
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="mSave">Guardar</button>
        <button class="btn" id="mCancel">Cancelar</button>
        <button class="btn danger" id="mDelete" style="margin-left:auto">Eliminar</button>
      </div>
      <p class="muted tiny">Se guarda con id = número. Si ya existe, se actualiza.</p>
    </div>
  `;

  const modal = root.querySelector("#modal");
  let kind = "discursos"; // or canciones
  let editing = null;

  let discursos = await listCatalog("discursos").catch(()=>[]);
  let canciones = await listCatalog("canciones").catch(()=>[]);

  function renderList(kindName, items, wrap, q){
    const term = (q.value||"").toLowerCase().trim();
    const rows = !term ? items : items.filter(x=>
      (x.num||"").toLowerCase().includes(term) ||
      (x.titulo||"").toLowerCase().includes(term)
    );
    wrap.innerHTML = `
      <table>
        <thead><tr><th>N°</th><th>Título</th>${ctx.canEdit ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${rows.map(x=>`
            <tr>
              <td style="font-family:var(--mono)">${escapeHtml(x.num)}</td>
              <td>${escapeHtml(x.titulo||"")}</td>
              ${ctx.canEdit ? `<td><button class="btn" data-edit="${escapeHtml(x.num)}" data-kind="${kindName}">Editar</button></td>` : ""}
            </tr>
          `).join("") || `<tr><td colspan="${ctx.canEdit?3:2}" class="muted">Sin resultados.</td></tr>`}
        </tbody>
      </table>
    `;
    if(ctx.canEdit){
      wrap.querySelectorAll("[data-edit]").forEach(b=>{
        b.addEventListener("click", ()=> openModal(b.dataset.kind, b.dataset.edit));
      });
    }
  }

  function redraw(){
    renderList("discursos", discursos, root.querySelector("#wrapDisc"), root.querySelector("#qDisc"));
    renderList("canciones", canciones, root.querySelector("#wrapCan"), root.querySelector("#qCan"));
  }

  function openModal(k, num=null){
    if(!ctx.canEdit) return;
    kind = k;
    editing = num;
    modal.classList.remove("hidden");
    root.querySelector("#mTitle").textContent = (num ? "Editar" : "Agregar") + " • " + (k === "discursos" ? "Discursos" : "Canciones");
    const list = k === "discursos" ? discursos : canciones;
    const item = num ? list.find(x=>String(x.num)===String(num)) : null;
    root.querySelector("#mNum").value = item?.num || "";
    root.querySelector("#mTitulo").value = item?.titulo || "";
    root.querySelector("#mDelete").classList.toggle("hidden", !num);
    root.querySelector("#mNum").disabled = !!num; // id stable
  }

  function closeModal(){
    modal.classList.add("hidden");
    editing = null;
  }

  async function refresh(){
    [discursos, canciones] = await Promise.all([
      listCatalog("discursos").catch(()=>[]),
      listCatalog("canciones").catch(()=>[])
    ]);
    redraw();
  }

  root.querySelector("#qDisc").addEventListener("input", redraw);
  root.querySelector("#qCan").addEventListener("input", redraw);

  if(ctx.canEdit){
    root.querySelector("#addDisc").addEventListener("click", ()=>openModal("discursos", null));
    root.querySelector("#addCan").addEventListener("click", ()=>openModal("canciones", null));
    root.querySelector("#mCancel").addEventListener("click", closeModal);

    root.querySelector("#mSave").addEventListener("click", async ()=>{
      const num = root.querySelector("#mNum").value.trim();
      const titulo = root.querySelector("#mTitulo").value.trim();
      if(!num) return toast("Falta el número");
      await upsertCatalogItem(kind, num, titulo);
      toast("Guardado");
      closeModal();
      await refresh();
    });

    root.querySelector("#mDelete").addEventListener("click", async ()=>{
      const num = root.querySelector("#mNum").value.trim();
      if(!num) return;
      if(!confirm("¿Eliminar este ítem?")) return;
      await deleteCatalogItem(kind, num);
      toast("Eliminado");
      closeModal();
      await refresh();
    });
  }

  redraw();
}
