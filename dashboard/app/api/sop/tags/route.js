import { getSessionUser } from "../../../../lib/session";
import { canEditSop } from "../../../../lib/sop-model";
import { autoTagSopSteps } from "../../../../lib/sop-tagger";

// SOP Builder — auto-tag existing steps. Staff only; the Anthropic key never leaves the server.
export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user?.id || !canEditSop(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { tagged, remaining, written } = await autoTagSopSteps();
    return Response.json({ ok: true, tagged, remaining, written });
  } catch (e) {
    return Response.json({ error: e?.message || "Auto-tag failed" }, { status: e?.status || 502 });
  }
}
