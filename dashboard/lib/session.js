import { cookies } from "next/headers";
import { parseToken } from "./auth";
import { getUserById, getNotifications, getUnreadCount } from "./db";

// Resolve the logged-in staff user for the shared shell (id/name/email/role).
export async function getSessionUser() {
  const jar = await cookies();
  const tok = jar.get("iot_session")?.value;
  const s   = tok ? await parseToken(tok) : null;
  if (!s?.id) return { id: null, name: "Staff", email: s?.email || "", role: s?.role || "staff" };
  const u = getUserById(s.id);
  // Resolve the role FRESH from the DB, so a role change takes effect on the next request with no re-login.
  // Only a gone / disabled account signs out (bounces to /login); an upgraded one just gets the new role.
  if (!u || u.disabled) return { id: null, name: "Staff", email: "", role: "guest" };
  return { id: s.id, name: u.name || "Staff", email: u.email || s.email || "", role: u.role || s.role || "staff" };
}

// Notification summary for the nav bell.
export function getNotifSummary(userId) {
  if (!userId) return { unread: 0, recent: [] };
  return { unread: getUnreadCount(userId), recent: getNotifications(userId, 6) };
}
