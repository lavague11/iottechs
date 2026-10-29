import { runnerAuthorized } from "../../../../lib/queue-auth";
import { claimNextBug } from "../../../../lib/db";

// Runner-only. Atomically claim the next queued bug (one at a time; respects stop_after_current). Returns
// the structured task envelope, or { claimed:false } when nothing is runnable. Bearer token (vault).
export const runtime = "nodejs";

// The ORIGINAL report is passed verbatim. fix_prompt/ui_prompt ride along as SUPPLEMENTAL context only —
// the runner's prompt tells Claude to investigate the real root cause, not obey them. image_urls stay as
// stored (relative /api/media/<id>); the runner prefixes its configured base and downloads them locally.
function envelopeFor(bug) {
  let imageUrls = [];
  try { const a = JSON.parse(bug.image_urls || "null"); if (Array.isArray(a)) imageUrls = a; } catch { /* legacy single */ }
  if (!imageUrls.length && bug.image_url) imageUrls = [bug.image_url];
  let context = null; try { context = JSON.parse(bug.context || "null"); } catch { context = null; }
  return {
    id: bug.id,
    attempt: bug.attempt_count,
    description: bug.description,          // ORIGINAL user report — never shortened
    severity: bug.severity || "medium",
    path: bug.path || null,
    url: bug.url || null,
    area: bug.area || null,
    reporter: bug.reporter || null,
    userAgent: bug.user_agent || null,
    context,                               // { viewport, routes[], errors[] } — sanitized at capture
    imageUrls,                             // relative /api/media/<id> — runner prefixes its base
    fixPrompt: bug.fix_prompt || null,     // supplemental (Generate) — not authoritative
    uiPrompt: bug.ui_prompt || null,       // supplemental (Analyze shot) — not authoritative
    createdAt: bug.created_at || null,
  };
}

export async function POST(req) {
  if (!runnerAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const bug = claimNextBug();
  if (!bug) return Response.json({ ok: true, claimed: false });
  return Response.json({ ok: true, claimed: true, bug: envelopeFor(bug) });
}
