import { cookies } from "next/headers";
import { parseToken } from "../../../lib/auth";
import { enqueueBugs, setBugQueueMode, retryBug, dequeueBug, reorderQueue, getBugQueueState } from "../../../lib/db";

// Staff-facing queue control (admin/manager, same gate as /bugs). One POST with `op`:
//   enqueue {ids:[...]}|{allOpen:true}  ·  pause  ·  resume  ·  retry {id}  ·  dequeue {id}  ·  reorder {ids:[...]}
// GET returns the compact queue state. Runner-only endpoints (claim/heartbeat/result) live in subroutes
// and use a Bearer token, NOT this cookie gate.
export const runtime = "nodejs";

async function staff() {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  const tok = raw ? await parseToken(raw) : null;
  return tok && ["admin", "manager"].includes(tok.role) ? tok : null;
}

export async function GET() {
  if (!(await staff())) return Response.json({ error: "Staff only." }, { status: 403 });
  return Response.json({ ok: true, queue: getBugQueueState() });
}

export async function POST(req) {
  if (!(await staff())) return Response.json({ error: "Staff only." }, { status: 403 });
  let body = {}; try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  switch (body.op) {
    case "enqueue":  return Response.json(enqueueBugs({ ids: body.ids, allOpen: !!body.allOpen }));
    case "pause":    return Response.json(setBugQueueMode("stop_after_current"));
    case "resume":   return Response.json(setBugQueueMode("running"));
    case "retry":    return body.id ? Response.json(retryBug(body.id))   : Response.json({ error: "Missing id." }, { status: 400 });
    case "dequeue":  return body.id ? Response.json(dequeueBug(body.id)) : Response.json({ error: "Missing id." }, { status: 400 });
    case "reorder":  return Response.json(reorderQueue(body.ids));
    default:         return Response.json({ error: "Unknown op." }, { status: 400 });
  }
}
