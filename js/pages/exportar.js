import { listAsignaciones, listPersonas, listCatalog } from "../db.js";
import { csvEscape, downloadText, escapeHtml, formatDateISO, toast } from "../utils.js";

export async function renderExportar(root, ctx){
  ctx.setTitle("Exportar / Imprimir", "PDF (impresión) y CSV");
  root.innerHTML = `
    <div class="card" style="padding:16px">
      <h2>Exportar</h2>
      <p class="muted small">Podés imprimir (Guardar como PDF) o exportar CSV para Excel.</p>

      <div class="grid grid3">
        <div>
          <label>Desde</label>
          <input id="from" type="date"/>
        </div>
        <div>
          <label>Hasta</label>
          <input id="to" type="date"/>
        </div>
        <div style="align-self:end">
          <button class="btn" id="btnLoad">Cargar</button>
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="btnPrint">Imprimir / PDF</button>
        <button class="btn" id="btnCSV">Descargar CSV</button>
      </div>

      <hr/>
      <div id="preview" class="card" style="padding:16px; border-radius:16px; background:#fff"></div>
    </div>
  `;

  const preview = root.querySelector("#preview");

  const [personas, discursos, canciones] = await Promise.all([
    listPersonas().catch(()=>[]),
    listCatalog("discursos").catch(()=>[]),
    listCatalog("canciones").catch(()=>[]),
  ]);

  const pBy = new Map(personas.map(p=>[p.id, p.nombre||""]));
  const dBy = new Map(discursos.map(d=>[String(d.num), d.titulo||""]));
  const cBy = new Map(canciones.map(c=>[String(c.num), c.titulo||""]));

  let current = [];

  async function load(){
    const fromISO = root.querySelector("#from").value || null;
    const toISO = root.querySelector("#to").value || null;
    current = await listAsignaciones({fromISO, toISO}).catch(()=>[]);
    render();
  }

  function render(){
    const rows = current.map(a=>{
      const disc = (a.numDiscurso||"").trim();
      const discTit = disc ? (dBy.get(disc)||"") : "";
      const ca = (a.cancionA||"").trim();
      const ci = (a.cancionI||"").trim();
      const cf = (a.cancionF||"").trim();

      const fmtSong = (n)=> n ? (n + (cBy.get(n) ? " — " + cBy.get(n) : "")) : "—";

      return `
        <tr>
          <td>${formatDateISO(a.fechaISO)}</td>
          <td>${escapeHtml(a.tipo||"")}</td>
          <td>${escapeHtml(a.lugar||"")}</td>
          <td>${escapeHtml(pBy.get(a.presidenteId)||"—")}</td>
          <td>${escapeHtml(pBy.get(a.oradorId)||a.oradorNombre||"—")}</td>
          <td>${escapeHtml(disc + (discTit ? " — " + discTit : ""))}</td>
          <td class="muted">${escapeHtml(fmtSong(ca))}<br>${escapeHtml(fmtSong(ci))}<br>${escapeHtml(fmtSong(cf))}</td>
        </tr>
      `;
    }).join("");

    preview.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:baseline">
        <div>
          <div style="font-weight:900; font-size:16px">Asignaciones</div>
          <div class="muted tiny">Vista previa</div>
        </div>
        <div class="badge info">${current.length} registros</div>
      </div>
      <div class="tableWrap" style="margin-top:10px">
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Reunión</th><th>Lugar</th><th>Presidente</th><th>Orador</th><th>Discurso</th><th>Canciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="7" class="muted">No hay datos en ese rango.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function makeCSV(){
    const header = ["fechaISO","reunion","lugar","presidente","acom1","acom2","mic1","mic2","audio","video","conductor","orador","numDiscurso","cancionA","cancionI","cancionF","notas"];
    const lines = [header.join(",")];
    for(const a of current){
      const row = [
        a.fechaISO||"",
        a.tipo||"",
        a.lugar||"",
        pBy.get(a.presidenteId)||"",
        pBy.get(a.acom1Id)||"",
        pBy.get(a.acom2Id)||"",
        pBy.get(a.mic1Id)||"",
        pBy.get(a.mic2Id)||"",
        pBy.get(a.audioId)||"",
        pBy.get(a.videoId)||"",
        pBy.get(a.conductorId)||"",
        pBy.get(a.oradorId)||a.oradorNombre||"",
        a.numDiscurso||"",
        a.cancionA||"",
        a.cancionI||"",
        a.cancionF||"",
        a.notas||""
      ].map(csvEscape);
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }

  function openPrint(){
    const html = `<!doctype html><html lang="es"><head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Asignaciones</title>
      <style>
        body{font-family:Arial,sans-serif;padding:18px}
        h1{margin:0 0 6px 0;font-size:18px}
        .muted{color:#666;font-size:12px;margin:0 0 14px 0}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px;vertical-align:top}
        th{background:#f3f6ff}
      </style>
    </head><body>
      <h1>Asignaciones</h1>
      <p class="muted">Generado desde Arreglos de Discursos</p>
      ${preview.innerHTML}
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
    const w = window.open("", "_blank");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  root.querySelector("#btnLoad").addEventListener("click", load);
  root.querySelector("#btnCSV").addEventListener("click", ()=>{
    const csv = makeCSV();
    downloadText("asignaciones.csv", csv, "text/csv;charset=utf-8");
    toast("CSV descargado");
  });
  root.querySelector("#btnPrint").addEventListener("click", ()=>{
    if(!current.length) return toast("No hay datos para imprimir");
    openPrint();
  });

  // default month
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  root.querySelector("#from").value = new Date(y,m,1).toISOString().slice(0,10);
  root.querySelector("#to").value = new Date(y,m+1,0).toISOString().slice(0,10);

  await load();
}
