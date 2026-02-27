import { mountTopbar, requireAuth } from "../guard.js";
import { qs } from "../utils.js";

mountTopbar("panel");

const { user, udoc } = await requireAuth({ minRole:"viewer" });
qs("#who").innerHTML = `
  <div><b>Nombre:</b> ${udoc.nombre || "—"}</div>
  <div><b>Email:</b> ${udoc.email || user.email}</div>
  <div><b>Rol:</b> ${(udoc.rol || "viewer")}</div>
  <div><b>Activo:</b> ${udoc.activo ? "Sí" : "No"}</div>
`;
