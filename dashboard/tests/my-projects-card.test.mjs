// Section N — /my-projects cards recompute stage/status/percent/appointment from real facts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMyProjectCard, nextAppointment } from "../lib/my-projects-card.js";
import { financeSummary } from "../lib/customer-portal.js";
import { simpleProgressPct, threeStepForState } from "../lib/staff-hub.js";

const proj = { access_id: "ASC0001", customer: "Pizza Bay", company_name: null, address: "12 Main St, Little Ferry, NJ", service: "Security Cameras", service_code: "CCTV", project_type: "A", stage: "proposal", category: "open", status: "Proposal", customer_pin: "1234", date: "2026-09-18",
  // internal columns that must never reach the customer
  sales_rep: "Dana", commission: 120, value: 9000, tech: "Lee", tech_pin: "9999", contact_message: "internal" };
const baseFacts = { stage: "proposal", survey_accepted: true, survey_submitted: true, proposal_status: "sent", proposal_signed: false, deposit_submitted: false, deposit_recorded: false, final_balance_paid: false, install_done: false, install_confirmed: false, completion_docs: false };
const card = (over = {}, facts = {}) => buildMyProjectCard({ project: { ...proj, ...over }, facts: { ...baseFacts, ...facts }, now: Date.parse("2026-11-16T12:00:00") });

test("Pizza Bay: stored stage 'proposal' but signed resolves to Install, not Needs review", () => {
  const c = card({}, { proposal_status: "accepted", proposal_signed: true, deposit_submitted: true, deposit_recorded: true });
  assert.equal(c.step.key, "install");
  assert.equal(c.step.label, "Install");
  assert.equal(c.step.total, 3);
  assert.notEqual(c.status.label, "Needs action");
  assert.equal(c.status.key, "progress");
});

test("unsigned sent proposal still needs the customer's action, in the Consulting step", () => {
  const c = card();
  assert.equal(c.step.key, "consulting");
  assert.equal(c.status.key, "action");
  assert.equal(c.status.label, "Needs action");
  assert.ok(c.todo);
});

test("percent equals simpleProgressPct for the same facts (customer = staff)", () => {
  const c = card({}, { proposal_status: "accepted", proposal_signed: true, deposit_submitted: true, deposit_recorded: true });
  assert.equal(c.pct, simpleProgressPct({ proposalSent: true, signed: true, scheduled: false, installDone: false, qcDone: false, completed: false, balanceOwed: false, surveyDone: true, mockupDone: false, proposalStarted: false }));
  assert.equal(c.pct, 45);
});

test("upcoming install appointment is shown, customer-safe fields only", () => {
  const events = [
    { date: "2026-11-13", time: "09:00", kind: "install", title: "Install" },
    { date: "2026-11-18", time: "14:30", kind: "install", title: "Install", notes: "gate code 4411", invited: ["a@b.c"], changeRequests: [{ x: 1 }] },
  ];
  const a = nextAppointment(events, Date.parse("2026-11-16T12:00:00"));
  assert.deepEqual(a, { date: "Nov 18", time: "2:30 PM", kind: "Install" });
  const c = buildMyProjectCard({ project: proj, facts: { ...baseFacts, proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, deposit_submitted: true }, events, now: Date.parse("2026-11-16T12:00:00") });
  assert.equal(c.appt.date, "Nov 18");
  assert.equal(c.state, "INSTALL_SCHEDULED");
  assert.equal(c.pct, 50);
  assert.ok(!JSON.stringify(c).includes("gate code"));
});

test("no appointment -> null", () => assert.equal(card().appt, null));

test("deposit: Pay prompt stays when nothing is paid AND with a pending row (abandoned checkout) - pending is informational", () => {
  const signed = { stage: "approval_deposit", proposal_status: "accepted", proposal_signed: true };
  const none = card({ stage: "approval_deposit" }, signed);
  assert.equal(none.status.key, "action");
  assert.equal(none.todo.cta, "Pay deposit");
  assert.ok(!/pending/.test(none.status.detail));
  const pending = card({ stage: "approval_deposit" }, { ...signed, deposit_submitted: true, deposit_recorded: false });
  assert.equal(pending.todo.cta, "Pay deposit", "a customer must never be unable to pay");
  assert.equal(pending.status.key, "action");
  assert.match(pending.status.detail, /pending/);
  const paid = card({ stage: "approval_deposit" }, { ...signed, deposit_submitted: true, deposit_recorded: true });
  assert.equal(paid.todo, null);
});

test("final payment: pending flows through the REAL financeSummary and Pay stays visible", () => {
  const raw = { total: 1000, paid: 500, balance: 500, amountDueNow: 500, financialState: "balance_due" };
  const fin = financeSummary({ ...raw, pendingPayments: 500 });
  assert.equal(fin.pendingPayments, 500);
  const f = { stage: "payment", proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, deposit_submitted: true, install_done: true };
  const mk = (fn) => buildMyProjectCard({ project: { ...proj, stage: "payment" }, facts: { ...baseFacts, ...f }, fin: fn, now: Date.parse("2026-11-16T12:00:00") });
  const c = mk(fin);
  assert.equal(c.status.key, "action");
  assert.match(c.status.detail, /pending/);
  assert.equal(c.todo.cta, "Pay balance");
  assert.ok(!/pending/.test(mk(financeSummary(raw)).status.detail));
  assert.equal(financeSummary(null).pendingPayments, 0);
});

test("step and percent agree even when the stored stage lies (stored install, unsigned)", () => {
  // Both step and percent read the SAME stage-floored facts (as the staff gateway does): a project stored at
  // install is floored to signed, so Install step + 45% - never an Install step beside a Consulting bar.
  const c = card({ stage: "install" }, { stage: "install", proposal_status: "sent", proposal_signed: false });
  assert.equal(c.step.key, "install");
  assert.equal(c.pct, 45);
  const early = card({ stage: "proposal" }, { proposal_status: "sent", proposal_signed: false });
  assert.equal(early.step.key, "consulting");
  assert.equal(early.pct, 33);
  const s = buildMyProjectCard({ project: { ...proj, stage: "proposal" }, facts: { ...baseFacts, proposal_status: "accepted", proposal_signed: true, deposit_submitted: true, deposit_recorded: true, install_confirmed: true }, now: 0 });
  assert.equal(s.step.key, "install");
  assert.equal(s.pct, 50);
});

test("threeStepForState maps state alone", () => {
  const k = (st) => threeStepForState(st).currentKey;
  for (const st of ["INTAKE", "BUILD_SURVEY", "AWAITING_SIGNATURE", "AWAITING_DEPOSIT"]) assert.equal(k(st), "consulting");
  for (const st of ["READY_TO_SCHEDULE", "INSTALL_SCHEDULED", "INSTALL_IN_PROGRESS"]) assert.equal(k(st), "install");
  for (const st of ["AWAITING_FINAL_PAYMENT", "COMPLETE"]) assert.equal(k(st), "completion");
  assert.equal(threeStepForState("CLOSED_NOT_COMPLETED", "ph_install").currentKey, "install");
});

test("stylesheet has no NUL byte and the status separator escape is intact", () => {
  const buf = readFileSync(new URL("../app/my-projects/my-projects-client.jsx", import.meta.url));
  assert.ok(!buf.includes(0), "NUL byte in my-projects-client.jsx");
  assert.ok(buf.toString().includes('content:"' + String.fromCharCode(92, 92) + '00b7"'));
});

test("completed and closed states", () => {
  const done = card({ stage: "completion", completed_at: "2026-10-01" }, { stage: "completion", proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, deposit_submitted: true, install_done: true, completion_docs: true, final_balance_paid: true });
  assert.equal(done.status.key, "done");
  assert.equal(done.status.label, "Completed");
  const closed = card({ lost_at: "2026-10-01" });
  assert.equal(closed.status.key, "closed");
  assert.equal(closed.pct, null);
  assert.equal(closed.status.color, null);
});

test("title is the business name; service is separate", () => {
  assert.equal(card().title, "Pizza Bay");
  assert.equal(card({ company_name: "Pizza Bay LLC" }).title, "Pizza Bay LLC");
  assert.equal(card().service, "Security Cameras");
});

test("card payload carries no internal fields", () => {
  const c = card({}, { proposal_status: "accepted", proposal_signed: true });
  const json = JSON.stringify(c);
  for (const k of ["sales_rep", "commission", "tech_pin", "contact_message", "\"value\"", "\"tech\"", "Dana", "Lee", "9999", "internal"]) assert.ok(!json.includes(k), `leaked ${k}`);
  assert.deepEqual(Object.keys(c).sort(), ["access_id", "address", "appt", "category", "customer_pin", "kind", "pct", "service", "state", "status", "step", "steps", "title", "todo"]);
});

test("page uses the canonical-ownership query and the card builder, not the raw stage", () => {
  const page = readFileSync(new URL("../app/my-projects/page.jsx", import.meta.url), "utf8");
  assert.ok(page.includes("getOwnedProjectsForCustomer"));
  assert.ok(page.includes("buildMyProjectCard"));
  assert.ok(!page.includes("getProjectsByContactEmail"));
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.ok(/export function getOwnedProjectsForCustomer[\s\S]*customerOwnsProjectAccount/.test(db));
});
