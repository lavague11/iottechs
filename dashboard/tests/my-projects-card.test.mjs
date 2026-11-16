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
  assert.deepEqual(Object.keys(c).sort(), ["access_id", "actionable", "address", "appt", "category", "customer_pin", "kind", "pct", "service", "state", "status", "step", "steps", "title", "todo"]);
  assert.deepEqual(Object.keys(c.actionable).sort(), ["payment", "proposal", "survey"], "the gate is three booleans, nothing more");
  for (const v of Object.values(c.actionable)) assert.equal(typeof v, "boolean");
});

test("page uses the canonical-ownership query and the card builder, not the raw stage", () => {
  const page = readFileSync(new URL("../app/my-projects/page.jsx", import.meta.url), "utf8");
  assert.ok(page.includes("getOwnedProjectsForCustomer"));
  assert.ok(page.includes("buildMyProjectCard"));
  assert.ok(!page.includes("getProjectsByContactEmail"));
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.ok(/export function getOwnedProjectsForCustomer[\s\S]*customerOwnsProjectAccount/.test(db));
});

// ---- O·166: the card's action is the thing the project is waiting on, linked straight at it -------
import { projectCardAction } from "../lib/my-projects-card.js";

// money the portal would agree is collectible — payable() needs hasContract AND amountDueNow > 0
// through the REAL financeSummary, exactly as page.jsx builds it — payable() needs hasContract too
const DUE = financeSummary({ total: 9000, paid: 0, balance: 9000, amountDueNow: 2700, financialState: "awaiting_deposit" }, 2700);
const actCard = (over = {}, facts = {}, fin = null) =>
  buildMyProjectCard({ project: { ...proj, ...over }, facts: { ...baseFacts, ...facts }, fin, now: Date.parse("2026-11-16T12:00:00") });
const act = (over = {}, facts = {}, fin = null) => projectCardAction(actCard(over, facts, fin));

test("the card CTA is Approve / Review / Sign / Pay, each deep-linked to the gateway tool", () => {
  // survey awaiting the customer's approval
  assert.deepEqual(act({ stage: "site_survey" }, { stage: "site_survey", survey_accepted: false }),
    { label: "Approve", href: "/project/ASC0001?open=site_survey" });
  // proposal sent, not yet accepted
  assert.deepEqual(act({}, { proposal_status: "sent" }),
    { label: "Review", href: "/project/ASC0001?open=proposal" });
  // accepted but unsigned. NOTE: no &sign= — see the signer test below for why.
  assert.deepEqual(act({ stage: "approval_deposit" }, { stage: "approval_deposit", proposal_status: "accepted", proposal_signed: false }),
    { label: "Sign", href: "/project/ASC0001?open=proposal" });
  // signed, deposit outstanding
  assert.deepEqual(act({ stage: "approval_deposit" }, { stage: "approval_deposit", proposal_status: "accepted", proposal_signed: true, deposit_recorded: false }, DUE),
    { label: "Pay", href: "/project/ASC0001?open=deposit" });
  // final balance
  assert.deepEqual(act({ stage: "payment" }, { stage: "payment", proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, install_done: true, final_balance_paid: false }, DUE),
    { label: "Pay", href: "/project/ASC0001?open=payment" });
});

// The defect this guard exists for: stageFloorFacts invents proposal_status="accepted" from the stored
// stage alone, so a project parked at approval_deposit with NO proposal resolved to AWAITING_SIGNATURE
// and the card offered "Sign" — on a link the portal drops, landing the customer on the portal home.
// 9 of 41 action-bearing cards in the local database did this.
test("a CTA is never offered for something that does not exist", () => {
  const bare = { access_id: "BSC02E8", stage: "approval_deposit", customer: "X", company_name: null };
  const c = buildMyProjectCard({ project: bare, facts: { stage: "approval_deposit" }, now: Date.parse("2026-11-16T12:00:00") });
  assert.equal(c.status.label, "Needs action", "the floored STATUS may still say so");
  assert.equal(c.actionable.proposal, false, "but no proposal was ever published");
  assert.deepEqual(projectCardAction(c), { label: "Open", href: "/project/BSC02E8" }, "so the card promises nothing");

  // Pay is gated on the portal's own payable(), not on the stage
  const noMoney = act({ stage: "approval_deposit" }, { stage: "approval_deposit", proposal_status: "accepted", proposal_signed: true, deposit_recorded: false }, null);
  assert.equal(noMoney.label, "Open", "nothing collectible → no Pay button");
  // Approve is gated on something actually being submitted
  const noSurvey = act({ stage: "site_survey" }, { stage: "site_survey", survey_accepted: false, survey_submitted: false });
  assert.equal(noSurvey.label, "Open", "nothing submitted → nothing to approve");
  // a card built without the gate makes no promise at all
  assert.equal(projectCardAction({ access_id: "X", todo: { order: 3 } }).label, "Open");
});

test("completed outranks a stale obligation — a finished project reads View", () => {
  // stored stage lagged at site_survey while the job is finished and paid
  const c = actCard({ stage: "site_survey" }, { stage: "site_survey", survey_accepted: false, install_done: true,
    final_balance_paid: true, completion_docs: true, proposal_status: "accepted", proposal_signed: true, deposit_recorded: true });
  assert.equal(c.status.key, "done");
  assert.deepEqual(projectCardAction(c), { label: "View", href: "/project/ASC0001" });
});

test("Sign does NOT pass ?sign= — the card does not know which option to sign", () => {
  const sign = act({ stage: "approval_deposit" }, { stage: "approval_deposit", proposal_status: "accepted", proposal_signed: false });
  assert.doesNotMatch(sign.href, /[?&]sign=/, "no sign param");
  // The original reason was B12 — the signer refused ?sign= in exactly the accepted-but-unsigned state
  // this CTA is shown for. That is now FIXED (the guard tests the signature, see tests/sign-request).
  // The param still is not passed for a second reason: ?sign= takes an OPTION key, and the card payload
  // carries no option ids. `sign=1` only resolves on a single-option proposal and would show a
  // "pick an option" toast on any other. Landing on the proposal always works, so it stays that way
  // until the accepted option id is something the card is given.
  const pcv = readFileSync(new URL("../app/project/[accessId]/proposal-customer-view.jsx", import.meta.url), "utf8");
  assert.match(pcv, /const optionSigned = !!p\.signed_name && accepted\.has\(match\?\.id\)/, "B12 stays fixed");
});

test("every CTA target is a deep link the gateway actually understands", () => {
  const gw = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
  const names = gw.slice(gw.indexOf("const OPEN_TOOL_NAMES"), gw.indexOf("\n", gw.indexOf("const OPEN_TOOL_NAMES")));
  for (const open of ["site_survey", "proposal", "deposit", "payment"])
    assert.ok(new RegExp(`\\b${open}:`).test(names), `the gateway maps ?open=${open}`);
  assert.match(gw, /searchParams\?\.get\("sign"\)/, "the gateway still reads ?sign");
});

test("nothing owed: Completed reads View, otherwise Open", () => {
  const done = { proposal_status: "accepted", proposal_signed: true, deposit_recorded: true, install_done: true, final_balance_paid: true, completion_docs: true };
  assert.deepEqual(act({ stage: "complete" }, { ...done, stage: "complete" }), { label: "View", href: "/project/ASC0001" });
  // no todo, no appointment
  const idle = projectCardAction({ access_id: "ASC0001", status: { key: "progress" }, todo: null, appt: null });
  assert.deepEqual(idle, { label: "Open", href: "/project/ASC0001" });
});

test("Reschedule rides alongside Open only when the page minted a token", () => {
  const appt = { date: "Nov 18", time: "10:00 AM", kind: "Install" };
  const withTok = projectCardAction({ access_id: "ASC0001", status: { key: "progress" }, appt: { ...appt, rescheduleToken: "abc.def" } });
  assert.equal(withTok.label, "Open");
  assert.deepEqual(withTok.secondary, { label: "Reschedule", href: "/appt/abc.def" });
  // no token → no link at all, rather than one that goes nowhere
  assert.equal(projectCardAction({ access_id: "ASC0001", status: { key: "progress" }, appt }).secondary, undefined);
});

test("an obligation outranks an appointment — you are told to pay, not to open", () => {
  const c = actCard({ stage: "approval_deposit" }, { stage: "approval_deposit", proposal_status: "accepted", proposal_signed: true, deposit_recorded: false }, DUE);
  c.appt = { date: "Nov 18", time: "10:00 AM", kind: "Install", rescheduleToken: "t" };
  assert.equal(projectCardAction(c).label, "Pay");
  assert.equal(projectCardAction(c).secondary, undefined);
});

test("the card body opens the project, without stealing clicks from the controls inside it", () => {
  const src = readFileSync(new URL("../app/my-projects/my-projects-client.jsx", import.meta.url), "utf8");
  assert.match(src, /className="cp-proj clickable"/, "the project card is a click target");
  assert.match(src, /e\.target\.closest\("a,button,input,select,textarea,\[role='button'\]"\)\) return;/,
    "a click on a link or control inside the card is left to that control");
  assert.match(src, /cardRouter\.push\(`\/project\/\$\{p\.access_id\}`\)/, "otherwise it opens the project");
  assert.match(src, /<h4><Link href=\{`\/project\/\$\{p\.access_id\}`\}>/, "and the title is a real anchor for keyboard users");
});

test("the card's appointment is display-only; the event id leaves solely inside a signed token", () => {
  const ev = [{ id: 77, date: "2026-11-18", time: "10:00", kind: "install", title: "Installation" }];
  assert.deepEqual(Object.keys(nextAppointment(ev, Date.parse("2026-11-16T12:00:00"))).sort(), ["date", "kind", "time"],
    "the card's appointment carries display fields only — no event id to forget to strip");
  const page = readFileSync(new URL("../app/my-projects/page.jsx", import.meta.url), "utf8");
  assert.match(page, /const apptEventId = new Map\(\)/, "ids are held beside the cards, never on them");
  assert.match(page, /makeApptToken\(c\.access_id, id\)/, "and only ever leave as a signed token");
  // The token is SIGNED, not opaque — it decodes to {a,e}. The comment beside it must not claim secrecy,
  // because the next person to read it will reason about what may safely go in one.
  assert.doesNotMatch(page, /raw event id never reaches the browser/, "no secrecy claim about a signed token");
});

// ---- O·165: the projects come before the offer to start another one ------------------------------
test("page order: required actions, then My Projects, then the quick actions, rendered smaller", () => {
  const src = readFileSync(new URL("../app/my-projects/my-projects-client.jsx", import.meta.url), "utf8");
  const at = (s) => { const i = src.indexOf(s); assert.ok(i > 0, `missing: ${s}`); return i; };
  const banner = at("cp-req-actions"), projects = at("{/* MY PROJECTS */}"), quick = at("{/* QUICK ACTIONS");
  assert.ok(banner < projects, "the action banner stays at the top");
  assert.ok(projects < quick, "My Projects comes before the quick actions");
  assert.ok(at("{/* MY SERVICE CALLS") < quick, "the quick actions sit under the service calls too");
  assert.match(src, /cp-section cp-section-quiet/, "the quick-action section is the quiet variant");
  assert.match(src, /\.cp-section-quiet \.cp-sec-head h2\{font-size:1\.05rem/, "its heading is smaller than a section head");
});
