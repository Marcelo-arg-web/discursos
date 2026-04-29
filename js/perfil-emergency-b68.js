/* build 71 - Mi perfil no queda congelado mientras Firebase confirma la sesión. */
(function(){
  function $(id){return document.getElementById(id);}
  function ready(){
    var form=$("formPerfil"); if(form){ form.classList.add("viewer-allowed"); form.style.display="block"; }
    var m=$("modoPerfil"); if(m && !m.dataset.b68){ m.dataset.b68="1"; m.textContent="Cargando perfil…"; }
    var btn=$("btnGuardarPerfil"); if(btn){ btn.disabled=false; }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  setTimeout(ready,300); setTimeout(ready,1500);
})();
