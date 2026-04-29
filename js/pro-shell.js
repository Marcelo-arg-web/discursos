/* pro-shell.js - Entorno profesional online para Asignaciones Villa Fiad
   No cambia Firebase ni la lógica de guardado: solo mejora navegación, estructura visual y accesibilidad. */
(function(){
  const isEmbeddedDocument = new URLSearchParams(location.search).get('embed') === '1';
  if(isEmbeddedDocument) document.documentElement.classList.add('embedded-doc-root');
  const ICONS = {
    'panel': '⌂',
    'inicio': '⌂',
    'asignaciones': '✓',
    'programa': '▦',
    'programa mensual': '▦',
    'asignaciones villa fiad': '▤',
    'visitantes': '⇢',
    'salientes': '⇠',
    'personas': '👥',
    'funciones': '☑',
    'discursantes': '🎙',
    'estadísticas': '◈',
    'visitas/salidas': '↔',
    'imprimir': '⎙',
    'importar': '⇩',
    'usuarios': '⚙',
    'perfil': '👤',
    'mi perfil': '👤',
    'pdf discursantes': '📄',
    'discursantes pdf': '📄',
    'documentos': '📄',
    'documentos/pdf': '📄',
    'preparar semana': '🧭',
    'preparar': '🧭',
    'doc presidente': '☰'
  };

  function keyFor(a){
    const txt = (a.textContent || '').trim().toLowerCase();
    const href = (a.getAttribute('href') || '').toLowerCase();
    if(href.includes('preparar-semana')) return 'preparar semana';
    if(href.includes('panel') || href.includes('inicio')) return 'panel';
    if(href.includes('asignaciones.html')) return 'asignaciones';
    if(href.includes('documentos')) return 'documentos/pdf';
    if(href.includes('programa-mensual')) return 'documentos/pdf';
    if(href.includes('tablero-acomodadores')) return 'documentos/pdf';
    if(href.includes('visitantes')) return 'visitantes';
    if(href.includes('salientes')) return 'salientes';
    if(href.includes('funciones')) return 'funciones';
    if(href.includes('personas')) return 'personas';
    if(href.includes('discursantes')) return 'discursantes';
    if(href.includes('estadisticas')) return 'estadísticas';
    if(href.includes('doc-presi')) return 'documentos/pdf';
    if(href.includes('presidente.html')) return 'documentos/pdf';
    if(href.includes('imprimir')) return 'documentos/pdf';
    if(href.includes('importar')) return 'importar';
    if(href.includes('directorio-discursos')) return 'documentos/pdf';
    if(href.includes('perfil')) return 'perfil';
    if(href.includes('usuarios')) return 'usuarios';
    return txt;
  }


  function consolidateDocumentLinks(linkContainer){
    if(!linkContainer) return;
    const docTargets = [
      'programa-mensual.html',
      'tablero-acomodadores.html',
      'doc-presi.html',
      'presidente.html',
      'imprimir.html',
      'directorio-discursos.html'
    ];
    const links = Array.from(linkContainer.querySelectorAll('a'));
    const matches = links.filter(a=>{
      const href = (a.getAttribute('href') || '').toLowerCase();
      return docTargets.some(t=>href.includes(t));
    });
    const current = (location.pathname.split('/').pop() || '').toLowerCase();
    const isDocPage = current === 'documentos.html' || docTargets.some(t=>current === t);
    let keep = linkContainer.querySelector('a[href="documentos.html"]');
    if(!keep){
      keep = matches[0] || document.createElement('a');
      if(!matches[0]){
        const resultados = linkContainer.querySelector('a[href="resultados.html"]');
        if(resultados) resultados.insertAdjacentElement('afterend', keep);
        else linkContainer.appendChild(keep);
      }
    }
    keep.href = 'documentos.html';
    keep.textContent = 'Documentos/PDF';
    keep.className = isDocPage ? 'active' : '';
    keep.dataset.unifiedDocs = '1';
    matches.forEach(a=>{ if(a !== keep) a.remove(); });
  }

  function enhanceTopbar(topbar){
    if(isEmbeddedDocument){
      document.body.classList.add('embedded-doc');
      document.body.classList.remove('pro-online');
      if(topbar) topbar.style.display = 'none';
      return;
    }
    if(!topbar || topbar.dataset.proShell === '1') return;
    topbar.dataset.proShell = '1';
    document.body.classList.add('pro-online');

    const brand = topbar.querySelector('.brand');
    if(brand && !brand.querySelector('.brand-title')){
      const raw = brand.textContent.trim() || 'Villa Fiad';
      brand.innerHTML = '<span class="brand-dot"></span><span class="brand-copy"><span class="brand-title">Asignaciones</span><span class="brand-sub">Villa Fiad · online</span></span>';
      brand.setAttribute('title', raw);
    }

    const linkContainer = topbar.querySelector('.links, .nav');
    const isViewerNav = topbar.classList.contains('viewer-topbar') || topbar.classList.contains('resultados-only') || document.body.classList.contains('viewer-result-mode');
    if(isViewerNav && linkContainer){
      Array.from(linkContainer.querySelectorAll('a')).forEach(a=>{
        const href = (a.getAttribute('href') || '').toLowerCase();
        if(!href.includes('resultados.html')) a.remove();
        else { a.href = 'resultados.html'; a.textContent = 'Resultados'; a.className = 'active'; }
      });
    }
    if(linkContainer && !isViewerNav && !linkContainer.querySelector('a[href="funciones.html"]')){
      const personasLink = linkContainer.querySelector('a[href="personas.html"]');
      if(personasLink){
        const a = document.createElement('a');
        a.href = 'funciones.html';
        a.textContent = 'Funciones';
        if(location.pathname.endsWith('/funciones.html')) a.className = 'active';
        personasLink.insertAdjacentElement('afterend', a);
      }
    }

    if(linkContainer && !isViewerNav && !linkContainer.querySelector('a[href="directorio-discursos.html"]')){
      const usuariosLink = linkContainer.querySelector('a[href="usuarios.html"]');
      if(usuariosLink){
        const a = document.createElement('a');
        a.href = 'directorio-discursos.html';
        a.textContent = 'PDF discursantes';
        if(location.pathname.endsWith('/directorio-discursos.html')) a.className = 'active';
        usuariosLink.insertAdjacentElement('beforebegin', a);
      }
    }

    if(linkContainer && !isViewerNav && !linkContainer.querySelector('a[href="perfil.html"]')){
      const a = document.createElement('a');
      a.href = 'perfil.html';
      a.textContent = 'Mi perfil';
      if(location.pathname.endsWith('/perfil.html')) a.className = 'active';
      linkContainer.appendChild(a);
    }

    if(!isViewerNav) consolidateDocumentLinks(linkContainer);

    const links = topbar.querySelectorAll('.links a, .nav a');
    links.forEach(a=>{
      if(a.dataset.proNav === '1') return;
      const label = (a.textContent || '').trim();
      const key = keyFor(a);
      const icon = ICONS[key] || '•';
      a.dataset.proNav = '1';
      a.innerHTML = '<span class="navIcon" aria-hidden="true">'+icon+'</span><span class="navText">'+label+'</span>';
      a.setAttribute('title', label);
    });

    const actions = topbar.querySelector('.actions, .topbar .no-print:last-child');
    if(actions && !actions.querySelector('.pro-status')){
      const st = document.createElement('div');
      st.className = 'pro-status';
      st.innerHTML = '<span class="pro-live-dot" aria-hidden="true"></span><span>Online</span>';
      actions.insertBefore(st, actions.firstChild);
    }
  }

  function enhancePage(){
    const topbar = document.querySelector('.topbar');
    if(topbar) enhanceTopbar(topbar);

    document.querySelectorAll('button').forEach(btn=>{
      if(!btn.getAttribute('title') && btn.textContent.trim()) btn.setAttribute('title', btn.textContent.trim());
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhancePage);
  else enhancePage();

  const mo = new MutationObserver(enhancePage);
  mo.observe(document.documentElement, { childList:true, subtree:true });
})();
