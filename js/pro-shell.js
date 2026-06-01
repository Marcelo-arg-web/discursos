/* pro-shell.js - Build 73 seguro.
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

  const ADMIN_NAV_MAIN = [
    {href:'asignaciones.html', label:'Asignaciones', key:'asignaciones', icon:'✓'},
    {href:'visitantes.html', label:'Visitantes', key:'visitantes', icon:'⇢'},
    {href:'salientes.html', label:'Salientes', key:'salientes', icon:'⇠'},
    {href:'resultados.html', label:'Resultados', key:'resultados', icon:'◉'}
  ];
  const ADMIN_NAV_GROUPS = [
    {label:'Carga y roles', icon:'☑', items:[
      {href:'funciones.html', label:'Funciones / roles'},
      {href:'discursantes.html', label:'Discursantes'},
      {href:'personas.html', label:'Personas'},
      {href:'directorio-discursos.html', label:'Directorio de discursos'},
      {href:'preparar-semana.html', label:'Preparar semana'}
    ]},
    {label:'PDF e impresión', icon:'📄', items:[
      {href:'documentos.html', label:'Centro de documentos/PDF'},
      {href:'programa-mensual.html', label:'Programa mensual'},
      {href:'doc-presi.html', label:'Presidente: mes'},
      {href:'presidente.html', label:'Presidente: semana'},
      {href:'tablero-acomodadores.html', label:'Acomodadores y asignaciones'},
      {href:'tablero-multimedia.html', label:'Multimedia'},
      {href:'imprimir.html', label:'Resumen / imprimir'}
    ]},
    {label:'Administración', icon:'⚙', items:[
      {href:'panel.html', label:'Panel'},
      {href:'usuarios.html', label:'Usuarios'},
      {href:'importar.html', label:'Importar'},
      {href:'importar-visitantes.html', label:'Importar visitantes'},
      {href:'importar-asignaciones.html', label:'Importar asignaciones'},
      {href:'estadisticas.html', label:'Estadísticas'},
      {href:'perfil.html', label:'Mi perfil'}
    ]}
  ];
  function pageKeyFromHref(href){
    const h = String(href || '').toLowerCase();
    return h.split('?')[0].split('#')[0].replace(/^\.\//,'');
  }
  function isCurrentHref(href){
    return pageKeyFromHref(href) === page;
  }
  function navLinkHtml(item, extraClass){
    const active = isCurrentHref(item.href) ? ' active' : '';
    const icon = item.icon || ICONS[item.key || keyFor({ textContent:item.label, getAttribute:()=>item.href })] || '•';
    return `<a href="${item.href}" class="${extraClass || 'navQuick'}${active}" title="${item.label}"><span class="navIcon" aria-hidden="true">${icon}</span><span class="navText">${item.label}</span></a>`;
  }
  function organizeAdminNav(linkContainer){
    if(!linkContainer || linkContainer.dataset.organizedBuild === '73') return;
    // No se reorganiza la vista común/consulta: esa queda solo con Resultados y Mi perfil.
    if(document.body.classList.contains('viewer-result-mode') || linkContainer.classList.contains('viewer-links')) return;
    const hasAnyAdminLink = Array.from(linkContainer.querySelectorAll('a')).some(a => /usuarios|importar|funciones|discursantes|documentos|asignaciones|visitantes|salientes/i.test(a.getAttribute('href') || a.textContent || ''));
    if(!hasAnyAdminLink) return;
    linkContainer.dataset.organizedBuild = '73';
    linkContainer.classList.add('nav-organized');
    const main = ADMIN_NAV_MAIN.map(item => navLinkHtml(item, 'navQuick')).join('');
    const groups = ADMIN_NAV_GROUPS.map((group) => {
      const active = group.items.some(item => isCurrentHref(item.href));
      const links = group.items.map(item => navLinkHtml(item, 'navDropLink')).join('');
      return `<details class="navGroup${active ? ' active' : ''}"><summary title="${group.label}"><span class="navIcon" aria-hidden="true">${group.icon}</span><span>${group.label}</span></summary><div class="navGroupMenu">${links}</div></details>`;
    }).join('');
    linkContainer.innerHTML = main + groups;
  }
  function improveTopbarLayout(topbar){
    if(!topbar) return;
    topbar.classList.add('organized-topbar');
    const brand = topbar.querySelector('.brand');
    if(brand && !brand.querySelector('.brand-title')){
      const raw = (brand.textContent || 'Villa Fiad').trim();
      brand.innerHTML = '<span class="brand-dot"></span><span class="brand-copy"><span class="brand-title">Discursos</span><span class="brand-sub">Arreglos · Villa Fiad</span></span>';
      brand.setAttribute('title', raw);
    }
    const linkContainer = topbar.querySelector('.links, .nav');
    organizeAdminNav(linkContainer);
  }
  function enhanceTopbarOnce(){
    const topbar = document.querySelector('.topbar');
    if(!topbar) { titleButtons(document); return; }
    improveTopbarLayout(topbar);
    if(topbar.dataset.proShell === '1') { titleButtons(document); return; }
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
    improveTopbarLayout(topbar);
    titleButtons(document);
  }
  let topbarObserver = null;
  function watchTopbarForLateRender(){
    const host = document.getElementById('topbar');
    if(!host || topbarObserver) return;
    let hits = 0;
    topbarObserver = new MutationObserver(function(){
      hits += 1;
      setTimeout(function(){
        enhanceTopbarOnce();
        if(document.querySelector('.nav-organized[data-organized-build="73"]') || hits > 30){
          try{ topbarObserver.disconnect(); }catch(_){}
          topbarObserver = null;
        }
      }, 0);
    });
    topbarObserver.observe(host, { childList:true, subtree:true });
  }
  function scheduleEnhanceTopbar(){
    enhanceTopbarOnce();
    watchTopbarForLateRender();
    [250, 800, 1600, 3000].forEach(function(ms){ setTimeout(enhanceTopbarOnce, ms); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhanceTopbar, {once:true});
  else scheduleEnhanceTopbar();
})();
