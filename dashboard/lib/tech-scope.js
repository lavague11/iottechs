// WHAT A TECHNICIAN MAY DO — one allow-list, deny by default.
//
// The rule the owner set: a tech can view the work order, do it, run QC, add expenses, add the
// activation QR, READ the site survey, see their own job budget and download the work order PDF.
// Nothing else — and "nothing else" is enforced on the SERVER, not by hiding buttons.
//
// HOW IT IS ENFORCED. Every server action on the project page resolves its caller through one of
// three choke points: getAnyTok / getSessionTok (actions.js), getSessionRole (proposal-actions.js)
// and gate() (work-order-actions.js). Each of those now takes the name of the action calling it and
// asks techAllows() first. An action that passes no name — which is every action nobody deliberately
// opened to a technician — DENIES a tech, because the default here is deny. That is the whole point:
// a new action added next year is closed to techs until someone adds it to this list on purpose, so
// the failure mode of forgetting is a refusal rather than a leak.
//
// This list is names, not capabilities. lib/roles.js still says what a role may do with each THING
// (survey.edit, wo.payout.view, …) and the actions still check it; this is the outer fence that
// makes the inner checks unreachable for a technician on anything outside the list.

export const TECH_ALLOW = new Set([
  // ── View the work order, and do the work ───────────────────────────────────────────────────────
  "getWorkOrderAction",          // the document itself (payout-stripped when the office turned payouts off)
  "getWorkOrderEventsAction",    // its history
  "signWorkOrderAction",         // accept the work order = accept the assignment (wo.sign)
  "acceptWorkOrderAction",       // the same acceptance on the proposal row (legacy path, still live)
  "checkInAction",               // "I'm on site"
  "setLineStatusAction",         // Complete / Needs attention / Incomplete on a line
  "addLinePhotoAction",
  "removeLinePhotoAction",
  "syncFieldQueueAction",        // offline queue flush from the phone
  "endDayAction",                // close the day
  "listInstallPhotosAction",
  "reportInstallIssueAction",    // flag a problem found on site (issue.report)
  "listInstallIssuesAction",
  "techAdvanceStageAction",      // the tech's own forward step through their 4 stages

  // ── QC ────────────────────────────────────────────────────────────────────────────────────────
  "acceptStageAction",           // the QC sign-off (capability-checked per stage inside)

  // ── Expenses — their own, submitted for the office to approve ─────────────────────────────────
  "submitExpenseAction",

  // ── The activation QR ─────────────────────────────────────────────────────────────────────────
  "setSystemQrAction",

  // ── Reads the field screens cannot work without ───────────────────────────────────────────────
  // getProposalAction hands a tech the FROZEN work-order version through sanitizeProposal(row,"tech"),
  // which carries techPrice only — never the customer's price, cost or totals. It is the tech's scope.
  "getProposalAction",
  "getToolDataAction",           // survey (read-only), install checklist, QC — sanitized per role
  "proposalLayoutMetaAction",    // "is there a layout to show?"
  "getAcceptancesAction",        // the facts the page renders from
  "getEventsAction",             // the job log
  "getRatesAction",              // their own payout rates, for the install checklist
  // saveToolDataAction is on the list because the install checklist and QC are tool blobs. WHICH tool
  // a tech may write is decided inside it by lib/roles.js: survey/survey2 editors come from
  // can(role,"survey.edit"), which no longer includes a technician, so a survey write is refused on
  // both write paths. The allow-list opens the door; roles.js still says which rooms.
  "saveToolDataAction",
]);

// Is `actionKey` open to a technician? No key at all → NO. Deny by default.
export function techAllows(actionKey) {
  return !!actionKey && TECH_ALLOW.has(actionKey);
}

// The refusal for a role/action pair, or null when the call may proceed. Only a technician is
// filtered here; every other role keeps the checks it already had.
export function techRefusal(role, actionKey) {
  if (role !== "tech") return null;
  return techAllows(actionKey) ? null : "A technician cannot do that.";
}

// What a fenced technician's token becomes. NOT null, and deliberately so: several actions fall back
// to `tok?.role || "customer"` when there is no token, and a customer MAY see the customer's money —
// so returning null to a blocked tech would have handed them the payment ledger through the back
// door. "denied" is in no capability list and no role array in the codebase, so every check it meets
// fails closed: can() says no, STAFF_EDIT says no, `role === "tech"` branches do not fire, and the
// action returns its own ordinary refusal.
export const DENIED_ROLE = "denied";

// Apply the fence to a resolved token. Every choke point calls this and nothing else.
export function fenceTok(tok, actionKey) {
  if (!tok || tok.role !== "tech") return tok;
  if (techAllows(actionKey)) return tok;
  return { ...tok, role: DENIED_ROLE, deniedRole: "tech", deniedAction: actionKey || null };
}

// Tools a technician may WRITE. Mirrors the editor map in saveToolDataAction / POST /api/tool-data —
// named here so a test can assert the survey is not among them without re-deriving the map.
export const TECH_WRITABLE_TOOLS = new Set(["install", "qc", "receiving"]);
export const techMayWriteTool = (tool) => TECH_WRITABLE_TOOLS.has(tool);

// ====================================================================================================
// THE TECH'S OWN MONEY — the job budget. Their payout for this job, the expenses they filed against
// it, and what is left. The customer's price, the margin and anyone else's payout are not inputs here
// and never reach the payload.
// ====================================================================================================

// Pay setups. Only a per-job tech has a "budget for this job" to show at all: an hourly or salaried
// tech is not paid out of the job's labor line, so showing them one would be fiction.
export const PAY_TYPES = ["per_job", "hourly", "salary"];
export const DEFAULT_PAY_TYPE = "per_job";
export const normalizePayType = (v) => (PAY_TYPES.includes(String(v || "")) ? String(v) : DEFAULT_PAY_TYPE);
export const paidPerJob = (payType) => normalizePayType(payType) === "per_job";

// Expenses that count against the budget: the ones THIS tech filed on THIS job, pending or paid. A
// declined expense was refused by the office, so it is not money out of the budget.
const COUNTS = new Set(["pending", "paid", "approved"]);

// → { show, budget, spent, remaining, count, pending } | { show: false, reason }
//
// `budget`  = the payout total on the tech's work order (null when the office hid payouts for this job)
// `spent`   = the sum of their own counting expenses
// `remaining` = budget − spent (may go negative; that is a real state and is shown, not clamped)
//
// show === false whenever there is no honest number to print: not per-job, payouts hidden, or no
// budget set yet. The caller renders nothing at all in that case — never a $0 card.
export function techJobBudget({ payType, payoutTotal, expenses = [], techId = null } = {}) {
  if (!paidPerJob(payType)) return { show: false, reason: "not-per-job" };
  const budget = payoutTotal == null || payoutTotal === "" ? null : Number(payoutTotal);
  if (budget == null || !Number.isFinite(budget) || budget <= 0) return { show: false, reason: "no-budget" };
  const mine = (Array.isArray(expenses) ? expenses : []).filter((e) => {
    if (!e) return false;
    if (techId != null && e.submitted_by_id != null && Number(e.submitted_by_id) !== Number(techId)) return false;
    return COUNTS.has(String(e.status || "pending").toLowerCase());
  });
  const spent = mine.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pending = mine.filter((e) => String(e.status || "").toLowerCase() === "pending").length;
  return {
    show: true,
    budget: round2(budget),
    spent: round2(spent),
    remaining: round2(budget - spent),
    count: mine.length,
    pending,
  };
}
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ====================================================================================================
// THE TECH'S OWN STATUS LADDER — what the field sees instead of the customer's lifecycle.
//
// A technician's job does not change because an invoice is unpaid, so the money states
// (AWAITING_DEPOSIT / AWAITING_FINAL_PAYMENT) have no place on their screen. These five states are
// the tech's actual sequence: wait for the work order → do it → QC → hand over → done.
// ====================================================================================================
export const TECH_STATES = ["AWAITING_WORK_ORDER", "WORK_ORDER_READY", "WORK_IN_PROGRESS", "QC", "JOB_COMPLETE"];

export const TECH_STATUS = {
  AWAITING_WORK_ORDER: { label: "Waiting for work order", tone: "neutral", cta: null },
  WORK_ORDER_READY:    { label: "Work order ready",       tone: "gold",    cta: "Start Work Order" },
  WORK_IN_PROGRESS:    { label: "Work in progress",       tone: "neutral", cta: "Continue Work Order" },
  QC:                  { label: "Quality control",        tone: "gold",    cta: "Run QC" },
  JOB_COMPLETE:        { label: "Job complete",           tone: "green",   cta: null },
};

// Derive the tech's state from facts they are allowed to know. Deliberately ignores every money fact.
//   woExists   — the office has created the work order document
//   woAccepted — this tech signed/accepted it
//   started    — any line has been marked, or a check-in happened
//   installDone— the field work is finished
//   qcSigned   — QC is signed off
//   completed  — the project itself is closed out (completed_at)
//
// The two finishing facts are checked INDEPENDENTLY of install_done on purpose. A closed-out job
// routinely carries qc_customer_signed and completed_at while install_done was never stamped — seeded
// and legacy rows both do it — and requiring all three told a technician their finished job was still
// "work in progress". The nearest true fact wins.
export function techStatusOf({ woExists, woAccepted, started, installDone, qcSigned, completed } = {}) {
  if (qcSigned || completed) return "JOB_COMPLETE";
  if (installDone) return "QC";
  if (!woExists) return "AWAITING_WORK_ORDER";
  if (!woAccepted && !started) return "WORK_ORDER_READY";
  return "WORK_IN_PROGRESS";
}

// The work-order CARD's words for a technician — the bug the owner found was this card still saying
// "Create the work order" to a tech, who never creates one.
export function techWorkOrderCard({ woExists, woAccepted, started, installDone, qcSigned, completed, lineProgress } = {}) {
  const state = techStatusOf({ woExists, woAccepted, started, installDone, qcSigned, completed });
  if (state === "AWAITING_WORK_ORDER") return { title: "Work Order", sub: "The office has not issued it yet.", action: null, done: false };
  if (state === "JOB_COMPLETE") return { title: "Work Order", sub: "Complete.", action: "View", done: true };
  if (state === "QC") return { title: "Work Order", sub: "Work complete — run QC.", action: "Open", done: true };
  if (state === "WORK_ORDER_READY") return { title: "Work Order", sub: "Ready for you.", action: "Start", done: false };
  const p = lineProgress;
  return { title: "Work Order", sub: p && p.total ? `${p.done} of ${p.total} lines complete.` : "In progress.", action: "Continue", done: false };
}
