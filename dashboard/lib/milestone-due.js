// When a payment-plan installment falls DUE — Stage 5 item 9 of docs/customer-flow-v2.md.
//
// PURE and dependency-free on purpose: lib/customer-flow-sweep.js pulls in lib/email.js, which imports
// `./db` extensionless and so only resolves inside Next. Keeping the rule here means it can be tested
// and reasoned about on its own, which is the half most likely to be wrong.
//
//   begin       — not here. What is owed before work starts is the signing email's job (item 4).
//   halfway     — when half the work-order lines are complete, or at install start on a job of 2 lines
//                 or fewer, where "half the lines" is not a moment anyone would recognise.
//   date        — the date the office put on that installment.
//   completion  — when the customer's sign-off completes. Never at install end: the work is not agreed
//                 to be finished until they say so.
export const MILESTONE_KINDS = ["begin", "halfway", "completion", "date"];

const dayOf = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
};

export function milestoneDueAt(kind, { installStart = null, halfwayAt = null, dueDate = null, signoffAt = null } = {}) {
  if (kind === "begin") return null;
  if (kind === "halfway") return halfwayAt || installStart || null;
  if (kind === "completion") return signoffAt || null;
  if (kind === "date") return dueDate ? dayOf(dueDate) : null;
  return null;
}

// Is "halfway" reached, and when? A job of 2 lines or fewer has no meaningful halfway point.
export function halfwayReached(lines = []) {
  const live = (lines || []).filter((l) => l && !l.parentKey);
  if (live.length <= 2) return { reached: false, at: null, reason: "too-few-lines" };
  const done = live.filter((l) => l.state?.status === "complete");
  if (done.length * 2 < live.length) return { reached: false, at: null, reason: "not-yet" };
  const stamps = done.map((l) => { const t = new Date(String(l.state?.status_at || "").replace(" ", "T")).getTime(); return Number.isNaN(t) ? 0 : t; }).filter(Boolean);
  return { reached: true, at: stamps.length ? Math.max(...stamps) : null, reason: null };
}
