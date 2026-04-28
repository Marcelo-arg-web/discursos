/* pro-shell.js - Entorno profesional online para Asignaciones Villa Fiad
   No cambia Firebase ni la lógica de guardado: solo mejora navegación, estructura visual y accesibilidad. */
(function(){
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
    'discursantes': '🎙',
    'estadísticas': '◈',
    'visitas/salidas': '↔',
    'imprimir': '⎙',
    'importar': '⇩',
    'usuarios': '⚙',
    'doc presidente': '☰'
  };

  function keyFor(a){
    const txt = (a.textContent || '').trim().toLowerCase();
    const href = (a.getAttribute('href') || '').toLowerCase();
    if(href.includes('panel') || href.includes('inicio')) return 'panel';
    if(href.includes('asignaciones.html')) return 'asignaciones';
    if(href.includes('programa-mensual')) return 'programa';
    if(href.includes('tablero-acomodadores')) return 'asignaciones villa fiad';
    if(href.includes('visitantes')) return 'visitantes';
    if(href.includes('salientes')) return 'salientes';
    if(href.includes('personas')) return 'personas';
    if(href.includes('discursantes')) return 'discursantes';
    if(href.includes('estadisticas')) return 'estadísticas';
    if(href.includes('doc-presi')) return 'visitas/salidas';
    if(href.includes('imprimir')) return 'imprimir';
    if(href.includes('importar')) return 'importar';
    if(href.includes('usuarios')) return 'usuarios';
    return txt;
  }

  function enhanceTopbar(topbar){
    if(!topbar || topbar.dataset.proShell === '1') return;
    topbar.dataset.proShell = '1';
    document.body.classList.add('pro-online');

    const brand = topbar.querySelector('.brand');
    if(brand && !brand.querySelector('.brand-title')){
      const raw = brand.textContent.trim() || 'Villa Fiad';
      brand.innerHTML = '<span class="brand-dot"></span><span class="brand-copy"><span class="brand-title">Asignaciones</span><span class="brand-sub">Villa Fiad · online</span></span>';
      brand.setAttribute('title', raw);
    }

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
