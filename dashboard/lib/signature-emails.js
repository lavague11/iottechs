// Scheduled signature-request emails. The "Request via Email" sheet can schedule the signature email for
// later (project "sig_email" tool blob, bound to the proposal version + fingerprint at schedule time). A boot
// sweep (instrumentation.js) + a manual cron route run this: it sends every DUE email, then SKIPS anything
// that's no longer a live request — the proposal was signed, voided, or revised (binding changed), or the
// project is demo/test. Mirrors lib/addendum-emails.js.

import { getAllJobs, getJobByAccessId, getToolData, saveToolData, logProjectEvent, getActiveProposal } from "./db.js";
import { proposalFingerprint } from "./proposal.js";
import { emailSignatureRequest } from "./email.js";

// Why a scheduled signature email is no longer sendable; null ⇒ send it.
function staleReason(accessId, binding) {
  const p = getActiveProposal(accessId);
  if (!p) return "no-proposal";
  if (p.signed_name) return "signed";
  if (!["sent", "accepted"].includes(p.status)) return "revised";          // draft / voided / superseded
  if (binding) {
    if ((p.version || 1) !== binding.version) return "revised";
    if (proposalFingerprint(p.payload, p.tax_rate, p.deposit_pct) !== binding.fingerprint) return "revised";
  }
  return null;
}

export async function sendDueSignatureEmails() {
  let jobs = [];
  try { jobs = getAllJobs(); } catch { return { ok: false, error: "db" }; }
  const now = Date.now();
  let sent = 0, scanned = 0;

  for (const j of jobs) {
    let s; try { s = JSON.parse(getToolData(j.access_id, "sig_email")?.data || "null"); } catch { continue; }
    if (!s || !s.scheduledSendAt) continue;
    scanned++;
    const due = new Date(s.scheduledSendAt).getTime();
    if (isNaN(due) || due > now) continue;                                 // not due yet

    // No longer a live request → drop the schedule, don't send.
    const stale = staleReason(j.access_id, s.binding);
    if (stale) {
      saveToolData(j.access_id, "sig_email", JSON.stringify({}), "system");
      continue;
    }
    // Demo/test projects never send.
    const proj = getJobByAccessId(j.access_id);
    if (proj?.source === "journey-test" || /@journey-test\.local$/i.test(proj?.email || proj?.contact_email || "")) {
      saveToolData(j.access_id, "sig_email", JSON.stringify({}), "system");
      continue;
    }

    let r = null;
    try { r = await emailSignatureRequest(j.access_id, s.optionId ?? undefined); } catch { r = { ok: false, error: "exception" }; }
    if (r && (r.ok || r.id)) {
      saveToolData(j.access_id, "sig_email", JSON.stringify({}), "system");
      sent++;
      try { logProjectEvent(j.access_id, { kind: "email", label: "Scheduled signature request sent", actor: "System" }); } catch {}
    } else if (r && (r.skipped === "demo-project" || r.error === "no-customer-email" || r.skipped === "no-customer-email")) {
      saveToolData(j.access_id, "sig_email", JSON.stringify({}), "system");   // will never send — stop trying
    }
    // else (email-disabled / transient): leave the schedule so a later sweep retries once email is live.
  }
  return { ok: true, sent, scanned };
}
