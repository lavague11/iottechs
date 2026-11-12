// Customer Portal V2 — pure logic for the simplified customer-facing project dashboard. NO I/O here:
// eligibility, flag resolution, the upcoming-appointment pick, the sanitized balance summary, and the
// applicable-card list. Everything the portal SHOWS derives from the canonical engines (project-status,
// spec PHASES, getProjectFinancialState, the schedule tool-blob) — this module only shapes/decides, so it
// is unit-testable without a DB and can never drift into a second business-logic copy.

// Only standard INSTALL projects (type A = New System, B = Upgrade) get V2. Service calls (type C) keep
// their existing svc-gateway flow. Explicit — never inferred from which stages happen to be missing.
export function eligibleForCustomerPortalV2(project) {
  const t = String(project?.project_type || "A").toUpperCase();
  return t === "A" || t === "B";
}

// Resolve V1 vs V2 for a project. Pure: the caller passes the resolved global flag (secretValue read stays
// in the server layer). Precedence: ineligible → always V1; per-project override wins over global; else global.
//   project.portal_version: "v2" force on · "v1" force off · null/undefined → inherit global
export function customerPortalV2For(project, { globalOn = false } = {}) {
  if (!eligibleForCustomerPortalV2(project)) return false;
  const ov = project?.portal_version;
  if (ov === "v2") return true;
  if (ov === "v1") return false;
  return !!globalOn;
}

// The soonest still-upcoming appointment of ANY kind, mirroring the gateway's pickUpcomingAny threshold
// (now − 1h, so an in-progress slot still counts). events: the `schedule` tool-blob's events array.
// Returns the event or null. Pure — `nowMs` is injected for testability.
export function pickUpcomingAppt(events, nowMs = Date.now()) {
  const list = Array.isArray(events) ? events : [];
  const cutoff = nowMs - 60 * 60 * 1000;
  const future = list
    .filter((e) => e && e.date)
    .map((e) => ({ e, t: new Date(`${e.date}T${(e.time || "00:00")}:00`).getTime() }))
    .filter((x) => !Number.isNaN(x.t) && x.t >= cutoff)
    .sort((a, b) => a.t - b.t);
  return future.length ? future[0].e : null;
}

// Customer-safe projection of a schedule event for the portal hero. Keeps ONLY what the customer may
// see — kind/title (so apptType can label it), date, time, location, notes — and DROPS every staff-only
// field: the invited crew/roster, RSVP confirmations, confirmed_at, ids, etc. This is what lets the
// server hand the customer portal an appointment without leaking dispatch internals. Returns null for a
// falsy or dateless event.
export function sanitizeAppt(ev) {
  if (!ev || !ev.date) return null;
  return {
    kind: ev.kind || null,
    title: ev.title || null,
    date: ev.date,
    time: ev.time || null,
    location: ev.location || null,
    notes: ev.notes || null,
  };
}

// Sanitized balance summary for the customer. `fin` = getProjectFinancialState(accessId) (null ⇒ no
// published contract). `depositDue` = amountDueForPayment(accessId,"deposit").due. Exposes ONLY customer-safe
// money — never cost/margin/processor IDs. `hasContract:false` ⇒ the portal hides the balance card entirely
// (no misleading $0 before anything is sent).
export function financeSummary(fin, depositDue = 0) {
  if (!fin) return { hasContract: false, total: 0, paid: 0, balance: 0, amountDueNow: 0, depositDue: 0, paidInFull: false, financialState: "none" };
  const total = Math.round((+fin.total || 0) * 100) / 100;
  const paid = Math.round((+fin.paid || 0) * 100) / 100;
  const balance = Math.round((fin.balance != null ? +fin.balance : Math.max(0, total - paid)) * 100) / 100;
  const paidInFull = fin.financialState === "collected" || (total > 0 && balance <= 0);
  return {
    hasContract: true,
    total, paid, balance,
    amountDueNow: Math.round((+fin.amountDueNow || 0) * 100) / 100,
    depositDue: Math.round((+depositDue || 0) * 100) / 100,
    paidInFull,
    financialState: fin.financialState || "none",
  };
}

// May the portal offer a "Make Payment" action? ONLY when money is actually collectible now — the canonical
// amountDueNow (0 for an approved-but-unsigned proposal, positive at awaiting_deposit / due_now). This keeps
// the business rule — no deposit is collected before signing — enforced in the UI, not just server-side.
export function payable(finance) {
  return !!finance?.hasContract && Number(finance.amountDueNow || 0) > 0;
}

// Installation status from facts — one of awaiting | scheduled | in_progress | complete.
export function installStatusOf(facts = {}, stage = null) {
  if (facts.install_done || stage === "qc" || stage === "payment" || stage === "completion") return "complete";
  if (stage === "install") return "in_progress";
  if (facts.install_confirmed || facts.install_date) return "scheduled";
  return "awaiting";
}

// Proposal card state — ready | awaiting | signed | null (no published proposal). "ready"/"awaiting" both
// mean the customer can sign; we label it "awaiting" (their move). Signed wins once a signature is on file.
export function proposalCardState({ proposalPublished, proposalStatus, proposalSigned } = {}) {
  if (!proposalPublished) return null;
  if (proposalSigned) return "signed";
  if (["sent", "accepted", "changes_requested", "declined"].includes(proposalStatus)) return "awaiting";
  return null;
}

// The ordered list of customer cards that ACTUALLY apply — never an empty placeholder. ctx is already-shaped
// booleans/values from the portal (survey/mockup data presence, proposal state, install status, stage,
// completion + paid-in-full). Returns [{ key, view, state }] in lifecycle order; the component owns copy/CTA.
export function portalCards(ctx = {}) {
  const cards = [];
  const stage = ctx.stage || null;
  if (ctx.surveyHasData) cards.push({ key: "survey", view: "survey", state: "available" });
  if (ctx.mockupHasData) cards.push({ key: "mockup", view: "mockup", state: "available" });

  const pState = proposalCardState(ctx);
  if (pState) cards.push({ key: "proposal", view: "proposal", state: pState });

  // Phone setup: a real next step only once signed and before install is complete.
  if (pState === "signed" && !ctx.installComplete) cards.push({ key: "phone", view: "phone", state: "available" });

  // Install status: prefer an explicit value (gateway computes it from the REAL appointment, not a stale
  // inquiry install_date), else derive from facts. Show the card only once scheduled or beyond.
  const iStatus = ctx.installStatus || installStatusOf(ctx.facts || {}, stage);
  if (iStatus !== "awaiting") cards.push({ key: "install", view: "install", state: iStatus });

  // Closeout: available once the project reaches QC / payment (or install marked done).
  if (ctx.closeoutAvailable) cards.push({ key: "closeout", view: "closeout", state: ctx.closeoutSigned ? "signed" : "available" });

  // Completion certificate: only when complete AND paid in full.
  if (ctx.complete && ctx.paidInFull) cards.push({ key: "completion", view: "completion", state: "available" });

  return cards;
}

// The overlay keys the portal understands (URL ?view=<key>). Used to validate an incoming ?view / legacy
// ?open mapping so a hand-typed value can't open something unexpected.
export const PORTAL_VIEWS = Object.freeze(["proposal", "survey", "mockup", "payment", "closeout", "completion", "install", "phone"]);
// Legacy email/SMS deep links (?open=proposal&sign=1, ?open=survey, …) → the V2 overlay key.
export function viewFromParams({ view, open } = {}) {
  if (view && PORTAL_VIEWS.includes(view)) return view;
  const map = { proposal: "proposal", survey: "survey", site_survey: "survey", mockup: "mockup", deposit: "payment", payment: "payment" };
  if (open && map[open]) return map[open];
  return null;
}
