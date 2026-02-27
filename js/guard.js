import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { qs, toast } from "./utils.js";

export async function getMyUserDoc(uid){
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function mountTopbar(active){
  const top = qs("#topbar");
  if(!top) return;

  const links = [
    ["panel.html","Inicio","panel"],
    ["personas.html","Personas","personas"],
    ["asignaciones.html","Asignaciones","asignaciones"],
    ["discursantes.html","Discursantes","discursantes"],
    ["importar.html","Importar Excel","importar"],
    ["imprimir.html","Imprimir","imprimir"],
  ];

  top.innerHTML = `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <span class="brand-dot"></span>
          <span>Arreglos Discursos · Villa Fiad</span>
        </div>
        <nav class="nav no-print">
          ${links.map(([href,label,key])=>`<a href="${href}" class="${active===key?'active':''}">${label}</a>`).join("")}
        </nav>
        <div class="no-print" style="display:flex; gap:8px; align-items:center;">
          <span id="meBadge" class="badge">—</span>
          <button id="btnLogout" class="btn">Salir</button>
        </div>
      </div>
    </div>
  `;

  qs("#btnLogout")?.addEventListener("click", async ()=>{
    await signOut(auth);
    location.href = "index.html";
  });
}

export function requireAuth({ minRole="viewer" }={}){
  const roleRank = { viewer:0, editor:1, admin:2, superadmin:3 };

  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){
        location.href = "index.html";
        return;
      }
      const udoc = await getMyUserDoc(user.uid);
      if(!udoc || udoc.activo !== true){
        toast("Tu usuario no está activo o no existe en /usuarios.", "err");
        await signOut(auth);
        location.href = "index.html";
        return;
      }
      // normalizamos rol
      const rol = (udoc.rol || "viewer").toLowerCase();
      const ok = (roleRank[rol] ?? 0) >= (roleRank[minRole] ?? 0);
      if(!ok){
        toast("No tenés permisos para ver esta sección.", "err");
        location.href = "panel.html";
        return;
      }

      const badge = document.querySelector("#meBadge");
      if(badge){
        badge.textContent = `${udoc.nombre || user.email} · ${rol}`;
      }
      resolve({ user, udoc, rol, canEdit: (roleRank[rol] ?? 0) >= 1, isAdmin: (roleRank[rol] ?? 0) >= 2, isSuperadmin: (roleRank[rol] ?? 0) >= 3 });
    });
  });
}
