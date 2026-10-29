import { runnerAuthorized } from "../../../../lib/queue-auth";
import { finishBugRun } from "../../../../lib/db";

// Runner-only. Write back the outcome of a run: 'review' (Ready for Review) or 'failed'. A failure flips
// the queue to stop_after_current server-side, so nothing else runs until a human reviews. Bearer (vault).
export const runtime = "nodejs";

export async function POST(req) {
  if (!runnerAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body = {}; try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body?.id) return Response.json({ error: "Missing id." }, { status: 400 });
  if (!["review", "failed"].includes(body.outcome)) return Response.json({ error: "outcome must be review|failed." }, { status: 400 });
  return Response.json(finishBugRun(body.id, {
    outcome: body.outcome,
    summary: body.summary,
    filesChanged: body.filesChanged,
    branch: body.branch,
    commitSha: body.commitSha,
    validation: body.validation,
    error: body.error,
  }));
}
