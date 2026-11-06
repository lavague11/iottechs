// Scheduled addendum approval emails (Part B). An add-on can have its customer-approval email SCHEDULED
// for later (scheduledSendAt). A boot sweep (instrumentation.js) + a manual cron route run this: it sends
// every due email, then SKIPS anything that's no longer a live request — already approved, voided, deleted
// (gone from the list), needs pricing, or already sent. emailAddendumApproval self-guards demo/test + gating.

import { getAllJobs, getToolData, saveToolData, logProjectEvent } from "./db.js";
import { emailAddendumApproval } from "./email.js";

const PERMANENT_SKIP = new Set(["demo-project", "no-email", "not-pending", "no-addendum"]);

export async function sendDueAddendumEmails() {
  let jobs = [];
  try { jobs = getAllJobs(); } catch { return { ok: false, error: "db" }; }
  const now = Date.now();
  let sent = 0, scanned = 0;

  for (const j of jobs) {
    let d; try { d = JSON.parse(getToolData(j.access_id, "addendum")?.data || "{}"); } catch { continue; }
    const list = Array.isArray(d.addendums) ? d.addendums : [];
    let changed = false;
    for (const a of list) {
      if (!a || !a.scheduledSendAt) continue;
      scanned++;
      // No longer a live pending request (approved/voided/needs-pricing) or already sent → drop the schedule.
      if (a.status !== "pending" || a.needsPricing || a.emailSentAt) { a.scheduledSendAt = undefined; changed = true; continue; }
      const due = new Date(a.scheduledSendAt).getTime();
      if (isNaN(due) || due > now) continue;                       // not due yet
      let r = null;
      try { r = await emailAddendumApproval(j.access_id, a.id); } catch { r = { error: "exception" }; }
      if (r && (r.ok || r.id)) {
        a.emailSentAt = new Date().toISOString(); a.scheduledSendAt = undefined; changed = true; sent++;
        try { logProjectEvent(j.access_id, { kind: "email", label: "Scheduled add-on approval email sent", actor: "System" }); } catch {}
      } else if (r && PERMANENT_SKIP.has(r.skipped)) {
        a.scheduledSendAt = undefined; changed = true;             // will never send (demo/no-email/not-pending) — stop trying
      }
      // else (email-disabled / transient): leave scheduledSendAt so a later sweep retries once email is live.
    }
    if (changed) { try { saveToolData(j.access_id, "addendum", JSON.stringify({ ...d, addendums: list }), "system"); } catch {} }
  }
  return { ok: true, sent, scanned };
}
