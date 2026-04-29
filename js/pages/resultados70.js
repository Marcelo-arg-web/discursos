import { auth, db } from "../firebase-config.js?v=20260429b70";
import { hasPublicAccess, setPublicAccess } from "../services/publicAccess.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, orderBy, documentId, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { bosquejos } from "../data/bosquejos.js";

let personasMap = new Map();
let personasMapLoaded = false;

async function loadPersonasMap(){
  if(personasMapLoaded) return;
  personasMapLoaded = true;
  personasMap = new Map();
  try{
    const snap = await readWithTimeout(getDocs(collection(db, "personas")), 6500, "Personas");
    snap.docs.forEach(d=>{
      const x = d.data() || {};
      const nombre = String(x.nombre || x.name || x.apellidoNombre || "").trim();
      if(nombre) personasMap.set(d.id, nombre);
    });
  }catch(e){
    console.warn("No pude cargar personas para resolver nombres en Resultados", e);
  }
}

function nombrePorId(id){
  const key = String(id||"").trim();
  return key ? (personasMap.get(key) || "") : "";
}

function resolveNombre(asig, keys){
  for(const k of keys){
    const v = asig?.[k];
    if(v === undefined || v === null) continue;
    const s = String(v).trim();
    if(!s) continue;
    return nombrePorId(s) || s;
  }
  return "";
}

function mesTitulo(mesISO){
  const [y,m] = String(mesISO||"").split("-").map(Number);
  const dt = (y && m) ? new Date(y, m-1, 1) : new Date();
  return dt.toLocaleDateString("es-AR", { month:"long", year:"numeric" }).replace(/^./, c=>c.toUpperCase());
}

function formatFechaLarga(iso){
  const [y,m,d] = String(iso||"").slice(0,10).split("-").map(Number);
  if(!y || !m || !d) return iso || "—";
  return new Date(y, m-1, d).toLocaleDateString("es-AR", { weekday:"long", day:"numeric", month:"long" });
}

const $ = (id)=>document.getElementById(id);

function isAdminRole(rol){
  const r = String(rol||"").toLowerCase();
  return r === "admin" || r === "superadmin";
}
async function getUsuario(uid){
  const snap = await getDoc(doc(db,"usuarios",uid));
  return snap.exists() ? snap.data() : null;
}
function timeoutValue(ms, value){
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}
function timeoutReject(ms, message){
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message || "La lectura tardó demasiado")), ms));
}
async function readWithTimeout(promise, ms=6500, label="Firestore"){
  return Promise.race([promise, timeoutReject(ms, label + " tardó demasiado. Revisá conexión o permisos.")]);
}
async function getUsuarioSeguro(user){
  if(!user) return null;
  try{
    const u = await Promise.race([
      getUsuario(user.uid),
      timeoutValue(2500, { _timeout:true, uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true })
    ]);
    if(u && u._timeout) console.warn("Tiempo de espera leyendo /usuarios del usuario actual. Se sigue como usuario autenticado.");
    return u || { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _missingProfile:true };
  }catch(e){
    console.warn("No pude leer /usuarios del usuario actual. Se sigue como usuario autenticado.", e);
    return { uid:user.uid, email:user.email, nombre:user.email, rol:"viewer", activo:true, _readError:true };
  }
}
function renderAdminTopbar(){
  document.body.classList.add("pro-online", "has-topbar");
  document.body.classList.remove("public-view");
  const el = document.getElementById("topbar");
  if(!el) return;
  el.dataset.realShell = "1";
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html">Panel</a>
        <a href="asignaciones.html">Asignaciones</a>
        <a href="resultados.html" class="active">Resultados</a>
        <a href="documentos.html">Documentos/PDF</a>
        <a href="visitantes.html">Visitantes</a>
        <a href="salientes.html">Salientes</a>
        <a href="funciones.html">Funciones</a>
        <a href="funciones.html">Funciones</a>
        <a href="usuarios.html">Usuarios</a>
        <a href="perfil.html">Mi perfil</a>
      </div>
      <div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div>
    </div>`;
  document.getElementById("btnSalir")?.addEventListener("click", async()=>{ await signOut(auth); location.href="index.html"; });
}
function renderViewerTopbar(name="Usuario"){
  document.body.classList.add("pro-online", "has-topbar", "viewer-result-mode");
  document.body.classList.toggle("public-view", hasPublicAccess());
  const el = document.getElementById("topbar");
  if(!el) return;
  el.dataset.realShell = "1";
  el.innerHTML = `
    <div class="topbar viewer-topbar resultados-only">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links viewer-links">
        <a href="resultados.html" class="active">Resultados</a>
        ${hasPublicAccess() ? "" : '<a href="perfil.html">Mi perfil</a>'}
      </div>
      <div class="actions">
        <span class="badge">Solo lectura</span>
        <span class="badge soft">${escapeHtml(name)}</span>
        <button id="btnSalir" class="btn danger sm" type="button">Salir</button>
      </div>
    </div>`;
  document.getElementById("btnSalir")?.addEventListener("click", async()=>{
    if(hasPublicAccess()){ setPublicAccess(false); location.href="index.html"; return; }
    await signOut(auth); location.href="index.html";
  });
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function todayISO(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function currentYM(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function formatDate(iso){
  if(!iso) return "—";
  const [y,m,d] = String(iso).slice(0,10).split('-').map(Number);
  if(!y || !m || !d) return iso;
  return new Date(y, m-1, d).toLocaleDateString("es-AR", { weekday:"short", day:"2-digit", month:"2-digit" });
}

const LOCALES_VILLA_FIAD = [
  "Marcelo Palavecino",
  "Sergio Saldaña",
  "Luis Navarro",
  "Leonardo Araya",
  "Marcelo Rodríguez",
  "Marcelo Rodriguez"
];
let clavesDiscursantesLocales = new Set(LOCALES_VILLA_FIAD.map(n => normalKey(n)));
function normalKey(s){
  return String(s||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function canonicalLocalName(nombre){
  const k = normalKey(nombre);
  if(k === "marcelo rodriguez" || k === "marcelo rodrigez") return "Marcelo Rodríguez";
  if(k === "marcelo palevecino") return "Marcelo Palavecino";
  const found = LOCALES_VILLA_FIAD.find(n => normalKey(n) === k);
  return found || String(nombre||"").trim();
}
function isLocalSaliente(row){
  const nombre = canonicalLocalName(row?.orador || row?.oradorNombre || row?.hermano || row?.nombre || "");
  if(!nombre) return false;
  return clavesDiscursantesLocales.has(normalKey(nombre));
}
function addLocalSpeaker(nombre){
  const k = normalKey(nombre);
  if(k) clavesDiscursantesLocales.add(k);
}
async function cargarDiscursantesLocales(){
  // En Resultados solo se muestran salidas de discursantes locales de Villa Fiad.
  // No se suman visitantes ni conferenciantes de otras congregaciones aunque existan en otras colecciones.
  clavesDiscursantesLocales = new Set(LOCALES_VILLA_FIAD.map(n => normalKey(n)));
}

function salienteFecha(row){
  return String(row?.fecha || row?.id || row?.date || "").slice(0,10);
}
function salienteNombre(row){
  return canonicalLocalName(row?.orador || row?.oradorNombre || row?.hermano || row?.nombre || "");
}
function salienteDestino(row){
  return row?.destino || row?.congregacionDestino || row?.congregacion || row?.lugar || "";
}

function syncLinks(){
  const ym = $("mesResultados")?.value || currentYM();
  const q = `?mes=${encodeURIComponent(ym)}`;
  const a = $("linkDocumentos");
  if(a) a.href = "documentos.html" + q;
  refreshDocumentosResultados(false);
}
function onMesResultadosChange(){
  syncLinks();
  renderAsignacionesMes();
}


function saturdayOfMonthWeek(mesISO, weekNum){
  const parts = String(mesISO||"").split("-").map(Number);
  const y = parts[0], m = parts[1];
  if(!y || !m) return "";
  const monthIndex = m - 1;
  const sats = [];
  const d = new Date(y, monthIndex, 1);
  while(d.getMonth() === monthIndex){
    if(d.getDay() === 6) sats.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  const dt = sats[Math.max(0, Number(weekNum || 1)-1)];
  if(!dt) return "";
  return dt.getFullYear() + "-" + String(dt.getMonth()+1).padStart(2,"0") + "-" + String(dt.getDate()).padStart(2,"0");
}
function buildDocSrc(){
  const tipo = $("tipoDocumentoResultados")?.value || "programa";
  const mes = $("mesResultados")?.value || currentYM();
  const sem = $("semanaDocumentoResultados")?.value || "1";
  const qs = new URLSearchParams();
  qs.set("mes", mes);
  qs.set("embed", "1");
  let file = "programa-mensual.html";
  let help = "Programa mensual listo para imprimir o guardar como PDF.";
  if(tipo === "acomodadores"){
    file = "tablero-acomodadores.html";
    help = "Asignaciones Villa Fiad: acomodadores, plataforma, audio/video y microfonistas.";
  }else if(tipo === "presidente-mes"){
    file = "doc-presi.html";
    help = "Documento del presidente con visitantes y salientes locales del mes.";
  }else if(tipo === "presidente-semana"){
    file = "presidente.html";
    qs.delete("mes");
    qs.set("semana", saturdayOfMonthWeek(mes, sem));
    qs.set("embed", "1");
    help = "PDF semanal para el presidente.";
  }else if(tipo === "resumen"){
    file = "imprimir.html";
    qs.set("semana", sem);
    help = "Resumen completo mensual.";
  }
  return { url: file + "?" + qs.toString(), help, tipo };
}
function updateDocVisibility(){
  const tipo = $("tipoDocumentoResultados")?.value || "programa";
  const wf = $("weekFieldResultados");
  if(wf) wf.style.display = (tipo === "presidente-semana" || tipo === "resumen") ? "block" : "none";
}
let lastResultadosDocSrc = "";
let resultadosDocPreviewLoaded = false;
function refreshDocumentosResultados(loadPreview=false){
  updateDocVisibility();
  const built = buildDocSrc();
  const frame = $("docFrameResultados");
  const open = $("btnAbrirDocResultados");
  if(open) open.href = built.url.replace(/[?&]embed=1/, "").replace(/\?$/, "");
  const h = $("docHelpResultados");

  // Build 70: NO se carga el iframe automáticamente al abrir Resultados.
  // En algunos navegadores/PC el iframe + service worker anterior dejaba la página "no responde".
  // Primero cargan los datos reales; la vista previa se carga solo cuando el usuario toca Actualizar.
  if(frame){
    prepareScrollablePreviewFrame(frame);
    if(loadPreview === true){
      resultadosDocPreviewLoaded = true;
      if(lastResultadosDocSrc !== built.url || frame.getAttribute("src") !== built.url){
        lastResultadosDocSrc = built.url;
        frame.removeAttribute("srcdoc");
        frame.src = built.url;
      }
      if(h) h.textContent = built.help + " Vista previa cargada.";
    }else if(!resultadosDocPreviewLoaded){
      frame.removeAttribute("src");
      frame.srcdoc = `<!doctype html><html><body style="font-family:Arial,sans-serif;margin:0;padding:24px;background:#fff;color:#1f2937;"><div style="border:1px solid #cbd5e1;border-radius:14px;padding:22px;max-width:720px;margin:30px auto;background:#f8fafc;"><h2 style="margin:0 0 8px;">Vista previa lista para cargar</h2><p style="margin:0 0 10px;line-height:1.45;">Para evitar bloqueos del navegador, primero se cargan los datos del mes. Tocá <b>Actualizar</b> para cargar esta vista previa, o <b>Abrir</b> para verla en una pestaña nueva.</p><p style="margin:0;color:#64748b;">Documento seleccionado: ${escapeHtml(built.help)}</p></div></body></html>`;
      if(h) h.textContent = built.help + " Para ver el documento dentro de esta página, tocá Actualizar.";
    }else if(h){
      h.textContent = built.help;
    }
  }else if(h){
    h.textContent = built.help;
  }
}
function printDocumentosResultados(){
  const frame = $("docFrameResultados");
  try{
    // Si todavía no se cargó la vista previa, abrimos el documento directo.
    // Esto evita forzar el iframe en equipos donde estaba congelando la página.
    if(!resultadosDocPreviewLoaded || !frame?.contentWindow){
      window.open($("btnAbrirDocResultados")?.href || buildDocSrc().url, "_blank");
      return;
    }
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }catch(e){
    window.open($("btnAbrirDocResultados")?.href || buildDocSrc().url, "_blank");
  }
}


async function loadAsignacionesMes(mesISO){
  const qy = query(
    collection(db,"asignaciones"),
    orderBy(documentId()),
    startAt(mesISO),
    endAt(mesISO + "\uf8ff")
  );
  const snap = await readWithTimeout(getDocs(qy), 7500, "Asignaciones del mes");
  return snap.docs.map(d=>{
    const raw = d.data() || {};
    const a = raw.asignaciones || {};
    const merged = { ...raw, ...a };
    delete merged.asignaciones;
    return { id:d.id, data:merged };
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}

function asignacionResumen(a){
  const presidente = resolveNombre(a, ["presidenteId","presidenteNombre","presidente"]);
  const oracionInicial = resolveNombre(a, ["oracionInicialId","oracionInicialNombre","oracionInicial"]);
  const conductor = resolveNombre(a, ["conductorAtalayaId","conductorAtalayaNombre","conductorAtalaya"]);
  const lector = resolveNombre(a, ["lectorAtalayaId","lectorAtalayaNombre","lectorAtalaya"]);
  const orador = String(a.oradorPublico || a.visitante || a.orador || "").trim();
  const congregacion = String(a.congregacionVisitante || a.congregacion || "").trim();
  const bosquejo = String(a.numeroDiscurso || a.bosquejo || a.discurso || "").trim();
  const titulo = String(a.tituloDiscurso || a.titulo || "").trim() || (bosquejo && bosquejos[Number(bosquejo)] ? bosquejos[Number(bosquejo)] : "");
  const plataforma = resolveNombre(a, ["plataformaId","plataformaNombre","plataforma"]);
  const mic1 = resolveNombre(a, ["microfonista1Id","microfonista1Nombre","microfonista1"]);
  const mic2 = resolveNombre(a, ["microfonista2Id","microfonista2Nombre","microfonista2"]);
  const audio = resolveNombre(a, ["multimedia1Id","multimedia1Nombre","multimedia1","audioId","audioNombre","audio"]);
  const video = resolveNombre(a, ["multimedia2Id","multimedia2Nombre","multimedia2","videoId","videoNombre","video"]);
  const entrada = resolveNombre(a, ["acomodadorEntradaId","acomodadorEntradaNombre","acomodadorEntrada"]);
  const auditorio1 = resolveNombre(a, ["acomodadorAuditorio1Id","acomodadorAuditorio1Nombre","acomodadorAuditorio1","acomodadorAuditorioId","acomodadorAuditorioNombre","acomodadorAuditorio"]);
  return { presidente, oracionInicial, conductor, lector, orador, congregacion, bosquejo, titulo, plataforma, mic1, mic2, audio, video, entrada, auditorio1 };
}

function renderAsignacionesMesRows(items, mesISO){
  const box = $("asignacionesMesList");
  const badge = $("asignacionesMesBadge");
  if(badge) badge.textContent = mesTitulo(mesISO);
  if(!box) return;
  if(!items.length){
    box.innerHTML = `<div class="empty-state">No hay asignaciones guardadas para ${escapeHtml(mesTitulo(mesISO))}.</div>`;
    return;
  }
  const rows = items.map((it, idx)=>{
    const x = asignacionResumen(it.data || {});
    const reunion = [x.orador ? `Visitante: ${x.orador}` : "", x.congregacion ? `Cong.: ${x.congregacion}` : "", x.bosquejo ? `Bosq. ${x.bosquejo}` : "", x.titulo || ""].filter(Boolean).join(" · ");
    const pres = [`Pres.: ${x.presidente || "—"}`, `Orac. inicial: ${x.oracionInicial || "—"}`].join(" · ");
    const atalaya = [`Cond.: ${x.conductor || "—"}`, `Lector: ${x.lector || "—"}`].join(" · ");
    const servicio = [
      `Plataforma: ${x.plataforma || "—"}`,
      `Mic.: ${[x.mic1, x.mic2].filter(Boolean).join(" / ") || "—"}`,
      `Audio/Video: ${[x.audio, x.video].filter(Boolean).join(" / ") || "—"}`,
      `Acomod.: ${[x.entrada, x.auditorio1].filter(Boolean).join(" / ") || "—"}`
    ].join(" · ");
    return `<tr>
      <td class="td-center">${idx+1}</td>
      <td><strong>${escapeHtml(formatFechaLarga(it.id))}</strong><div class="muted small">${escapeHtml(it.id)}</div></td>
      <td>${escapeHtml(pres)}</td>
      <td>${escapeHtml(reunion || "—")}</td>
      <td>${escapeHtml(atalaya)}</td>
      <td>${escapeHtml(servicio)}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `<div class="table-wrap result-month-table-wrap"><table class="table result-month-table" style="width:100%;">
    <thead><tr><th class="td-center">#</th><th>Fecha</th><th>Presidencia</th><th>Discurso público</th><th>Atalaya</th><th>Servicio</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

let asignacionesMesToken = 0;
async function renderAsignacionesMes(){
  const myToken = ++asignacionesMesToken;
  const box = $("asignacionesMesList");
  const mesISO = $("mesResultados")?.value || currentYM();
  if(box) box.innerHTML = `<div class="muted">Cargando asignaciones de ${escapeHtml(mesTitulo(mesISO))}…</div>`;
  try{
    await loadPersonasMap();
    const items = await loadAsignacionesMes(mesISO);
    if(myToken !== asignacionesMesToken) return;
    renderAsignacionesMesRows(items, mesISO);
  }catch(e){
    console.error(e);
    if(myToken !== asignacionesMesToken) return;
    if(box) box.innerHTML = `<div class="empty-state error">No pude cargar las asignaciones del mes. Revisá permisos o conexión.</div>`;
  }
}


async function previewVisitantes(){
  const box = $("previewVisitantes");
  if(!box) return;
  try{
    const min = todayISO();
    const snap = await readWithTimeout(getDocs(collection(db,"visitas")), 6500, "Visitantes");
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .filter(v=>String(v.id) >= min)
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
      .slice(0,6);
    if(!rows.length){ box.innerHTML = `<div class="muted">No hay visitantes próximos cargados.</div>`; return; }
    box.innerHTML = `<div class="result-list">${rows.map(v=>{
      const n = Number(v.bosquejo);
      const titulo = v.titulo || (Number.isFinite(n) ? bosquejos[n] : "") || "";
      return `<div class="result-line">
        <div><strong>${escapeHtml(formatDate(v.id))}</strong> · ${escapeHtml(v.nombre||"")}</div>
        <div class="muted small">${escapeHtml(v.congregacion||"")} ${v.bosquejo ? `· Bosquejo ${escapeHtml(v.bosquejo)}` : ""} ${titulo ? `· ${escapeHtml(titulo)}` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">No pude cargar los visitantes.</div>`;
  }
}
async function previewSalientes(){
  const box = $("previewSalientes");
  if(!box) return;
  try{
    const min = todayISO();
    await cargarDiscursantesLocales();
    const snap = await readWithTimeout(getDocs(collection(db,"salientes")), 6500, "Salientes");
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .filter(isLocalSaliente)
      .filter(s=>salienteFecha(s) >= min)
      .sort((a,b)=>salienteFecha(a).localeCompare(salienteFecha(b)))
      .slice(0,8);
    if(!rows.length){ box.innerHTML = `<div class="muted">No hay salidas próximas cargadas para discursantes locales.</div>`; return; }
    box.innerHTML = `<div class="result-list">${rows.map(s=>{
      const fecha = salienteFecha(s);
      const n = Number(s.bosquejo || s.discurso || s.numero);
      const titulo = s.titulo || (Number.isFinite(n) ? bosquejos[n] : "") || "";
      const nombre = salienteNombre(s);
      const cong = salienteDestino(s);
      return `<div class="result-line">
        <div><strong>${escapeHtml(formatDate(fecha))}</strong> · ${escapeHtml(nombre)}</div>
        <div class="muted small">${escapeHtml(cong)} ${n ? `· Bosquejo ${escapeHtml(n)}` : ""} ${titulo ? `· ${escapeHtml(titulo)}` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">No pude cargar las salidas locales.</div>`;
  }
}

async function requireAccess(){
  const profileBtn = $("btnMiPerfilResultados");
  return new Promise(resolve=>{
    let settled = false;
    const finish = (value)=>{ if(settled) return; settled = true; resolve(value); };
    onAuthStateChanged(auth, async user=>{
      // Si hay usuario autenticado, se limpia el modo consulta público residual.
      // Ese era el motivo por el que el usuario común veía Resultados sin menú completo,
      // sin datos y sin perfil: seguía marcado como "vf_public=1".
      if(user){
        if(hasPublicAccess()) setPublicAccess(false);
        const u = await getUsuarioSeguro(user);
        if(u && u.activo === false){ await signOut(auth); location.href="index.html"; return; }
        if(profileBtn){
          profileBtn.style.display = "inline-flex";
          profileBtn.href = "perfil.html";
        }
        if(isAdminRole(u?.rol)) renderAdminTopbar();
        else renderViewerTopbar(u?.nombre || user.email || "Usuario");
        finish({ user, usuario:u, public:false });
        return;
      }

      if(hasPublicAccess()){
        renderViewerTopbar("Modo consulta");
        if(profileBtn) profileBtn.style.display = "none";
        finish({ user:null, usuario:{rol:"viewer"}, public:true });
        return;
      }
      location.href="index.html";
    });

    setTimeout(()=>{
      if(settled) return;
      if(hasPublicAccess()){
        renderViewerTopbar("Modo consulta");
        if(profileBtn) profileBtn.style.display = "none";
        finish({ user:null, usuario:{rol:"viewer"}, public:true, timeout:true });
      }
    }, 4500);

    setTimeout(async ()=>{
      if(settled) return;
      // Build 70: no terminar como invitado falso. Si Auth tarda, esperamos;
      // si ya hay currentUser, usamos ese usuario para poder leer datos.
      const cu = auth.currentUser;
      if(cu){
        const u = await getUsuarioSeguro(cu);
        if(profileBtn){ profileBtn.style.display = "inline-flex"; profileBtn.href = "perfil.html"; }
        if(isAdminRole(u?.rol)) renderAdminTopbar(); else renderViewerTopbar(u?.nombre || cu.email || "Usuario");
        finish({ user:cu, usuario:u, public:false, authTimeoutRecovered:true });
      }else{
        renderViewerTopbar("Sesión no confirmada");
        const box = $("asignacionesMesList");
        if(box) box.innerHTML = `<div class="empty-state error">El navegador no confirmó la sesión de Firebase. La página queda activa, pero los datos no se pueden leer hasta entrar nuevamente. Tocá Salir e iniciá sesión otra vez.</div>`;
        finish({ user:null, usuario:{rol:"viewer"}, public:false, authMissing:true });
      }
    }, 7000);
  });
}

function isTouchPreviewScreen(){
  return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
}
function prepareScrollablePreviewFrame(frame){
  if(!frame) return;
  const wrap = frame.closest(".documentos-preview-wrap");
  if(wrap){
    wrap.classList.add("touch-scroll-preview");
    wrap.setAttribute("tabindex", "0");
    wrap.setAttribute("aria-label", "Vista previa desplazable. En celular deslizá hacia los lados, arriba o abajo para revisar todo el documento.");
  }
  const mobileWidth = window.innerWidth <= 520 ? 1080 : 1100;
  if(isTouchPreviewScreen()){
    frame.style.width = mobileWidth + "px";
    frame.style.minWidth = mobileWidth + "px";
    frame.style.minHeight = "920px";
  }else{
    frame.style.width = "100%";
    frame.style.minWidth = "0";
    frame.style.minHeight = "72vh";
  }
}
function fitScrollablePreviewFrame(frame){
  if(!frame) return;
  prepareScrollablePreviewFrame(frame);
  try{
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if(!doc) return;
    const root = doc.documentElement;
    const body = doc.body;
    const wrap = frame.closest(".documentos-preview-wrap");
    const minW = isTouchPreviewScreen() ? (window.innerWidth <= 520 ? 1080 : 1100) : Math.max(900, wrap?.clientWidth || 900);
    const minH = isTouchPreviewScreen() ? 920 : Math.max(720, Math.round((window.innerHeight || 900) * 0.72));
    const contentW = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0, minW);
    const contentH = Math.max(root?.scrollHeight || 0, body?.scrollHeight || 0, minH);
    if(isTouchPreviewScreen()){
      frame.style.width = Math.ceil(contentW + 20) + "px";
      frame.style.minWidth = Math.ceil(contentW + 20) + "px";
      frame.style.height = Math.ceil(contentH + 24) + "px";
      frame.style.minHeight = Math.ceil(contentH + 24) + "px";
    }else{
      frame.style.width = "100%";
      frame.style.minWidth = "0";
      frame.style.height = Math.ceil(Math.max(contentH + 24, minH)) + "px";
    }
  }catch(e){
    // Si el navegador no permite leer el iframe, queda el ancho táctil por CSS.
  }
}
function attachScrollablePreviewFrame(frame, helpEl){
  if(!frame || frame.dataset.touchPreviewReady === "1") return;
  frame.dataset.touchPreviewReady = "1";
  frame.addEventListener("load", ()=>{
    fitScrollablePreviewFrame(frame);
    setTimeout(()=>fitScrollablePreviewFrame(frame), 250);
    setTimeout(()=>fitScrollablePreviewFrame(frame), 900);
  });
  window.addEventListener("resize", ()=>setTimeout(()=>fitScrollablePreviewFrame(frame), 120));
  window.addEventListener("orientationchange", ()=>setTimeout(()=>fitScrollablePreviewFrame(frame), 350));
  if(helpEl && !document.getElementById(helpEl.id + "TouchHint")){
    const span = document.createElement("span");
    span.id = helpEl.id + "TouchHint";
    span.className = "preview-scroll-hint";
    span.textContent = "En Android podés deslizar la vista previa hacia los lados, arriba y abajo.";
    helpEl.insertAdjacentElement("afterend", span);
  }
}

(async function(){
  try{
    const mes = $("mesResultados");
    if(mes){
      const params = new URLSearchParams(location.search);
      const value = params.get("mes") || currentYM();
      mes.value = value;
      if(!mes.value) mes.setAttribute("value", value);
      mes.addEventListener("change", onMesResultadosChange);
    }
    attachScrollablePreviewFrame($("docFrameResultados"), $("docHelpResultados"));
    $("tipoDocumentoResultados")?.addEventListener("change", ()=>refreshDocumentosResultados(false));
    $("semanaDocumentoResultados")?.addEventListener("change", ()=>refreshDocumentosResultados(false));
    $("btnActualizarDocResultados")?.addEventListener("click", ()=>refreshDocumentosResultados(true));
    $("btnImprimirDocResultados")?.addEventListener("click", printDocumentosResultados);

    // Cargar lo visible primero. Antes esto esperaba la lectura del perfil en Firestore;
    // si esa lectura tardaba o quedaba bloqueada, la pantalla quedaba a medio cargar.
    renderViewerTopbar("Usuario");
    syncLinks();
    setTimeout(refreshDocumentosResultados, 300);
    setTimeout(refreshDocumentosResultados, 1200);

    await requireAccess();
    syncLinks();
    await Promise.allSettled([previewVisitantes(), previewSalientes(), renderAsignacionesMes()]);
  }catch(e){
    console.error("Error inicializando Resultados", e);
    try{ syncLinks(); }catch{}
    const box = $("asignacionesMesList");
    if(box) box.innerHTML = `<div class="empty-state error">No pude terminar de cargar Resultados. Cerrá sesión, entrá de nuevo y verificá conexión.</div>`;
  }
})();
