// Scheduled invoice sends + automatic invoice reminders. Each project's "invoice" tool blob carries
// { sentAt, dueDate, invoiceNo, scheduledSendAt, remind3SentAt, remindDueSentAt }. A boot sweep
// (instrumentation.js) + a manual cron route run this:
//   1. a SCHEDULED invoice whose scheduledSendAt has passed is sent (Net 14 due date stamped at send),
//   2. once sent + still UNPAID, a reminder goes out 3 days before the due date and again on the due date.
// Paid invoices (balance <= 0) send no reminders. emailInvoice self-guards demo/test + email gating.

import { getAllJobs, getToolData, saveToolData, logProjectEvent, getProjectFinancialState } from "./db.js";
import { emailInvoice } from "./email.js";
import { defaultDueDate } from "./invoice-model.js";

const DAY = 86400000;
const dueMs = (d) => { const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? `${d}T00:00:00` : d).getTime(); return isNaN(t) ? null : t; };
const ok = (r) => !!(r && (r.ok || r.id));
const permanent = (r) => !!(r && (r.skipped === "demo-project" || r.error === "no-customer-email"));

export async function sendDueInvoiceEmails() {
  let jobs = [];
  try { jobs = getAllJobs(); } catch { return { ok: false, error: "db" }; }
  const now = Date.now();
  let sent = 0, reminders = 0, scanned = 0;

  for (const j of jobs) {
    let inv; try { inv = JSON.parse(getToolData(j.access_id, "invoice")?.data || "null"); } catch { continue; }
    if (!inv) continue;
    let changed = false;

    // 1) Scheduled send that's now due.
    if (inv.scheduledSendAt && !inv.sentAt) {
      scanned++;
      const when = new Date(inv.scheduledSendAt).getTime();
      if (!isNaN(when) && when <= now) {
        const dueDate = inv.dueDate || defaultDueDate();
        let r = null; try { r = await emailInvoice(j.access_id, { dueDate }); } catch { r = { error: "exception" }; }
        if (ok(r) || permanent(r)) {
          inv.sentAt = new Date().toISOString(); inv.dueDate = dueDate; inv.scheduledSendAt = undefined; changed = true;
          if (ok(r)) { sent++; try { logProjectEvent(j.access_id, { kind: "email", label: `Scheduled invoice ${inv.invoiceNo || ""} sent`.trim(), actor: "System" }); } catch {} }
        }
        // else transient (email-disabled) → leave scheduled for a later sweep.
      }
    }

    // 2) Reminders — only once sent, with a due date, and still unpaid.
    if (inv.sentAt && inv.dueDate) {
      const due = dueMs(inv.dueDate);
      const fin = (() => { try { return getProjectFinancialState(j.access_id); } catch { return null; } })();
      const balance = +fin?.balance || 0;
      if (due != null && balance > 0) {
        scanned++;
        // 3 days before due (within the window up to the due date).
        if (!inv.remind3SentAt && now >= due - 3 * DAY && now < due) {
          let r = null; try { r = await emailInvoice(j.access_id, { dueDate: inv.dueDate, reminder: "pre" }); } catch { r = { error: "exception" }; }
          if (ok(r) || permanent(r)) { inv.remind3SentAt = new Date().toISOString(); changed = true; if (ok(r)) { reminders++; try { logProjectEvent(j.access_id, { kind: "email", label: `Invoice reminder sent (due in 3 days)`, actor: "System" }); } catch {} } }
        }
        // On / past the due date.
        if (!inv.remindDueSentAt && now >= due) {
          let r = null; try { r = await emailInvoice(j.access_id, { dueDate: inv.dueDate, reminder: "due" }); } catch { r = { error: "exception" }; }
          if (ok(r) || permanent(r)) { inv.remindDueSentAt = new Date().toISOString(); changed = true; if (ok(r)) { reminders++; try { logProjectEvent(j.access_id, { kind: "email", label: `Invoice reminder sent (due today)`, actor: "System" }); } catch {} } }
        }
      }
    }

    if (changed) { try { saveToolData(j.access_id, "invoice", JSON.stringify(inv), "system"); } catch {} }
  }
  return { ok: true, sent, reminders, scanned };
}
