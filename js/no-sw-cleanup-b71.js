/* build 71 - limpieza de cache/service worker para evitar páginas congeladas.
   La app queda online normal; el navegador siempre toma los archivos nuevos de GitHub Pages. */
(function(){
  function clearCaches(){
    try{
      if(window.caches && caches.keys){
        caches.keys().then(function(keys){ keys.forEach(function(k){ caches.delete(k); }); }).catch(function(){});
      }
    }catch(e){}
  }
  function unregisterSW(){
    try{
      if('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations){
        navigator.serviceWorker.getRegistrations().then(function(regs){
          regs.forEach(function(reg){ try{ reg.unregister(); }catch(e){} });
        }).catch(function(){});
      }
    }catch(e){}
  }
  clearCaches();
  unregisterSW();
})();
