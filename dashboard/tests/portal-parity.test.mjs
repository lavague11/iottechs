// Section M — the customer portal (V2) at parity with the staff portal. Pure where possible; the wiring
// that can only be seen in components (one header, server-side role gates) is pinned from source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolveProjectStatus } from "../lib/project-status.js";
import { progressFromFacts, threeStepPhases } from "../lib/staff-hub.js";
import {
  sanitizeAppt, pickUpcomingAppt, paymentsSummary, paymentsForViewer, portalBlocks, financeSummary, APPT_PUBLIC_FIELDS, PAYMENT_PUBLIC_FIELDS,
} from "../lib/customer-portal.js";
import { survey2HasData, survey2CameraCount } from "../lib/tool-data.js";
import { surveyDevices, parseSurveyFloors } from "../lib/survey2-model.js";
import { can } from "../lib/roles.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---- one stage, one percent ----------------------------------------------------------------------
// The gateway feeds the SAME facts to resolveProjectStatus (the chip) and progressFromFacts (the bar) for
// every viewer. Role is not an input to either function, so customer and staff cannot disagree.
const CASES = [
  { name: "sent, unsigned",   f: { proposal_status: "sent" },                                                         pct: 33, state: "AWAITING_SIGNATURE",  stage: "proposal" },
  { name: "signed, no date",  f: { proposal_status: "accepted", proposal_signed: true, deposit_recorded: true },      pct: 45, state: "READY_TO_SCHEDULE",   stage: "schedule" },
  { name: "signed + install", f: { proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, install_confirmed: true }, pct: 50, state: "INSTALL_SCHEDULED", stage: "schedule", sched: true },
  { name: "install done",     f: { proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, install_done: true },        pct: 66, state: "AWAITING_FINAL_PAYMENT", stage: "qc" },
];
for (const c of CASES) {
  test(`same stage and percent for every viewer — ${c.name}`, () => {
    const facts = { survey_required: false, survey_skipped: true, deposit_required: true, ...c.f };
    const state = resolveProjectStatus(facts, c.stage);
    const opts = { resolverFacts: facts, sFacts: facts, custFacts: {}, hasInstallAppt: !!c.sched };
    assert.equal(state, c.state);
    assert.equal(progressFromFacts(opts), c.pct);
    // viewer-independence: identical inputs, identical answers (role never enters either function)
    assert.equal(resolveProjectStatus({ ...facts }, c.stage), state);
    assert.equal(progressFromFacts({ ...opts }), c.pct);
  });
}
test("a paid-up QC-complete project reads 100 and Completion; owed balance holds it at 90", () => {
  const base = { resolverFacts: { proposal_status: "accepted", proposal_signed: true }, sFacts: { install_done: true }, custFacts: { qc_customer_signed: true }, completed: true };
  assert.equal(progressFromFacts({ ...base, finance: { hasContract: true, paidInFull: true } }), 100);
  assert.equal(progressFromFacts({ ...base, finance: { hasContract: true, paidInFull: false } }), 90);
  assert.equal(threeStepPhases("ph_wrap").currentKey, "completion");
});
test("the portal reads the 3-step rail, never the legacy 5-step bar", () => {
  const cp = read("app/project/[accessId]/gateway-client.jsx");
  const at = cp.indexOf("<CustomerPortal");
  const v2 = cp.slice(at, at + 2500);
  assert.match(v2, /phases=\{rail3\.phases\}/);
  assert.match(v2, /progressPct=\{simplePct\}/);
  assert.doesNotMatch(v2, /phasePct|custProgressPct/);
});

// ---- appointment card ----------------------------------------------------------------------------
const EV = { id: 9, kind: "install", title: "Installation", date: "2026-11-18", time: "10:00", location: "2503 Jay Pl",
  notes: "gate code 4412 - dog in yard", crew: ["Sam"], techs: [{ id: 3 }], invitees: ["a@b.c"], confirmations: { sam: "yes" }, rsvp: {}, payout: 400 };
test("appointment card carries only the whitelisted fields - no crew, invitees, notes or payout", () => {
  const out = sanitizeAppt(EV);
  assert.deepEqual(Object.keys(out).sort(), [...APPT_PUBLIC_FIELDS].sort());
  assert.equal(out.date, "2026-11-18");
  assert.doesNotMatch(JSON.stringify(out), /gate code|Sam|a@b\.c|400|payout|crew/);
  assert.equal(sanitizeAppt(null), null);
  assert.equal(sanitizeAppt({ title: "no date" }), null);
});
test("the appointment card appears only with a future appointment", () => {
  const now = new Date("2026-11-16T09:00:00").getTime();
  const future = pickUpcomingAppt([EV], now);
  assert.equal(portalBlocks({ appt: sanitizeAppt(future) }).appointment, true);
  const past = pickUpcomingAppt([{ ...EV, date: "2026-11-01" }], now);
  assert.equal(past, null);
  assert.equal(portalBlocks({ appt: sanitizeAppt(past) }).appointment, false);
});
test("page.jsx sanitizes through sanitizeAppt and keeps the finance gate around the computation", () => {
  const pg = read("app/project/[accessId]/page.jsx");
  assert.match(pg, /sanitizeAppt\(ev\)/);
  assert.doesNotMatch(pg, /notes:\s*ev\.notes/);
  const gate = pg.indexOf('can(initialView, "customer.financials.view")');
  const compute = pg.indexOf("getProjectFinancialState(p.access_id)");
  const ifMoney = pg.indexOf("maySeeMoney) {");
  assert.ok(gate > 0 && ifMoney > gate && compute > ifMoney, "finance computation must sit inside the maySeeMoney branch");
  assert.ok(pg.indexOf("customerPayments = paymentsSummary") > ifMoney);
});

// ---- balance / payments: only when real ------------------------------------------------------------
test("no contract -> no balance card and no payments list (never $0)", () => {
  const none = financeSummary(null);
  assert.equal(none.hasContract, false);
  const b = portalBlocks({ finance: none, payments: [{ id: 1, amount: 50 }] });
  assert.equal(b.balance, false);
  assert.equal(b.payments, false);
});
test("contract -> balance card; payments list only when a payment exists", () => {
  const fin = financeSummary({ total: 1000, paid: 0, balance: 1000, financialState: "awaiting_deposit", amountDueNow: 500 }, 500);
  assert.equal(portalBlocks({ finance: fin }).balance, true);
  assert.equal(portalBlocks({ finance: fin, payments: [] }).payments, false);
  assert.equal(portalBlocks({ finance: fin, payments: [{ id: 1, amount: 500 }] }).payments, true);
});

// ---- survey: saved rooms + cameras, read-only ------------------------------------------------------
const SAVED = JSON.stringify({ floors: [{ started: true, name: "Main", bg: "data:image/png;base64,AAAA", devices: [{ k: "cam", x: 10, y: 20, aim: 90, fov: 90, range: 40, name: "Front" }, { k: "cam", x: 60, y: 40 }] }] });
test("a saved survey is available to the customer and carries its cameras", () => {
  assert.equal(survey2HasData(SAVED), true);
  assert.equal(survey2CameraCount(SAVED), 2);
  const devs = surveyDevices(parseSurveyFloors(SAVED));
  assert.equal(devs.filter((d) => d.k === "cam").length, 2);
  assert.equal(portalBlocks({ ctx: { surveyHasData: survey2HasData(SAVED) } }).survey, true);
});
test("no survey, no section", () => {
  assert.equal(survey2HasData(JSON.stringify({ floors: [] })), false);
  assert.equal(survey2HasData(null), false);
  assert.equal(portalBlocks({ ctx: { surveyHasData: survey2HasData(null) } }).survey, false);
});
test("the survey overlay is the read-only planner plus the deck's own approval bar", () => {
  const ps = read("app/project/[accessId]/portal-survey.jsx");
  assert.match(ps, /<SiteSurveyWidget[^>]*customerView/);
  assert.match(ps, /<ToolApproveBar[^>]*role="customer"/);
  assert.match(read("app/project/[accessId]/gateway-client.jsx"), /<PortalSurvey /);
});

// ---- no internal data in a customer payload --------------------------------------------------------
test("customer finance carries no cost, margin, payout or processor ids", () => {
  const fin = financeSummary({ total: 1000, paid: 500, balance: 500, financialState: "partial", cost: 400, margin: 600, payout: 200, commission: 50, processorId: "sq_1", internalNotes: "x" }, 500);
  assert.doesNotMatch(JSON.stringify(fin), /cost|margin|payout|commission|processor|internal/i);
});
test("customer payments expose only whitelisted columns; void and zero rows are dropped", () => {
  const rows = [
    { id: 1, amount: 500, method: "Zelle", kind: "deposit", paid_at: "2026-11-01", status: "confirmed", recorded_by: "Ahmed", note: "internal: customer was rude", external_id: "sq_9", fee_amount: 25, photos: ["/api/media/abcdef123456"], created_at: "x" },
    { id: 2, amount: 100, status: "void", method: "Cash" },
    { id: 3, amount: 0, status: "confirmed" },
  ];
  const out = paymentsSummary(rows);
  assert.equal(out.length, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), [...PAYMENT_PUBLIC_FIELDS].sort());
  assert.doesNotMatch(JSON.stringify(out), /Ahmed|internal|sq_9|abcdef|fee/);
});

// ---- header: one component, role-correct actions, server-enforced edit ----------------------------
test("customer header: Navigate + Share only - add-person and edit are staff caps", () => {
  assert.equal(can("customer", "project.contact.edit"), false);
  assert.equal(can("customer", "project.contact.save"), false);
  assert.equal(can("vendor", "project.contact.edit"), false);
  for (const r of ["admin", "manager", "sales", "tech"]) assert.equal(can(r, "project.contact.edit"), true, r);
  const gw = read("app/project/[accessId]/gateway-client.jsx");
  assert.match(gw, /can\(cView, "project\.contact\.save"\) && \{ label: "Add to contact"/);
  assert.match(gw, /canEdit: can\(cView, "project\.contact\.edit"\)/);
  assert.doesNotMatch(gw, /canEdit: \["admin", "manager", "sales", "tech", "customer"\]/);
});
test("every server action that returns the payment ledger filters it by viewer", () => {
  const pa = read("app/project/[accessId]/proposal-actions.js");
  const fns = pa.split(/\nexport async function /).slice(1);
  const leaky = [];
  for (const f of fns) {
    const name = f.slice(0, f.indexOf("("));
    if (!/getProjectPayments\(|addProjectPayment\(|deleteProjectPayment\(/.test(f)) continue;
    const returnsLedger = /payments(: | \}|,)/.test(f.slice(f.lastIndexOf("return {")));
    const guarded = /paymentsForViewer\(|paymentsSummary\(|STAFF\.has\(tok\.role\)\) return|customer\.financials\.view/.test(f);
    if (returnsLedger && !guarded) leaky.push(name);
  }
  assert.deepEqual(leaky, []);
  for (const n of ["getApprovalDataAction", "getPaymentsForLogAction"]) {
    const f = pa.slice(pa.indexOf(`export async function ${n}`), pa.indexOf(`export async function ${n}`) + 900);
    assert.match(f, /paymentsForViewer\(/, n);
  }
  const ap = pa.slice(pa.indexOf("export async function getApprovalDataAction"), pa.indexOf("export async function getProjectAddonsAction"));
  assert.match(ap, /money \? getApprovedAddons/);
});
test("paymentsForViewer: tech gets nothing, customer a stripped ledger, office the whole thing", () => {
  const rows = [
    { id: 1, amount: 500, method: "Zelle", kind: "deposit", paid_at: "2026-11-01", status: "confirmed", source: "staff", recorded_by: "Ahmed", note: "internal", external_id: "sq_9", fee_amount: 25, photos: ["/api/media/aaaaaaaa"], created_at: "x" },
    { id: 2, amount: 300, method: "Check", kind: "partial", paid_at: "2026-11-02", status: "pending", source: "customer", recorded_by: "Pat Doe", note: "mailed it", photos: ["/api/media/bbbbbbbb"], created_at: "y" },
  ];
  assert.deepEqual(paymentsForViewer("tech", rows, false), []);
  const cust = paymentsForViewer("customer", rows, true);
  assert.doesNotMatch(JSON.stringify(cust[0]), /Ahmed|internal|sq_9|aaaaaaaa|fee/);
  assert.equal(cust[1].note, "mailed it");           // their own submission keeps what they wrote
  assert.equal(paymentsForViewer("admin", rows, true).length, 2);
  assert.equal(paymentsForViewer("admin", rows, true)[0].recorded_by, "Ahmed");
});
test("technicians get no dollar figures from the activity feed or live snapshot", () => {
  const pa = read("app/project/[accessId]/proposal-actions.js");
  const ev = pa.slice(pa.indexOf("export async function getEventsAction"), pa.indexOf("export async function logCallAction"));
  assert.match(ev, /customer\.financials\.view/);
  assert.match(ev, /!e\.money/, "filters on the structured marker, not a regex over text");
  assert.doesNotMatch(ev, /\$\s/);
  const snap = pa.slice(pa.indexOf("export async function getLiveSnapshotAction"), pa.indexOf("export async function getApprovalDataAction"));
  assert.match(snap, /paymentsCount: can\(tok\.role, "customer\.financials\.view"\)/);
});
test("the appointment sits outside the finance gate (a tech still sees the install card)", () => {
  const pg = read("app/project/[accessId]/page.jsx");
  const gateOpen = pg.indexOf("maySeeMoney) {");
  const gateClose = pg.indexOf("\n  }\n", gateOpen);
  const appt = pg.indexOf("sanitizeAppt(ev)");
  assert.ok(appt > gateClose, "appointment is computed after the finance block closes");
});
test("PortalBalance has no implicit ledger fetch and carries its own styles", () => {
  const b = read("app/project/[accessId]/portal-balance.jsx");
  assert.match(b, /if \(!staff \|\|/);
  assert.doesNotMatch(b, /✓|×/);
  assert.doesNotMatch(b, /#9a6a1a|#8a5a1f/);
  for (const sel of [".cpv-bal{", ".cpv-bal .cpv-balrows", ".cpv-bal .cpv-paid", ".cpv-bal .cpv-cta", ".cpv-bal .cpv-kick"]) assert.ok(b.includes(sel), sel);
  assert.match(read("app/project/[accessId]/staff-hub.jsx"), /<PortalBalance [^>]*\bstaff\b/);
  assert.doesNotMatch(read("app/project/[accessId]/customer-portal.jsx"), /<PortalBalance [^>]*\bstaff\b/);
});
test("customer finance refresh is capability-gated, not merely project-readable", () => {
  const pa = read("app/project/[accessId]/proposal-actions.js");
  const fn = pa.slice(pa.indexOf("export async function getCustomerFinanceAction"), pa.indexOf("export async function getProposalAction"));
  assert.match(fn, /can\(tok\?\.role, "customer\.financials\.view"\)/);
});
test("staff and customer render ONE header, balance and log component", () => {
  const sh = read("app/project/[accessId]/staff-hub.jsx");
  const cp = read("app/project/[accessId]/customer-portal.jsx");
  for (const [n, src] of [["staff-hub", sh], ["customer-portal", cp]]) {
    assert.match(src, /<PortalHeader /, n);
    assert.match(src, /<PortalLog /, n);
    assert.match(src, /<PortalBalance /, n);
    assert.doesNotMatch(src, /className="cpv-head/, `${n} must not hand-roll the header`);
    assert.doesNotMatch(src, /cpv-brand|cpv-proj/, n);
  }
  assert.doesNotMatch(cp, /Job Site|ASC\d/);
});

// ---- the staff rail and the customer card read the SAME step and percent ---------------------------
import { buildMyProjectCard } from "../lib/my-projects-card.js";
import { threeStepForState } from "../lib/staff-hub.js";
import { masterToPhaseKey } from "../lib/spec.js";

// The exact owner complaint: the stored stage column lags the real state ("Consulting") while the facts say
// the proposal is signed and the install is booked. Staff path = what gateway-client computes (state from
// resolveProjectStatus -> threeStepForState, percent from progressFromFacts); customer path = the card model.
test("same project, same step and percent through the staff rail and the customer card - even with a stale stored stage", () => {
  const events = [{ date: "2099-01-05", time: "10:00", kind: "install", title: "Installation" }];
  const facts = { proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, survey_skipped: true, install_confirmed: true };
  for (const stored of ["proposal", "site_survey", "approval_deposit", "schedule"]) {
    const project = { access_id: "ASC9999", stage: stored, customer: "T", project_type: "A" };
    const card = buildMyProjectCard({ project, facts, events, fin: null, now: new Date("2026-11-16T09:00:00").getTime() });
    // staff path
    const resolverFacts = { survey_required: false, survey_skipped: true, deposit_required: true, proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, install_date: "2099-01-05", install_confirmed: true };
    const state = resolveProjectStatus(resolverFacts, stored);
    const rail = threeStepForState(state, masterToPhaseKey(stored));
    const pct = progressFromFacts({ resolverFacts, sFacts: facts, custFacts: facts, hasInstallAppt: true, completed: false, finance: null });
    assert.equal(card.state, state, stored);
    assert.equal(card.step.key, rail.currentKey, `step for stored stage ${stored}`);
    assert.equal(card.pct, pct, `percent for stored stage ${stored}`);
    assert.equal(rail.currentKey, "install");    // never "consulting" for a signed, scheduled project
  }
});
test("the staff rail derives from state, not the stored stage", () => {
  const gw = read("app/project/[accessId]/gateway-client.jsx");
  assert.match(gw, /rail3 = projState \? threeStepForState\(projState, masterToPhaseKey\(projectStage\)\)/);
  assert.match(gw, /phases=\{rail3\.phases\}/);
  assert.match(gw, /const simple3 = rail3;/);
  // no stored-stage fallback: before the facts load the rail is not drawn (it would flash the stale step)
  assert.equal((gw.match(/threeStepPhases\(masterToPhaseKey\(projectStage\)\)/g) || []).length, 0);
  assert.match(gw, /\{ phases: \[\], currentKey: null \}/);
  assert.match(gw, /closed_not_completed: !!lp\.lost_at/);
  assert.doesNotMatch(gw, /lp\.closed_at/);
});
