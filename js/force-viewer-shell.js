/* build 66 - Shell visible para usuario común sin depender de Firebase.
   Evita pantalla sin menú si Auth/Firestore tardan o si quedó cache viejo. */
(function(){
  function page(){ return (location.pathname.split('/').pop() || 'index.html').toLowerCase(); }
  function isViewerPage(){ return page()==='resultados.html' || page()==='perfil.html'; }
  function ym(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function clearPublicOnAuthHint(){
    try{
      // Si venimos a Resultados/Perfil y hay alguna sesión normal, no dejamos pegado modo consulta.
      // No consulta Firebase; solo quita el flag público residual que generaba pantalla incompleta.
      if(page()==='perfil.html') sessionStorage.removeItem('vf_public');
    }catch(e){}
  }
  function setMonth(){
    var m=document.getElementById('mesResultados');
    if(!m) return;
    var v = new URLSearchParams(location.search).get('mes') || m.value || ym();
    try{ m.value = v; }catch(e){}
    m.setAttribute('value', v);
  }
  function shell(){
    if(!isViewerPage()) return;
    clearPublicOnAuthHint();
    document.body.classList.add('pro-online','has-topbar','viewer-result-mode');
    if(page()==='perfil.html') document.body.classList.remove('public-view');
    var top=document.getElementById('topbar');
    if(!top) return;
    top.style.display='block';
    if(top.dataset.realShell === '1') { setMonth(); return; }
    var isPerfil = page()==='perfil.html';
    var publicMode = false;
    try{ publicMode = sessionStorage.getItem('vf_public') === '1' && !isPerfil; }catch(e){}
    top.innerHTML = '<div class="topbar viewer-topbar resultados-only" style="display:flex">'
      + '<div class="brand"><span class="brand-dot"></span><span class="brand-copy"><span class="brand-title">Asignaciones</span><span class="brand-sub">Villa Fiad · online</span></span></div>'
      + '<div class="links viewer-links">'
      + '<a href="resultados.html" class="'+(!isPerfil?'active':'')+'">Resultados</a>'
      + (publicMode ? '' : '<a href="perfil.html" class="'+(isPerfil?'active':'')+'">Mi perfil</a>')
      + '</div>'
      + '<div class="actions"><span class="badge">Solo lectura</span><span class="badge soft" id="forceUserBadge">Usuario</span><button class="btn danger sm" id="forceLogoutBtn" type="button">Salir</button></div>'
      + '</div>';
    var btn=document.getElementById('forceLogoutBtn');
    if(btn) btn.onclick=function(){ try{sessionStorage.removeItem('vf_public')}catch(e){}; location.href='index.html?logout=1'; };
    setMonth();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', shell);
  else shell();
  setTimeout(shell, 200);
  setTimeout(shell, 1000);
  window.__vfForceViewerShell = shell;
})();
