import { runnerAuthorized } from "../../../../lib/queue-auth";
import { heartbeatBug } from "../../../../lib/db";

// Runner-only liveness ping for the bug it's working, so it isn't flagged "stuck". Bearer token (vault).
export const runtime = "nodejs";

export async function POST(req) {
  if (!runnerAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body = {}; try { body = await req.json(); } catch { /* empty */ }
  if (!body?.id) return Response.json({ error: "Missing id." }, { status: 400 });
  return Response.json(heartbeatBug(body.id));
}
