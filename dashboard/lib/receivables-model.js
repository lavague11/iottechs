// ONE canonical finance / closure lifecycle resolver — shared by Accounts Receivable, the project page,
// the dashboard and the customer view. PURE (no DB, no React) so it is unit-tested and cannot drift.
//
// Business rules (owner spec — "receivables must show real obligations, not project totals"):
//   • A project is a RECEIVABLE only once its proposal is Approved/Accepted OR the agreement is Signed.
//     Plain inquiries / surveys / unapproved proposals never appear.
//   • APPROVED but UNSIGNED → Awaiting Signature. A 30-day signature clock runs; NOTHING is money due.
//       Past the deadline the daily job closes it "Closed — Unsigned" (it is never collectible money).
//   • SIGNED + a required deposit UNPAID → Awaiting Deposit. The unpaid deposit is the Due-Now amount.
//       This NEVER auto-closes — it waits for payment, a manual close, or legitimate completion/cancel.
//   • SIGNED + no deposit required (e.g. 100% on completion) → NOT Awaiting Deposit; the balance is
//       Pending until completion, then Due Now.
//   • SIGNED + deposit covered → remaining is Pending until completion, then Due Now; fully paid → Collected.
//   • CLOSED (manual or auto) → stays in history, is reopenable, and counts toward no active total.
//
// Lifecycle state (projects.stage) and financial state are kept SEPARATE on purpose — a project can be in
// lifecycle "proposal" while financially "Awaiting Signature", or lifecycle "install" while "Awaiting Deposit".

export const FS = {
  NONE: "none",
  AWAITING_SIGNATURE: "awaiting_signature",
  AWAITING_DEPOSIT: "awaiting_deposit",
  DUE_NOW: "due_now",
  PENDING: "pending",
  COLLECTED: "collected",
  CLOSED: "closed",
};

export const FS_LABEL = {
  none: "—",
  awaiting_signature: "Awaiting Signature",
  awaiting_deposit: "Awaiting Deposit",
  due_now: "Due Now",
  pending: "Pending",
  collected: "Collected",
  closed: "Closed",
};

export const SIGNATURE_WINDOW_DAYS = 30;
const DAY = 86400000;
const round2 = (n) => Math.round((+n || 0) * 100) / 100;

// Parse the app's stored timestamps ("YYYY-MM-DD HH:MM:SS" Eastern) or ISO strings / Date objects.
export function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = typeof v === "string" && v.indexOf("T") < 0 ? v.replace(" ", "T") : v;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function daysSince(from, now) {
  const f = parseDate(from);
  if (!f) return null;
  return Math.max(0, Math.floor((now.getTime() - f.getTime()) / DAY));
}
// signatureDeadline = start + 30 days. Stored explicitly at approval; recomputed here when absent.
export function signatureDeadlineFrom(startISO) {
  const d = parseDate(startISO);
  if (!d) return null;
  return new Date(d.getTime() + SIGNATURE_WINDOW_DAYS * DAY);
}

/**
 * resolveProjectFinancialState(input) → the canonical financial state for one project.
 *
 * input (all optional unless noted; amounts are numbers, dates are ISO/stored-string/Date):
 *   stage              projects.stage (lifecycle, pass-through)
 *   total              contract value (accepted options' grand + approved add-ons)
 *   depositPct         proposals.deposit_pct (default 50; 0 = no deposit / 100%-on-completion)
 *   approved           proposal accepted?                approvedAt (selected_at)
 *   signed             agreement signed?                 signedAt (signed_at)
 *   signatureDeadline  stored deadline (else derived)
 *   completed          completed?                        completedAt
 *   closed             closed (lost_at set)?             closedAt, closeReason
 *   reopenedAt         when it was last reopened (restarts the unsigned clock)
 *   paidConfirmed      sum of CONFIRMED payments
 *   pendingPayments    sum of unconfirmed (customer-submitted, awaiting staff confirm) payments
 *   lastPaymentAt      date of the latest payment
 *   now                evaluation time (injectable for tests)
 *
 * returns { lifecycleState, financialState, isReceivable, amountDueNow, pendingAmount, paidAmount,
 *           balance, total, agingDays, agingBasis, signatureDeadline, signatureOverdue,
 *           shouldAutoCloseUnsigned, canReopen }
 */
export function resolveProjectFinancialState(input) {
  const p = input || {};
  const now = parseDate(p.now) || new Date();
  const total = round2(p.total);
  const depositPct = (p.depositPct == null) ? 50 : +p.depositPct;
  const paid = round2(p.paidConfirmed);
  const approved = !!p.approved;
  const signed = !!p.signed;
  const completed = !!p.completed;
  const closed = !!p.closed;

  const out = {
    lifecycleState: p.stage || null,
    financialState: FS.NONE,
    isReceivable: false,
    amountDueNow: 0,
    pendingAmount: 0,
    paidAmount: paid,
    balance: round2(Math.max(0, total - paid)),
    total,
    agingDays: null,
    agingBasis: null,
    signatureDeadline: null,
    signatureOverdue: false,
    shouldAutoCloseUnsigned: false,
    canReopen: false,
  };

  // CLOSED wins over everything (manual or auto) — history, reopenable, no active money.
  if (closed) {
    out.financialState = FS.CLOSED;
    out.amountDueNow = 0;
    out.pendingAmount = 0;
    out.agingDays = daysSince(p.closedAt, now);
    out.agingBasis = "closedAt";
    out.canReopen = true;
    return out;
  }

  // Not a receivable until approved/accepted or signed.
  if (!approved && !signed) return out; // FS.NONE

  out.isReceivable = true;

  // APPROVED but UNSIGNED → Awaiting Signature. Nothing is money due; a 30-day clock runs from the
  // approval (or the reopen, if it was reopened while still unsigned).
  if (!signed) {
    const start = p.reopenedAt || p.approvedAt;
    const deadline = parseDate(p.signatureDeadline) || signatureDeadlineFrom(start);
    out.financialState = FS.AWAITING_SIGNATURE;
    out.signatureDeadline = deadline;
    out.signatureOverdue = !!(deadline && now.getTime() >= deadline.getTime());
    out.shouldAutoCloseUnsigned = out.signatureOverdue;
    out.amountDueNow = 0;   // an approved-unsigned proposal is NOT collectible money
    out.pendingAmount = 0;
    out.agingDays = daysSince(start, now);
    out.agingBasis = p.reopenedAt ? "reopenedAt" : "approvedAt";
    return out;
  }

  // SIGNED — determine the real obligation from the deposit schedule.
  const depositRequired = (depositPct > 0 && depositPct <= 100) ? round2(total * depositPct / 100) : 0;
  const depositOutstanding = round2(Math.max(0, depositRequired - paid));
  const remaining = round2(Math.max(0, total - paid));

  // SIGNED + required deposit unpaid → Awaiting Deposit (the unpaid deposit is Due Now). Never auto-closes.
  if (depositRequired > 0 && depositOutstanding > 0.009) {
    out.financialState = FS.AWAITING_DEPOSIT;
    out.amountDueNow = depositOutstanding;                         // only the unpaid deposit is due now
    out.pendingAmount = round2(Math.max(0, total - depositRequired)); // the rest is future
    out.agingDays = daysSince(p.signedAt, now);
    out.agingBasis = "signedAt";
    return out;
  }

  // Deposit satisfied (or none required).
  if (remaining <= 0.009) {
    out.financialState = FS.COLLECTED;
    out.agingDays = daysSince(p.lastPaymentAt || p.signedAt, now);
    out.agingBasis = "lastPaymentAt";
    return out;
  }
  if (completed) {
    out.financialState = FS.DUE_NOW;                               // completion balance is now collectible
    out.amountDueNow = remaining;
    out.agingDays = daysSince(p.completedAt || p.signedAt, now);
    out.agingBasis = "completedAt";
    return out;
  }
  // Signed, deposit covered, not yet completed → the balance is scheduled for later (Pending), not due.
  out.financialState = FS.PENDING;
  out.pendingAmount = remaining;
  out.agingDays = daysSince(p.signedAt, now);
  out.agingBasis = "signedAt";
  return out;
}
