/* build 71 - Arranque inmediato de Resultados aunque Firebase/Auth tarde.
   Activa mes, botones y vista previa sin esperar módulos. */
(function(){
  function $(id){ return document.getElementById(id); }
  function ym(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
  function saturdayOfMonthWeek(mesISO, weekNum){
    var parts=String(mesISO||"").split("-").map(Number), y=parts[0], m=parts[1];
    if(!y||!m) return "";
    var d=new Date(y,m-1,1), sats=[];
    while(d.getMonth()===m-1){ if(d.getDay()===6) sats.push(new Date(d)); d.setDate(d.getDate()+1); }
    var dt=sats[Math.max(0,Number(weekNum||1)-1)] || sats[0];
    if(!dt) return "";
    return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
  }
  function build(){
    var tipo=$("tipoDocumentoResultados") && $("tipoDocumentoResultados").value || "programa";
    var mes=$("mesResultados") && $("mesResultados").value || ym();
    var sem=$("semanaDocumentoResultados") && $("semanaDocumentoResultados").value || "1";
    var qs=new URLSearchParams(); qs.set("mes",mes); qs.set("embed","1");
    var file="programa-mensual.html", help="Programa mensual listo para imprimir o guardar como PDF.";
    if(tipo==="acomodadores"){ file="tablero-acomodadores.html"; help="Asignaciones Villa Fiad: acomodadores, plataforma, audio/video y microfonistas."; }
    else if(tipo==="presidente-mes"){ file="doc-presi.html"; help="Documento del presidente con visitantes y salientes locales del mes."; }
    else if(tipo==="presidente-semana"){ file="presidente.html"; qs.delete("mes"); qs.set("semana",saturdayOfMonthWeek(mes,sem)); qs.set("embed","1"); help="PDF semanal para el presidente."; }
    else if(tipo==="resumen"){ file="imprimir.html"; qs.set("semana",sem); help="Resumen completo mensual."; }
    return {url:file+"?"+qs.toString(), help:help, tipo:tipo};
  }
  function refresh(){
    var m=$("mesResultados");
    if(m && !m.value){ var v=new URLSearchParams(location.search).get("mes") || ym(); try{m.value=v;}catch(e){} m.setAttribute("value",v); }
    var b=build(), f=$("docFrameResultados"), open=$("btnAbrirDocResultados"), h=$("docHelpResultados"), wf=$("weekFieldResultados");
    if(wf) wf.style.display=(b.tipo==="presidente-semana"||b.tipo==="resumen")?"block":"none";
    if(h) h.textContent=b.help;
    if(open) open.href=b.url.replace(/[?&]embed=1/,"").replace(/\?$/g,"");
    if(f && f.getAttribute("src")!==b.url){ f.setAttribute("src",b.url); }
  }
  function bind(){
    ["mesResultados","tipoDocumentoResultados","semanaDocumentoResultados"].forEach(function(id){ var el=$(id); if(el && !el.dataset.b68Bound){ el.dataset.b68Bound="1"; el.addEventListener("change",refresh); }});
    var b=$("btnActualizarDocResultados"); if(b && !b.dataset.b68Bound){ b.dataset.b68Bound="1"; b.addEventListener("click",refresh); }
    var p=$("btnImprimirDocResultados"); if(p && !p.dataset.b68Bound){ p.dataset.b68Bound="1"; p.addEventListener("click",function(){ var f=$("docFrameResultados"); try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ window.open(($("btnAbrirDocResultados") && $("btnAbrirDocResultados").href) || build().url,"_blank"); } }); }
    refresh();
  }
  window.addEventListener("error", function(ev){
    var msg=String(ev.message||"");
    if(msg.includes("firebase") || msg.includes("module") || msg.includes("Failed")){
      var box=$("asignacionesMesList");
      if(box && !box.dataset.errorShown){ box.dataset.errorShown="1"; box.innerHTML='<div class="empty-state error">Detecté una demora cargando Firebase. La vista previa queda habilitada. Si no aparecen datos, publicá las reglas Firestore incluidas en este ZIP y recargá con Ctrl+F5.</div>'; }
    }
  }, true);
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", bind); else bind();
  setTimeout(bind,200); setTimeout(bind,1200); setTimeout(bind,3000);
})();
