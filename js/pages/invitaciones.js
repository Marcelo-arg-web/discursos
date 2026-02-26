import { listAsignaciones, listPersonas, listCatalog } from "../db.js";
import { escapeHtml, formatDateISO, toast } from "../utils.js";

export async function renderInvitaciones(root, ctx){
  ctx.setTitle("Invitaciones", "Generar mensaje (WhatsApp)");
  root.innerHTML = `
    <div class="card" style="padding:16px">
      <h2>Generar invitación</h2>
      <p class="muted small">Elegí una asignación y te arma el texto listo para copiar o abrir WhatsApp.</p>

      <div class="grid grid3">
        <div style="grid-column: span 2">
          <label>Asignación</label>
          <select id="selAsig"></select>
        </div>
        <div>
          <label>Modo</label>
          <select id="modo">
            <option value="orador">Invitar orador</option>
            <option value="equipo">Aviso equipo (presidente/acom/mic/audio/video)</option>
          </select>
        </div>
      </div>

      <div class="grid grid2" style="margin-top:10px">
        <div>
          <label>Nombre destinatario (opcional)</label>
          <input id="dest" placeholder="Ej: Hermano Juan"/>
        </div>
        <div>
          <label>Teléfono destinatario (opcional)</label>
          <input id="tel" placeholder="Ej: 3811234567 (sin +)"/>
        </div>
      </div>

      <label>Mensaje</label>
      <textarea id="msg" spellcheck="false"></textarea>

      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="btnCopy">Copiar</button>
        <a class="btn" id="btnWa" target="_blank" rel="noopener">Abrir WhatsApp</a>
        <button class="btn" id="btnRefresh" type="button">Actualizar</button>
      </div>

      <p class="muted tiny">Tip: si guardás teléfonos en “Personas”, después podemos autocompletar automáticamente.</p>
    </div>
  `;

  const [asigsRaw, personas, discursos, canciones] = await Promise.all([
    listAsignaciones().catch(()=>[]),
    listPersonas().catch(()=>[]),
    listCatalog("discursos").catch(()=>[]),
    listCatalog("canciones").catch(()=>[]),
  ]);

  const discBy = new Map(discursos.map(d=>[String(d.num), d.titulo||""]));
  const canBy = new Map(canciones.map(c=>[String(c.num), c.titulo||""]));
  const personasById = new Map(personas.map(p=>[p.id, p]));

  const asigs = asigsRaw.slice().sort((a,b)=> (a.fechaISO||"").localeCompare(b.fechaISO||""));

  const selAsig = root.querySelector("#selAsig");
  selAsig.innerHTML = asigs.map(a=>{
    const label = `${formatDateISO(a.fechaISO)} • ${a.tipo||""} • ${a.lugar||""}`;
    return `<option value="${escapeHtml(a.id)}">${escapeHtml(label)}</option>`;
  }).join("") || `<option value="">(No hay asignaciones)</option>`;

  const txt = root.querySelector("#msg");
  const modo = root.querySelector("#modo");
  const dest = root.querySelector("#dest");
  const tel = root.querySelector("#tel");
  const btnWa = root.querySelector("#btnWa");

  function name(id){ return personasById.get(id)?.nombre || ""; }

  function build(){
    const id = selAsig.value;
    const a = asigs.find(x=>x.id===id);
    if(!a){
      txt.value = "";
      btnWa.href = "https://wa.me/";
      return;
    }

    const fecha = formatDateISO(a.fechaISO);
    const lugar = a.lugar || "—";
    const reunion = a.tipo || "—";

    const discursoNum = (a.numDiscurso||"").trim();
    const discursoTit = discursoNum ? (discBy.get(discursoNum) || "") : "";
    const cA = (a.cancionA||"").trim();
    const cI = (a.cancionI||"").trim();
    const cF = (a.cancionF||"").trim();

    const saludo = dest.value.trim() ? `Hola ${dest.value.trim()},` : "Hola,";

    let body = "";
    if(modo.value === "orador"){
      const orador = name(a.oradorId) || a.oradorNombre || "—";
      body =
`${saludo}

Te escribo para confirmar tu asignación como orador.

📅 Fecha: ${fecha}
🕘 Reunión: ${reunion}
📍 Lugar: ${lugar}

🗣️ Discurso: ${discursoNum}${discursoTit ? " — " + discursoTit : ""}

Si necesitás algo, avisame. ¡Gracias!`;
    }else{
      body =
`${saludo}

Te paso el aviso de asignación para la reunión:

📅 Fecha: ${fecha}
🕘 Reunión: ${reunion}
📍 Lugar: ${lugar}

👤 Presidente: ${name(a.presidenteId) || "—"}
🚪 Acomodadores: ${(name(a.acom1Id)||"—")} / ${(name(a.acom2Id)||"—")}
🎤 Microfonistas: ${(name(a.mic1Id)||"—")} / ${(name(a.mic2Id)||"—")}
🎚️ Audio: ${name(a.audioId) || "—"}
🎥 Video: ${name(a.videoId) || "—"}
📖 Conductor: ${name(a.conductorId) || "—"}

🎵 Canciones: ${cA}${cA && canBy.get(cA) ? " — " + canBy.get(cA) : ""} / ${cI}${cI && canBy.get(cI) ? " — " + canBy.get(cI) : ""} / ${cF}${cF && canBy.get(cF) ? " — " + canBy.get(cF) : ""}

Gracias.`;
    }

    txt.value = body;

    const phone = tel.value.trim().replaceAll(" ","").replaceAll("-","");
    const encoded = encodeURIComponent(body);
    btnWa.href = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }

  selAsig.addEventListener("change", build);
  modo.addEventListener("change", build);
  dest.addEventListener("input", build);
  tel.addEventListener("input", build);
  root.querySelector("#btnRefresh").addEventListener("click", build);

  root.querySelector("#btnCopy").addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(txt.value);
      toast("Copiado");
    }catch{
      txt.select();
      document.execCommand("copy");
      toast("Copiado");
    }
  });

  build();
}
