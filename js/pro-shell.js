/* pro-shell.js - Build 70 seguro.
   Corrección: se quitó el MutationObserver global que reescribía el menú una y otra vez
   y podía congelar Resultados/Mi perfil en usuario común. */
(function(){
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isEmbedded = new URLSearchParams(location.search).get('embed') === '1';
  const isViewerPage = page === 'resultados.html' || page === 'perfil.html';

  if(isEmbedded){
    document.documentElement.classList.add('embedded-doc-root');
    document.addEventListener('DOMContentLoaded', function(){
      document.body.classList.add('embedded-doc');
      const topbar = document.querySelector('.topbar');
      if(topbar) topbar.style.display = 'none';
    }, {once:true});
    return;
  }

  function titleButtons(scope){
    (scope || document).querySelectorAll('button').forEach(function(btn){
      const t = (btn.textContent || '').trim();
      if(t && !btn.getAttribute('title')) btn.setAttribute('title', t);
    });
  }

  function normalizeViewerShell(){
    document.body.classList.add('pro-online','has-topbar','viewer-result-mode');
    const topbar = document.querySelector('.topbar');
    if(topbar) topbar.classList.add('viewer-topbar','resultados-only');
    titleButtons(document);
  }

  // En Resultados y Mi perfil NO se usa observador global.
  // Estas páginas ya tienen su propio menú y lógica; pro-shell solo deja títulos/accesibilidad.
  if(isViewerPage){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeViewerShell, {once:true});
    else normalizeViewerShell();
    return;
  }

  const ICONS = {
    'panel':'⌂','inicio':'⌂','asignaciones':'✓','programa':'▦','programa mensual':'▦',
    'asignaciones villa fiad':'▤','visitantes':'⇢','salientes':'⇠','personas':'👥','funciones':'☑',
    'discursantes':'🎙','estadísticas':'◈','visitas/salidas':'↔','imprimir':'⎙','importar':'⇩',
    'usuarios':'⚙','perfil':'👤','mi perfil':'👤','pdf discursantes':'📄','discursantes pdf':'📄',
    'documentos':'📄','documentos/pdf':'📄','preparar semana':'🧭','preparar':'🧭','doc presidente':'☰'
  };
  function keyFor(a){
    const txt=(a.textContent||'').trim().toLowerCase();
    const href=(a.getAttribute('href')||'').toLowerCase();
    if(href.includes('preparar-semana')) return 'preparar semana';
    if(href.includes('panel') || href.includes('inicio')) return 'panel';
    if(href.includes('asignaciones.html')) return 'asignaciones';
    if(href.includes('documentos') || href.includes('programa-mensual') || href.includes('tablero-acomodadores') || href.includes('doc-presi') || href.includes('presidente.html') || href.includes('imprimir') || href.includes('directorio-discursos')) return 'documentos/pdf';
    if(href.includes('visitantes')) return 'visitantes';
    if(href.includes('salientes')) return 'salientes';
    if(href.includes('funciones')) return 'funciones';
    if(href.includes('personas')) return 'personas';
    if(href.includes('discursantes')) return 'discursantes';
    if(href.includes('estadisticas')) return 'estadísticas';
    if(href.includes('importar')) return 'importar';
    if(href.includes('perfil')) return 'perfil';
    if(href.includes('usuarios')) return 'usuarios';
    return txt;
  }
  function enhanceTopbarOnce(){
    const topbar = document.querySelector('.topbar');
    if(!topbar || topbar.dataset.proShell === '1') { titleButtons(document); return; }
    topbar.dataset.proShell = '1';
    document.body.classList.add('pro-online');
    const brand = topbar.querySelector('.brand');
    if(brand && !brand.querySelector('.brand-title')){
      const raw = (brand.textContent || 'Villa Fiad').trim();
      brand.innerHTML = '<span class="brand-dot"></span><span class="brand-copy"><span class="brand-title">Asignaciones</span><span class="brand-sub">Villa Fiad · online</span></span>';
      brand.setAttribute('title', raw);
    }
    const linkContainer = topbar.querySelector('.links, .nav');
    if(linkContainer){
      if(!linkContainer.querySelector('a[href="funciones.html"]')){
        const ref = linkContainer.querySelector('a[href="salientes.html"]') || linkContainer.querySelector('a[href="personas.html"]');
        const a = document.createElement('a');
        a.href = 'funciones.html';
        a.textContent = 'Funciones';
        if(page === 'funciones.html' || page === 'personas.html') a.className = 'active';
        if(ref) ref.insertAdjacentElement('afterend', a); else linkContainer.appendChild(a);
      }
      if(!linkContainer.querySelector('a[href="perfil.html"]')){
        const a = document.createElement('a');
        a.href = 'perfil.html';
        a.textContent = 'Mi perfil';
        if(page === 'perfil.html') a.className = 'active';
        linkContainer.appendChild(a);
      }
      linkContainer.querySelectorAll('a').forEach(function(a){
        if(a.dataset.proNav === '1') return;
        const label = (a.textContent || '').trim();
        const icon = ICONS[keyFor(a)] || '•';
        a.dataset.proNav = '1';
        a.innerHTML = '<span class="navIcon" aria-hidden="true">'+icon+'</span><span class="navText">'+label+'</span>';
        a.setAttribute('title', label);
      });
    }
    const actions = topbar.querySelector('.actions, .topbar .no-print:last-child');
    if(actions && !actions.querySelector('.pro-status')){
      const st = document.createElement('div');
      st.className = 'pro-status';
      st.innerHTML = '<span class="pro-live-dot" aria-hidden="true"></span><span>Online</span>';
      actions.insertBefore(st, actions.firstChild);
    }
    titleButtons(document);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceTopbarOnce, {once:true});
  else enhanceTopbarOnce();
})();
