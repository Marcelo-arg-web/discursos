/* Mobile navigation helper (safe, no Firebase changes)
   - Injects a hamburger button if missing
   - Collapses/expands .topbar .links on small screens
   - Closes menu after tapping a link
   - Adds a light "Instalar" helper button (no service worker changes)
*/
(function(){
  function initTopbar(topbar){
    if(!topbar || topbar.dataset.mobileNavInit === "1") return;
    topbar.dataset.mobileNavInit = "1";

    const links = topbar.querySelector(".links");
    const actions = topbar.querySelector(".actions");

    // Inject hamburger toggle if missing
    if(!topbar.querySelector(".nav-toggle")){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-toggle";
      btn.setAttribute("aria-label","Menú");
      btn.textContent = "☰";
      // Put it before links (after brand if possible)
      const brand = topbar.querySelector(".brand");
      if(brand && brand.parentElement === topbar){
        brand.insertAdjacentElement("afterend", btn);
      }else{
        topbar.insertBefore(btn, links || actions || null);
      }
      btn.addEventListener("click", ()=> topbar.classList.toggle("open"));
    }

    // Close on link click (mobile)
    if(links){
      links.addEventListener("click", (e)=>{
        const a = e.target && e.target.closest && e.target.closest("a");
        if(a) topbar.classList.remove("open");
      });
    }

    // Optional: add lightweight install helper (no SW)
    if(actions && !actions.querySelector(".pwa-install")){
      const install = document.createElement("button");
      install.type = "button";
      install.className = "btn ghost sm pwa-install";
      install.textContent = "Instalar";
      install.addEventListener("click", ()=>{
        alert("En Android: tocá el menú del navegador (⋮) y elegí “Agregar a pantalla de inicio”.");
      });
      actions.insertBefore(install, actions.firstChild);
    }
  }

  function scan(){
    document.querySelectorAll(".topbar").forEach(initTopbar);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", scan);
  }else{
    scan();
  }

  // In case topbar is rendered after load (some pages do it early, but safe)
  const mo = new MutationObserver(()=>scan());
  mo.observe(document.documentElement, {childList:true, subtree:true});
})();
