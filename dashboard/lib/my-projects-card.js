// /my-projects card model — pure. The customer dashboard used to read the RAW projects.stage column
// (stale whenever a proposal was signed without an auto-advance), so a signed Pizza Bay read "Needs
// review". This recomputes everything from the same facts and resolvers the staff portal uses:
//   status ..... project-status.resolveProjectStatus + CUSTOMER_STATUS (+ statusToneHex for the tone)
//   3 steps .... staff-hub.threeStepForState (state alone — never the stale stored stage)
//   percent .... staff-hub.progressFromFacts → simpleProgressPct (the ONE milestone formula)
//   appointment  customer-portal.pickUpcomingAppt over the schedule blob
// It returns an explicit WHITELIST of customer-safe fields — never cost, payout, commission, notes,
// the invited list, change requests or assigned crew.
import { stageFloorFacts, resolveProjectStatus, CUSTOMER_STATUS, statusToneHex } from "./project-status.js";
import { threeStepForState, progressFromFacts } from "./staff-hub.js";
import { pickUpcomingAppt, payable } from "./customer-portal.js";
import { customerTodo } from "./customer-action.js";
import { masterToPhaseKey } from "./spec.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-11-18" → "Nov 18"; "14:30" → "2:30 PM". Parsed by hand so the server's timezone can't shift a day.
export function fmtApptDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}` : "";
}
export function fmtApptTime(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
// Same kind rule as the gateway: tagged install/survey, else the title ("…Installation") decides.
const apptKind = (e) => (e?.kind === "install" || e?.kind === "survey") ? e.kind : (/install/i.test(e?.title || "") ? "install" : "survey");

// Customer-safe appointment: date / time / kind only.
export function nextAppointment(events, nowMs = Date.now()) {
  const e = pickUpcomingAppt(events, nowMs);
  if (!e) return null;
  return { date: fmtApptDate(e.date), time: fmtApptTime(e.time), kind: apptKind(e) === "install" ? "Install" : "Survey" };
}

// ---- the ONE action a project card offers -------------------------------------------------------
// Spec O·166: replace the generic "Open →" with the action this project is actually waiting on, linking
// straight at it. The vocabulary is the gateway's own ?open= deep links (OPEN_TOOL_NAMES in
// gateway-client.jsx) — nothing new is invented here, so the button lands on the tool it names.
// Keyed on customerTodo's `order`, which is the same ranking the action banner above the list uses.
// `needs` names the fact in card.actionable that must be TRUE before the card may promise this action.
const TODO_ACTION = {
  1: { label: "Approve", open: "site_survey", needs: "survey" },   // survey awaiting approval
  2: { label: "Review",  open: "proposal",    needs: "proposal" }, // proposal sent, not yet accepted
  3: { label: "Sign",    open: "proposal",    needs: "proposal" }, // accepted, awaiting signature
  4: { label: "Pay",     open: "deposit",     needs: "payment" },  // deposit due
  5: { label: "Pay",     open: "payment",     needs: "payment" },  // final balance due
};
export function projectCardAction(card = {}) {
  const base = `/project/${card.access_id}`;
  // Completed outranks everything. The todo is derived from FLOORED facts, so a finished project whose
  // stored stage lagged behind still carries a stale obligation — it must read View, not "Approve".
  if (card.status?.key === "done") return { label: "View", href: base };
  const t = card.todo && TODO_ACTION[card.todo.order];
  // A card may only promise what exists. The status label may say "Needs action" on floored facts; a
  // BUTTON may not, because the portal drops a deep link whose overlay is unavailable and silently
  // lands the customer on the portal home. Absent `actionable` = not established = no promise.
  if (t && card.actionable?.[t.needs] === true) return { label: t.label, href: `${base}?open=${t.open}` };
  if (card.appt) {
    const open = { label: "Open", href: base };
    // Only when the page minted a token — without one there is no reschedule flow to send them to,
    // and a dead link is worse than no link.
    if (card.appt.rescheduleToken) open.secondary = { label: "Reschedule", href: `/appt/${card.appt.rescheduleToken}` };
    return open;
  }
  return { label: "Open", href: base };
}

// The stage the customer's TODO is evaluated at, by the state that produced it (customerTodo is keyed
// on stage). Keeps one todo engine while letting a stale stored stage not hide a real obligation.
const TODO_STAGE = { AWAITING_SURVEY_APPROVAL: "site_survey", AWAITING_SIGNATURE: "approval_deposit", AWAITING_DEPOSIT: "approval_deposit", AWAITING_FINAL_PAYMENT: "payment" };

const titleOf = (p) => String(p.company_name || p.customer || "").trim();

// project: the projects row (decorated). facts: db.buildStageFacts (+ survey_submitted). events: the
// schedule blob's events. fin: customer-portal.financeSummary(...) or null. proposalStarted: bool.
export function buildMyProjectCard({ project: p, facts = {}, events = [], fin = null, proposalStarted = false, now = Date.now() }) {
  const stored = p.stage;
  const sf = stageFloorFacts(facts, stored);
  const appt = nextAppointment(events, now);
  const installAppt = pickUpcomingAppt((events || []).filter((e) => apptKind(e) === "install"), now);
  const closed = !!p.lost_at || p.category === "closed" || p.status === "closed";
  const resolverFacts = {
    survey_required: !sf.survey_skipped,
    survey_skipped: sf.survey_skipped,
    survey_submitted: sf.survey_submitted,
    survey_done: sf.survey_done || sf.survey_ok || sf.survey_accepted,
    proposal_status: sf.proposal_status,
    proposal_signed: sf.proposal_signed,
    deposit_required: true,
    deposit_recorded: sf.deposit_recorded,
    install_date: installAppt?.date || null,
    install_confirmed: sf.install_confirmed,
    install_done: sf.install_done,
    completed_at: sf.completion_docs,
    final_paid: sf.final_balance_paid,
    closed_not_completed: closed && !sf.completion_docs,
  };
  const state = resolveProjectStatus(resolverFacts, stored);
  const cs = CUSTOMER_STATUS[state] || CUSTOMER_STATUS.INTAKE;
  const { phases, currentKey } = threeStepForState(state, masterToPhaseKey(stored));
  const step = phases.findIndex((x) => x.key === currentKey) + 1;

  // Money in flight is INFORMATIONAL only. A pending row is created when a payment link is made, so an
  // abandoned or failed checkout leaves one forever — it must never suppress the Pay prompt.
  const depositPending = state === "AWAITING_DEPOSIT" && !!sf.deposit_submitted && !sf.deposit_recorded;
  const finalPending = state === "AWAITING_FINAL_PAYMENT" && (+fin?.pendingPayments || 0) > 0;
  const paymentPending = depositPending || finalPending;

  // `sf` is floored, which is right for a status label and wrong for a prompt that names a document:
  // pass the UNFLOORED published-proposal fact alongside so customerTodo cannot announce one that was
  // never sent (B8).
  const todo = customerTodo({ ...sf, stage: TODO_STAGE[state] || stored, proposal_published: !!facts.proposal_status });

  let key, label, tone, detail = null;
  if (closed && state !== "COMPLETE") { key = "closed"; label = "Closed"; tone = "neutral"; }
  else if (state === "COMPLETE") { key = "done"; label = "Completed"; tone = "green"; }
  else if (todo || cs.cta) { key = "action"; label = "Needs action"; tone = "gold"; detail = paymentPending ? `${cs.label} · pending` : cs.label; }
  else { key = "progress"; label = "In progress"; tone = "neutral"; detail = cs.label === "Getting Started" ? null : cs.label; }

  const pct = key === "closed" ? null : progressFromFacts({
    resolverFacts,
    sFacts: sf,
    custFacts: { ...sf, survey_done: resolverFacts.survey_done },
    hasInstallAppt: !!installAppt,
    completed: !!p.completed_at,
    finance: fin,
    proposalStarted,
  });

  return {
    access_id: p.access_id,
    title: titleOf(p),
    address: p.address || "",
    service: p.service || p.service_code || "",
    kind: String(p.project_type || String(p.access_id || "")[0] || "A").toUpperCase(),
    category: p.category,
    customer_pin: p.customer_pin,
    state,
    step: { index: step, total: phases.length, key: currentKey, label: phases[step - 1].label },
    steps: phases,
    pct,
    status: { key, label, detail, color: key === "closed" ? null : statusToneHex(tone) },
    appt,
    todo,
    // Does the thing a CTA would name actually EXIST? Read from the UNFLOORED facts, because
    // stageFloorFacts invents `proposal_status: "accepted"` for any project parked at approval_deposit
    // or later — fine for a status label, wrong for a button that promises to open a document.
    // `payment` reuses the portal's own payable(), so the card and the overlay agree by construction
    // rather than by two rules that have to be kept in step.
    actionable: {
      survey: !!facts.survey_submitted,    // something was actually submitted to approve
      proposal: !!facts.proposal_status,   // a PUBLISHED proposal exists (null when none was ever sent)
      payment: payable(fin),               // money is collectible now
    },
  };
}
