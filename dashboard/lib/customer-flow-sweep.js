// Stage 5's time-based customer emails (docs/customer-flow-v2.md items 3, 4 and 9) — the ones that fire
// because a DATE arrived rather than because someone did something. One sweep, run from the boot
// scheduler and from /api/cron/customer-flow.
//
// Every send goes through onceForProject, so the ledger — not this file's arithmetic — is what makes an
// email unrepeatable. That matters because a sweep is the thing most likely to run twice: overlapping
// timers, a manual cron hit, two instances. The arithmetic here only decides WHEN a thing becomes due;
// the claim decides whether it has already been said.
//
//   item 3  quote_expiring   2 days before the price lock lapses, if still unsigned
//           quote_expired    once, when it lapses — links to Request to reopen. Nothing after.
//   item 4  signed_unpaid_2d 2 days after signing, if nothing has been paid and something was owed
//   item 9  milestone_due:<n>      a plan installment falls due (Halfway / a date / on completion)
//           milestone_due:<n>:r1   reminder 2 days later
//           milestone_due:<n>:r2   second reminder at 5 days, final balance only
//
// Replaces the invoice reminders (3 days before / on the due date) — see lib/invoice-emails.js, whose
// reminder half is now disabled.
import {
  getAllJobs, getPublishedProposal, getJobByAccessId, getProjectFinancialState,
  getToolData, customerEmailSent, logProjectEvent, getWorkOrderDoc,
} from "./db.js";
import { priceLockWindow, planScheduleRows, customPlanRows } from "./proposal.js";
import { milestoneDueAt, halfwayReached } from "./milestone-due.js";
import { onceForProject, sendCustomerEmail } from "./email.js";

const DAY = 86400000;
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tOf = (s) => { const t = s ? new Date(String(s).replace(" ", "T")).getTime() : NaN; return Number.isNaN(t) ? 0 : t; };
const dayOf = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };

// ---- item 3: the price lock ----------------------------------------------------------------------
async function sweepQuoteExpiry(job, now) {
  const row = getPublishedProposal(job.access_id);
  if (!row || row.signed_name) return 0;
  const fin = (() => { try { return getProjectFinancialState(job.access_id); } catch { return null; } })();
  const win = priceLockWindow(row, job, { paid: +fin?.paid || 0, now });
  if (!win.active || win.until == null) return 0;
  let sent = 0;

  // Two days left — one reminder, and only while there genuinely are days left.
  if (!win.expired && win.until - now <= 2 * DAY) {
    const r = await onceForProject(job.access_id, "quote_expiring", async () => {
        return sendCustomerEmail(job.access_id, {
        subject: "2 days left before your quote expires",
        heading: "Your quote expires in 2 days",
        intro: "The pricing we put together for you is held for a little longer.",
        lines: ["After that we may need to re-quote, because equipment and labour costs move.",
                "Signing takes a minute and locks everything in."],
        ctaLabel: "Review & sign", open: "proposal",
      });
    });
    if (r?.ok || r?.id) { sent += 1; try { logProjectEvent(job.access_id, { kind: "email", label: "Quote expiry reminder sent (2 days left)", actor: "System" }); } catch {} }
  }

  // Expired — one notice, pointing at the reopen. The spec is explicit: nothing after that.
  if (win.expired) {
    const r = await onceForProject(job.access_id, "quote_expired", async () => {
        return sendCustomerEmail(job.access_id, {
        subject: "Your quote has expired",
        heading: "Your quote has expired",
        intro: "The pricing we held for you has lapsed.",
        lines: ["Nothing is lost — open your project and ask us to reopen it, and we'll refresh the quote.",
                "If it has been under a week we can reactivate the same pricing straight away."],
        ctaLabel: "Request to reopen", open: "proposal",
      });
    });
    if (r?.ok || r?.id) { sent += 1; try { logProjectEvent(job.access_id, { kind: "email", label: "Quote expiry notice sent", actor: "System" }); } catch {} }
  }
  return sent;
}

// ---- item 4: signed, something owed up front, nothing paid two days later --------------------------
async function sweepSignedUnpaid(job, now) {
  const row = getPublishedProposal(job.access_id);
  if (!row?.signed_name || !row.signed_at) return 0;
  if (now - tOf(row.signed_at) < 2 * DAY) return 0;
  const fin = (() => { try { return getProjectFinancialState(job.access_id); } catch { return null; } })();
  if (!fin) return 0;
  if ((+fin.paid || 0) > 0) return 0;                 // they paid — nothing to chase
  // From the PLAN, not amountDueNow: that reads the legacy deposit_pct column, which drifts. A Stage 6
  // fixture (a custom plan of Halfway + a date) was chased for $800 it had never asked the customer for.
  const { upFrontDueFor } = await import("./email.js");
  const due = (await upFrontDueFor(job.access_id)).due;
  if (due <= 0.005) return 0;                          // nothing was owed up front
  const r = await onceForProject(job.access_id, "signed_unpaid_2d", async () => {
    return sendCustomerEmail(job.access_id, {
      subject: "A reminder — payment due to start your project",
      heading: "We're ready when you are",
      intro: `Your agreement is signed. To book your installation we need ${money(due)}.`,
      lines: ["You can pay online from your project page, or in cash to the office or to your technician.",
              "As soon as it's in, we'll schedule you."],
      ctaLabel: "Pay now", open: "payment",
    });
  });
  if (r?.ok || r?.id) { try { logProjectEvent(job.access_id, { kind: "email", label: "Payment reminder sent (2 days after signing)", actor: "System" }); } catch {} return 1; }
  return 0;
}

// ---- item 9: the plan's own milestones -------------------------------------------------------------
// The due-date rule itself lives in lib/milestone-due.js — pure, so it can be tested without pulling
// lib/email.js (and therefore Next's module resolution) in behind it.
function planInstallments(job) {
  const row = getPublishedProposal(job.access_id);
  if (!row?.signed_name) return [];
  let payload = {}; try { payload = JSON.parse(row.payload || "{}"); } catch { return []; }
  const plan = payload.payment_plan || null;
  const fin = (() => { try { return getProjectFinancialState(job.access_id); } catch { return null; } })();
  const total = +fin?.total || 0;
  if (!total) return [];
  if (plan === "custom") {
    return customPlanRows(payload.custom_plan?.rows, total).map((r, i) => ({ idx: i, kind: r.when, amount: r.amount, due: r.due, label: r.dueLabel }));
  }
  // Preset plans: the schedule's own milestones, mapped onto the same vocabulary.
  return planScheduleRows(plan, [], total, payload.full_date || null).map((r, i) => ({
    idx: i, amount: r.amount, label: r.when,
    kind: /begin/i.test(r.when || "") ? "begin" : /midpoint|halfway/i.test(r.when || "") ? "halfway"
      : /^by /i.test(r.when || "") ? "date" : "completion",
    due: payload.full_date || null,
  }));
}

async function sweepMilestones(job, now) {
  const inst = planInstallments(job);
  if (!inst.length) return 0;
  const fin = (() => { try { return getProjectFinancialState(job.access_id); } catch { return null; } })();
  if (!fin || (+fin.balance || 0) <= 0.005) return 0;   // nothing outstanding — never chase a paid job

  // The facts each milestone kind turns on.
  const doc = (() => { try { return JSON.parse(getToolData(job.access_id, "schedule")?.data || "{}"); } catch { return {}; } })();
  const installEv = (doc.events || []).find((e) => e && (e.kind === "install" || /install/i.test(e.title || "")) && e.date);
  const installStart = installEv ? dayOf(installEv.date) : null;
  const { woHalfwayAt, signoffAt } = woFacts(job.access_id);

  let sent = 0;
  for (const m of inst) {
    if (m.kind === "begin") continue;
    const dueAt = milestoneDueAt(m.kind, { installStart, halfwayAt: woHalfwayAt, dueDate: m.due, signoffAt });
    if (dueAt == null || now < dueAt) continue;
    const key = `milestone_due:${m.idx}`;
    const isFinal = m.kind === "completion";
    const stages = [
      { k: key, after: 0, subject: `Payment due — ${money(m.amount)}`, heading: "A payment is due" },
      { k: `${key}:r1`, after: 2 * DAY, subject: `Reminder — ${money(m.amount)} due`, heading: "A reminder" },
      ...(isFinal ? [{ k: `${key}:r2`, after: 5 * DAY, subject: `Final balance still outstanding`, heading: "Your final balance" }] : []),
    ];
    for (const st of stages) {
      if (now < dueAt + st.after) continue;
      // A reminder only goes out if the thing it reminds about actually went out.
      if (st.after > 0 && !customerEmailSent(job.access_id, key)) continue;
      const r = await onceForProject(job.access_id, st.k, async () => {
            return sendCustomerEmail(job.access_id, {
          subject: st.subject,
          heading: st.heading,
          intro: `${money(m.amount)} is due${m.label ? ` — ${m.label}` : ""}.`,
          lines: [`Balance outstanding: ${money(fin.balance)}`,
                  "You can pay online from your project page, or in cash to the office or to your technician."],
          ctaLabel: "Pay now", open: "payment",
        });
      });
      if (r?.ok || r?.id) { sent += 1; try { logProjectEvent(job.access_id, { kind: "email", label: `${st.heading} — ${money(m.amount)}`, actor: "System", money: true }); } catch {} }
    }
  }
  return sent;
}

// Work-order facts the milestones turn on, read here so the sweep has no second copy of the rule.
function woFacts(accessId) {
  try {
    const doc = getWorkOrderDoc(accessId);
    if (!doc) return { woHalfwayAt: null, signoffAt: null };
    const h = halfwayReached(doc.lines || []);
    return { woHalfwayAt: h.reached ? h.at : null, signoffAt: doc.customerSignature ? tOf(doc.customerSignature.signed_at) || null : null };
  } catch { return { woHalfwayAt: null, signoffAt: null }; }
}

// ---- the sweep ------------------------------------------------------------------------------------
export async function sweepCustomerFlowEmails({ now = Date.now() } = {}) {
  let jobs = [];
  try { jobs = getAllJobs(); } catch { return { ok: false, error: "db" }; }
  let expiry = 0, unpaid = 0, milestones = 0, scanned = 0;
  for (const j of jobs) {
    const job = getJobByAccessId(j.access_id);
    if (!job) continue;
    scanned += 1;
    try { expiry += await sweepQuoteExpiry(job, now); } catch (e) { console.error(`[flow:expiry] ${j.access_id}: ${e?.message || e}`); }
    try { unpaid += await sweepSignedUnpaid(job, now); } catch (e) { console.error(`[flow:unpaid] ${j.access_id}: ${e?.message || e}`); }
    try { milestones += await sweepMilestones(job, now); } catch (e) { console.error(`[flow:milestone] ${j.access_id}: ${e?.message || e}`); }
  }
  return { ok: true, scanned, expiry, unpaid, milestones, sent: expiry + unpaid + milestones };
}
