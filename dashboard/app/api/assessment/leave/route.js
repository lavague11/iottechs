import { cookies } from "next/headers";
import { resolveApplicationRef, getApplicationAssessment, saveApplicationAssessment, logApplicationEvent } from "../../../../lib/db";
import { parseSvcToken } from "../../../../lib/auth";
import { getSessionUser } from "../../../../lib/session";

// Count each time a candidate leaves the assessment (tab hidden / refresh / close). Called via
// navigator.sendBeacon on visibilitychange→hidden and pagehide, so it must survive page unload — an
// API route takes a beacon reliably where a server action can't. Server-owned, so a refresh can't
// reset it. Staff previewing don't inflate the count.
export async function POST(request) {
  let appId = "";
  try { appId = (await request.json())?.appId || ""; } catch {}
  const app = resolveApplicationRef(appId);
  if (!app) return Response.json({ ok: false }, { status: 404 });

  const user = await getSessionUser();
  const staff = !!(user?.id && ["admin", "manager"].includes(user.role));
  if (!staff) {
    const jar = await cookies();
    const tok = jar.get("iot_app")?.value;
    const parsed = tok ? await parseSvcToken(tok) : null;
    if (!(parsed?.svcId && String(parsed.svcId).toUpperCase() === String(app.app_id).toUpperCase())) {
      return Response.json({ ok: false }, { status: 403 });
    }
  }

  const cur = getApplicationAssessment(app.app_id) || {};
  // Only count while a real, unsubmitted exam is open; staff QA never increments.
  if (staff || cur.status === "submitted" || cur.status === "graded" || !cur.opened_at) {
    return Response.json({ ok: true, leaves: cur.leaves || 0 });
  }
  const leaves = (cur.leaves || 0) + 1;
  saveApplicationAssessment(app.app_id, { ...cur, leaves });
  try { logApplicationEvent(app.app_id, { kind: "note", detail: `Assessment: candidate left the page (${leaves}×)`, actor_role: "system", actor_name: "Assessment" }); } catch {}
  return Response.json({ ok: true, leaves });
}
