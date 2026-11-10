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
  // A role or disabled change bumps session_epoch, so a token minted before it no longer matches → treat
  // the session as signed out (the page gate then bounces to /login, where a fresh login mints the new role).
  if (!u || u.disabled || Number(u.session_epoch || 0) !== Number(s.epoch || 0)) {
    return { id: null, name: "Staff", email: "", role: "guest", stale: !!u };
  }
  return { id: s.id, name: u.name || "Staff", email: u.email || s.email || "", role: u.role || s.role || "staff" };
}

// Notification summary for the nav bell.
export function getNotifSummary(userId) {
  if (!userId) return { unread: 0, recent: [] };
  return { unread: getUnreadCount(userId), recent: getNotifications(userId, 6) };
}
