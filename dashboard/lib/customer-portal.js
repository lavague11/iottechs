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

// Sanitized balance summary for the customer. `fin` = getProjectFinancialState(accessId) (null ⇒ no
// published contract). `depositDue` = amountDueForPayment(accessId,"deposit").due. Exposes ONLY customer-safe
// money — never cost/margin/processor IDs. `hasContract:false` ⇒ the portal hides the balance card entirely
// (no misleading $0 before anything is sent).
export function financeSummary(fin, depositDue = 0) {
  if (!fin) return { hasContract: false, pendingPayments: 0, total: 0, paid: 0, balance: 0, amountDueNow: 0, depositDue: 0, paidInFull: false, financialState: "none" };
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
    // Submitted-but-unconfirmed money (informational — a pending row can be an abandoned checkout).
    pendingPayments: Math.round((+fin.pendingPayments || 0) * 100) / 100,
    financialState: fin.financialState || "none",
    // Pending addendums: shown as a separate "awaiting approval" line, NOT added to the amount due
    // until the customer approves (then they fold into `total`/`balance` automatically).
    pendingAddons: Math.round((+fin.pendingAddons || 0) * 100) / 100,
    pendingAddonCount: +fin.pendingAddonCount || 0,
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

// THE canonical applicability resolver — the single source of truth for "is this customer view meaningful
// right now?". BOTH the portal cards AND the URL ?view= overlays consult this, so a card and a direct link
// can never disagree and a hand-typed ?view can never force an empty/unavailable overlay. A view is available
// only when opening it yields real customer content:
//   proposal   — a published proposal exists
//   survey     — customer-facing survey data exists
//   mockup     — customer-facing mockup data exists
//   payment    — money is collectible NOW (canonical amountDueNow > 0), never merely a remaining balance
//   install    — a real upcoming appointment, or install scheduled/in-progress/complete
//   closeout   — customer-facing closeout content is READY (QC all-pass, or a customer signoff already on
//                file) — NOT merely that the master stage says QC (that can be empty for the customer)
//   completion — the project is complete AND paid in full (certificate eligibility)
//   phone      — signed and install not yet complete (the one real pre-install setup step)
// ctx carries already-shaped booleans from the portal; finance is the sanitized financeSummary (for payment).
export function viewAvailability(ctx = {}, finance = null) {
  const pState = proposalCardState(ctx);
  const iStatus = ctx.installStatus || installStatusOf(ctx.facts || {}, ctx.stage || null);
  return {
    proposal:   !!pState,
    survey:     !!ctx.surveyHasData,
    mockup:     !!ctx.mockupHasData,
    payment:    payable(finance),
    install:    !!ctx.hasAppt || iStatus !== "awaiting",
    closeout:   !!ctx.closeoutReady,
    completion: !!(ctx.complete && ctx.paidInFull),
    phone:      pState === "signed" && !ctx.installComplete,
    // B13: the change-order overlay is available whenever the customer has an add-on to look at —
    // one awaiting their signature, or an already-signed one they may re-read. `addendumCount`
    // excludes add-ons still awaiting office pricing, so they never see an unpriced one.
    addendum:   !!ctx.addendumAwaiting || (+ctx.addendumCount || 0) > 0,
  };
}

// The ordered list of customer cards that ACTUALLY apply — never an empty placeholder. Derived from the SAME
// viewAvailability resolver the overlays use, so cards and routes stay in lockstep. Returns [{key,view,state}]
// in lifecycle order; the component owns copy/CTA. (payment is never a card — it's reached from the balance.)
// MERGE: System Preview (mockup) folded into Site Survey — one entry card. The customer reviews the
// camera photos inside the survey's Walkthrough; `mockup` stays a valid ?view= overlay (deep links) but
// is no longer its own card.
// B13: the change order sits after Installation — it is raised when something on site differs from the
// proposal, so that is where the customer expects to find it.
const CARD_ORDER = ["survey", "proposal", "phone", "install", "addendum", "closeout", "completion"];
export function portalCards(ctx = {}, finance = null) {
  const avail = viewAvailability(ctx, finance);
  const pState = proposalCardState(ctx);
  const iStatus = ctx.installStatus || installStatusOf(ctx.facts || {}, ctx.stage || null);
  const stateOf = { proposal: pState, install: iStatus, closeout: ctx.closeoutSigned ? "signed" : "available",
    addendum: ctx.addendumAwaiting ? "awaiting" : "signed" };
  return CARD_ORDER.filter((k) => avail[k]).map((k) => ({ key: k, view: k, state: stateOf[k] || "available" }));
}

// The overlay keys the portal understands (URL ?view=<key>). Used to validate an incoming ?view / legacy
// ?open mapping so a hand-typed value can't open something unexpected. `phone` is a link-out (a guide), not
// an in-portal overlay, so it is deliberately absent from OVERLAY_VIEWS below.
export const PORTAL_VIEWS = Object.freeze(["proposal", "survey", "mockup", "payment", "closeout", "completion", "install", "phone", "addendum"]);
// The views that render as an in-portal overlay (phone is excluded — it navigates to a support guide).
export const OVERLAY_VIEWS = Object.freeze(["proposal", "survey", "mockup", "payment", "closeout", "completion", "install", "addendum"]);
// Is `view` both a renderable overlay AND currently available? One check for direct-URL + card clicks.
export function overlayAvailable(view, ctx = {}, finance = null) {
  return OVERLAY_VIEWS.includes(view) && !!viewAvailability(ctx, finance)[view];
}
// Legacy email/SMS deep links (?open=proposal&sign=1, ?open=survey, …) → the V2 overlay key.
export function viewFromParams({ view, open } = {}) {
  if (view && PORTAL_VIEWS.includes(view)) return view;
  // `addendum` is the gateway's own ?open= name (OPEN_TOOL_NAMES), so the project card's "Sign" link
  // works whichever portal the customer is served (B13).
  const map = { proposal: "proposal", survey: "survey", site_survey: "survey", mockup: "mockup", deposit: "payment", payment: "payment", addendum: "addendum" };
  if (open && map[open]) return map[open];
  return null;
}

// The ONLY fields of a schedule event a customer may receive. A whitelist, not a blacklist: crew, invitees,
// confirmations, and the free-text `notes` (technician instructions, access concerns) are staff-internal and
// can never ride along, whatever the event grows to carry. Server-side — page.jsx calls this before the prop.
export const APPT_PUBLIC_FIELDS = Object.freeze(["kind", "title", "date", "time", "location"]);
export function sanitizeAppt(ev) {
  if (!ev || !ev.date) return null;
  const out = {};
  for (const k of APPT_PUBLIC_FIELDS) out[k] = ev[k] || null;
  return out;
}

// Customer-safe payment ledger rows: what was paid, when, how, and whether staff has confirmed receipt.
// Never the recorder's name, internal note, processor ids, fee internals or proof photos. Voided and
// zero-amount rows are not payments. Newest first.
export const PAYMENT_PUBLIC_FIELDS = Object.freeze(["id", "amount", "method", "kind", "paid_at", "status"]);
export function paymentsSummary(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((p) => p && (+p.amount || 0) > 0 && p.status !== "void")
    .map((p) => {
      const o = {};
      for (const k of PAYMENT_PUBLIC_FIELDS) o[k] = p[k] ?? null;
      o.amount = Math.round((+p.amount || 0) * 100) / 100;
      return o;
    });
}

// "Render only when real" in one place: which blocks the portal home draws. No contract → no balance card
// (never a misleading $0); no appointment → no appointment card; no recorded payment → no payments list; no
// saved survey → no survey entry. The component reads these booleans and nothing else decides.
export function portalBlocks({ finance = null, appt = null, ctx = {}, payments = [] } = {}) {
  const avail = viewAvailability(ctx, finance);
  return {
    appointment: !!appt,
    balance: !!finance?.hasContract,
    payments: !!finance?.hasContract && (payments || []).length > 0,
    survey: avail.survey,
    proposal: avail.proposal,
  };
}

// THE gate for the raw payment ledger (project_payments rows carry recorder, note, processor ids, fee and proof
// photos). Every server action that returns payments goes through this, so the rule lives in one place:
//   · no `customer.financials.view` (tech, vendor, anyone else) → nothing at all
//   · customer → whitelisted columns, plus `source`/`created_at`, and — ONLY on their own submissions
//     (source === "customer") — the note, proof photos and their own name, which they authored
//   · office roles → the full ledger
// `canSeeFinancials` is passed in so this module stays free of the roles import cycle.
export function paymentsForViewer(role, rows, canSeeFinancials) {
  const list = Array.isArray(rows) ? rows : [];
  if (!canSeeFinancials) return [];
  if (role !== "customer") return list;
  return list.filter((p) => p && p.status !== "void").map((p) => {
    const o = {};
    for (const k of PAYMENT_PUBLIC_FIELDS) o[k] = p[k] ?? null;
    o.amount = Math.round((+p.amount || 0) * 100) / 100;
    o.source = p.source ?? null;
    o.created_at = p.created_at ?? null;
    if (p.source === "customer") { o.note = p.note ?? null; o.photos = p.photos || []; o.recorded_by = p.recorded_by ?? null; }
    return o;
  });
}
