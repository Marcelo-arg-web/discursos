import { auth } from "../firebase.js";
import { db, fs, ensureUserDoc } from "../db.js";
import { roleFromEmail } from "../roles.js";
import { escapeHtml, toast } from "../utils.js";

export async function renderAjustes(root, ctx){
  ctx.setTitle("Ajustes", "Usuarios y seguridad");
  root.innerHTML = `
    <div class="grid grid2">
      <div class="card" style="padding:16px">
        <h2>Tu cuenta</h2>
        <p class="muted small">Datos básicos del usuario logueado.</p>
        <div class="grid">
          <div><span class="muted tiny">Email</span><div><strong>${escapeHtml(ctx.user?.email||"")}</strong></div></div>
          <div><span class="muted tiny">Rol</span><div><strong>${escapeHtml(ctx.role)}</strong></div></div>
        </div>
      </div>

      <div class="card" style="padding:16px">
        <h2>Administración de usuarios</h2>
        <p class="muted small">Acá se ve la colección <code>usuarios</code>. Para cambiar roles, necesitás ser admin.</p>
        ${ctx.canEdit ? `
          <div class="row">
            <button class="btn" id="btnReload">Recargar</button>
          </div>
          <div class="tableWrap" id="wrap" style="margin-top:10px"></div>
          <p class="muted tiny">Roles: lector / admin / superadmin. El email en whitelist también puede subir permisos.</p>
        ` : `<span class="badge warn">Solo lectura</span>`}
      </div>
    </div>
  `;

  if(!ctx.canEdit) return;

  const wrap = root.querySelector("#wrap");

  async function load(){
    const col = fs.collection(db, "usuarios");
    const snap = await fs.getDocs(col);
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=> (a.email||"").localeCompare(b.email||""));
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Activo</th><th></th></tr></thead>
        <tbody>
          ${rows.map(u=>`
            <tr>
              <td><strong>${escapeHtml(u.email||"")}</strong></td>
              <td class="muted">${escapeHtml(u.nombre||"")}</td>
              <td>
                <select data-role="${escapeHtml(u.id)}">
                  ${["lector","admin","superadmin"].map(r=>`<option value="${r}" ${u.rol===r?"selected":""}>${r}</option>`).join("")}
                </select>
              </td>
              <td>
                <select data-active="${escapeHtml(u.id)}">
                  <option value="true" ${u.activo!==false?"selected":""}>Sí</option>
                  <option value="false" ${u.activo===false?"selected":""}>No</option>
                </select>
              </td>
              <td><button class="btn" data-save="${escapeHtml(u.id)}">Guardar</button></td>
            </tr>
          `).join("") || `<tr><td colspan="5" class="muted">Sin usuarios.</td></tr>`}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("[data-save]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const uid = btn.dataset.save;
        const role = wrap.querySelector(`[data-role="${uid}"]`).value;
        const active = wrap.querySelector(`[data-active="${uid}"]`).value === "true";
        await fs.setDoc(fs.doc(db,"usuarios",uid), { rol: role, activo: active, actualizadoEn: new Date().toISOString() }, { merge:true });
        toast("Actualizado");
        // si es mi propio usuario, refrescar local
        if(ctx.user?.uid === uid){
          const fallback = roleFromEmail(ctx.user.email||"");
          await ensureUserDoc(ctx.user, fallback);
          toast("Recargá la página para aplicar tu rol");
        }
      });
    });
  }

  root.querySelector("#btnReload").addEventListener("click", load);
  await load();
}
