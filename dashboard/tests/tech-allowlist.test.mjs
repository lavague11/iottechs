// WHAT A TECHNICIAN MAY DO — and the proof that everything else is refused on the SERVER.
//
// The owner's rule: a tech views the work order, does it, runs QC, adds expenses, adds the activation
// QR, READS the site survey, sees their own job budget and downloads the work order PDF. Nothing else,
// "hidden in the UI AND refused on the server… a server-side allow-list for the tech role (deny by
// default), not per-button hiding."
//
// The shape of the proof matters. A test that lists the actions a tech is refused would rot the moment
// someone adds a new one. These tests assert the DEFAULT instead: every action resolves its caller
// through one of three choke points, each choke point fences a technician by name, and an action that
// names nothing is closed. Adding an action next year is therefore closed to the field until someone
// opens it on purpose — the failure mode of forgetting is a refusal, not a leak.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { can, ROLE_KEYS } from "../lib/roles.js";
import { TECH_ALLOW, techAllows, fenceTok, DENIED_ROLE, techJobBudget, techStatusOf, techWorkOrderCard, paidPerJob } from "../lib/tech-scope.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const actions = read("../app/project/[accessId]/actions.js");
const proposal = read("../app/project/[accessId]/proposal-actions.js");
const woActions = read("../app/project/[accessId]/work-order-actions.js");
const toolRoute = read("../app/api/tool-data/route.js");

// ──────────────────────────────────────────────────────────────── deny by default

test("an action that names nothing turns a tech into the denied sentinel", () => {
  const tech = { role: "tech", id: 7, name: "Field Person" };
  assert.equal(fenceTok(tech, undefined).role, DENIED_ROLE, "no action key at all → denied");
  assert.equal(fenceTok(tech, "someActionNobodyOpened").role, DENIED_ROLE, "an unlisted action → denied");
  assert.equal(fenceTok(tech, "getWorkOrderAction").role, "tech", "a listed action → the real token");
  // The fence keeps the rest of the token, so a logged refusal still says who was turned away.
  assert.equal(fenceTok(tech, "nope").deniedRole, "tech");
  assert.equal(fenceTok(tech, "nope").id, 7);
});

test("no other role is touched by the fence", () => {
  for (const role of ROLE_KEYS.filter((r) => r !== "tech")) {
    assert.equal(fenceTok({ role }, undefined).role, role, `${role} passes through untouched`);
  }
  assert.equal(fenceTok(null, undefined), null, "and no session stays no session");
});

test("the denied sentinel fails every capability check, which is the point of using a role string", () => {
  // It is NOT null. Several actions fall back to `tok?.role || "customer"` when there is no token, and
  // a customer may see the customer's money — so returning null to a blocked tech would have handed
  // them the payment ledger through the back door. "denied" is in no list anywhere.
  assert.ok(!ROLE_KEYS.includes(DENIED_ROLE), "it is not a real role");
  for (const cap of ["customer.financials.view", "cost.view", "survey.edit", "wo.edit", "wo.view", "stage.move", "proposal.revise"]) {
    assert.equal(can(DENIED_ROLE, cap), false, `denied must fail ${cap}`);
  }
  // …and the two fallbacks it was built for still exist, so this is guarding something real.
  assert.match(proposal, /const role = tok\?\.role \|\| "customer";/, "the fallback this protects");
});

// ──────────────────────────────────────────────────────────────── the choke points

test("all three choke points apply the fence", () => {
  // actions.js — both helpers, because getAnyTok falls through to the PIN cookie.
  assert.match(actions, /async function getSessionTok\(actionKey\)/);
  assert.match(actions, /async function getAnyTok\(actionKey\)/);
  assert.match(actions, /return fenceTok\(withFreshRole\(await parseToken\(raw\.trim\(\)\)\), actionKey\)/, "session path fenced");
  assert.match(actions, /fenceTok\(\{ role: at\.role, accessId: at\.accessId, viaPin: true \}, actionKey\)/, "PIN path fenced too");
  // proposal-actions.js
  assert.match(proposal, /async function getSessionRole\(actionKey\)/);
  assert.match(proposal, /return fenceTok\(tok, actionKey\)/, "session path fenced");
  assert.match(proposal, /return fenceTok\(\{ role: at\.role, accessId: at\.accessId, viaPin: true \}, actionKey\)/, "PIN path fenced too");
  // work-order-actions.js — one gate() for every call in the file.
  assert.match(woActions, /async function gate\(accessId, cap, actionKey\)/);
  assert.match(woActions, /const tok = fenceTok\(await getSessionRole\(\), actionKey\)/);
  assert.match(woActions, /if \(tok\.role === DENIED_ROLE\) return \{ error: "A technician cannot do that\." \}/);
});

test("the money actions name nothing, so a tech never reaches them", () => {
  // Spot-check the ones the owner named: payments, invoices, pricing, reassignment, customer edits,
  // and creating a work order. Each must resolve its token with NO action key.
  const mustBeUnnamed = {
    [proposal]: ["recordPaymentAction", "deletePaymentAction", "confirmPaymentAction", "sendInvoiceAction",
      "saveProposalDraftAction", "sendProposalAction", "getPaymentsForLogAction", "getCustomerFinanceAction",
      "getApprovalDataAction", "createWorkOrderAction", "finalizeWorkOrderAction", "submitToolAction",
      "getNotesAction", "addNoteAction", "saveTechPricingAction", "reviseProposalAction"],
    [actions]: ["updateProjectInfoAction", "addAssignmentAction", "removeAssignmentAction", "setStage",
      "setCommissionAction", "setPayoutAction", "payExpenseAction", "submitWorkOrderAction",
      "closeProjectAction", "setInternalJobAction"],
  };
  for (const [src, names] of Object.entries(mustBeUnnamed)) {
    const text = src;
    for (const name of names) {
      const i = text.indexOf(`export async function ${name}(`);
      assert.ok(i > 0, `${name} exists`);
      const body = text.slice(i, text.indexOf("\nexport ", i + 10));
      const call = body.match(/await (getSessionRole|getAnyTok|getSessionTok|issueTok)\(([^)]*)\)/);
      assert.ok(call, `${name} resolves a token through a choke point`);
      assert.ok(!/"[A-Za-z]+Action"|"setStage"/.test(call[2]), `${name} must NOT name itself to the allow-list`);
      assert.ok(!TECH_ALLOW.has(name), `${name} must not be on the allow-list`);
    }
  }
});

test("every name on the allow-list is a real action that names itself", () => {
  const all = actions + proposal + woActions;
  for (const name of TECH_ALLOW) {
    assert.ok(all.includes(`export async function ${name}(`), `${name} is a real exported action`);
    assert.ok(all.includes(`"${name}"`), `${name} passes its own name at the choke point`);
  }
});

test("the allow-list is exactly the owner's list and nothing has crept in", () => {
  // Any addition is a deliberate act that has to come through this assertion.
  assert.deepEqual([...TECH_ALLOW].sort(), [
    "acceptStageAction", "acceptWorkOrderAction", "addLinePhotoAction", "checkInAction", "endDayAction",
    "getAcceptancesAction", "getEventsAction", "getProposalAction", "getRatesAction", "getToolDataAction",
    "getWorkOrderAction", "getWorkOrderEventsAction", "listInstallIssuesAction", "listInstallPhotosAction",
    "proposalLayoutMetaAction", "removeLinePhotoAction", "reportInstallIssueAction", "saveToolDataAction",
    "setLineStatusAction", "setSystemQrAction", "signWorkOrderAction", "submitExpenseAction",
    "syncFieldQueueAction", "techAdvanceStageAction",
  ]);
  assert.equal(techAllows(""), false);
  assert.equal(techAllows(null), false);
});

// ──────────────────────────────────────────────────────────────── the survey is read-only

test("a tech may READ the survey and may not write it, on BOTH write paths", () => {
  assert.equal(can("tech", "survey.edit"), false, "the capability itself");
  assert.equal(can("tech", "survey.unlock"), false);
  assert.equal(can("tech", "survey.submit"), false);
  // Neither write path hard-codes a role list for the survey — both ask the capability, so removing
  // the tech from it closes both at once.
  assert.match(toolRoute, /tool === "survey2" \|\| tool === "survey"\s*\n?\s*\?\s*can\(tok\.role, "survey\.edit"\)/);
  assert.match(proposal, /tool === "survey" \|\| tool === "survey2" \? ROLE_KEYS\.filter\(\(r\) => can\(r, "survey\.edit"\)\)/);
  // saveToolDataAction IS on the allow-list, because the install checklist and QC are tool blobs too —
  // which is exactly why the per-tool gate above has to be the thing that stops a survey write.
  assert.ok(TECH_ALLOW.has("saveToolDataAction"));
  const editors = proposal.slice(proposal.indexOf("const editors ="), proposal.indexOf("if (!editors.includes"));
  assert.match(editors, /tool === "install" \? \["admin", "manager", "tech"\]/, "the checklist is still theirs");
  assert.match(editors, /tool === "qc" \? \["admin", "manager", "tech"\]/, "and so is QC");
});

test("a tech still SEES the survey — reading it is the whole point of the read-only rule", () => {
  const deck = read("../lib/deck-tools.js");
  assert.match(deck, /\{ name: "Site Survey",\s+access: \{[^}]*tech: "view"/, "the survey card is view for a tech");
  assert.ok(TECH_ALLOW.has("getToolDataAction"), "and they can load the blob to render it");
});

// ──────────────────────────────────────────────────────────────── no customer money in a tech payload

test("the figures are never computed for a tech, let alone sent", () => {
  const page = read("../app/project/[accessId]/page.jsx");
  assert.equal(can("tech", "customer.financials.view"), false);
  assert.equal(can("tech", "cost.view"), false);
  assert.match(page, /const maySeeMoney = can\(initialView, "customer\.financials\.view"\);/);
  assert.match(page, /if \(\(customerPortalV2 \|\| staffHub\) && maySeeMoney\) \{/);
});

test("the proposal a tech receives is the payout-only work order, never the customer's", () => {
  const lib = read("../lib/proposal.js");
  // sanitizeProposal's tech branch returns techWorkOrder(payload), which deletes price and cost off
  // every line and sub-line and keeps techPrice alone.
  assert.match(lib, /const toTech = \(\{ price, cost, techPrice, sub, \.\.\.it \}\) => \(\{/);
  assert.match(lib, /sub: sub\.map\(\(\{ price: p, cost: c, techPrice: tp, \.\.\.x \}\) => \(\{ \.\.\.x, techPrice: \+tp \|\| 0 \}\)\)/);
  // and no discount/tax rides along either
  assert.match(lib, /discount: \{ type: "flat", value: 0 \}/);
});

// ──────────────────────────────────────────────────────────────── the job budget

test("a budget shows only for a per-job tech with a real payout", () => {
  const base = { payoutTotal: 900, expenses: [], techId: 1 };
  assert.equal(techJobBudget({ ...base, payType: "per_job" }).show, true);
  assert.equal(techJobBudget({ ...base, payType: "hourly" }).show, false, "hourly: nothing");
  assert.equal(techJobBudget({ ...base, payType: "salary" }).show, false, "salaried: nothing");
  assert.equal(techJobBudget({ ...base, payType: "hourly" }).reason, "not-per-job");
  // No budget set, or payouts hidden for this job (sanitizeWorkOrderDoc nulls the total) → nothing.
  assert.equal(techJobBudget({ ...base, payType: "per_job", payoutTotal: null }).show, false);
  assert.equal(techJobBudget({ ...base, payType: "per_job", payoutTotal: 0 }).show, false);
  assert.equal(techJobBudget({ ...base, payType: "per_job", payoutTotal: null }).reason, "no-budget");
  // Never a $0 card: show === false carries no figures at all.
  assert.equal(techJobBudget({ ...base, payType: "hourly" }).budget, undefined);
  assert.equal(paidPerJob(undefined), true, "the default pay setup is per job, so nobody loses a payout they see today");
});

test("the budget counts THIS tech's expenses and nobody else's", () => {
  const expenses = [
    { submitted_by_id: 1, amount: 120.5, status: "pending" },
    { submitted_by_id: 1, amount: 80, status: "paid" },
    { submitted_by_id: 2, amount: 500, status: "paid" },      // a crewmate's — not theirs
    { submitted_by_id: 1, amount: 300, status: "declined" },  // refused by the office — not money out
  ];
  const b = techJobBudget({ payType: "per_job", payoutTotal: 900, expenses, techId: 1 });
  assert.equal(b.budget, 900);
  assert.equal(b.spent, 200.5, "120.50 + 80 — not the crewmate's 500, not the declined 300");
  assert.equal(b.remaining, 699.5);
  assert.equal(b.count, 2);
  assert.equal(b.pending, 1);
});

test("an overspent job reads negative rather than being clamped to a comfortable zero", () => {
  const b = techJobBudget({ payType: "per_job", payoutTotal: 300, techId: 1, expenses: [{ submitted_by_id: 1, amount: 420, status: "paid" }] });
  assert.equal(b.remaining, -120);
});

// ──────────────────────────────────────────────────────────────── the tech's own status ladder

test("the tech ladder never mentions money, and ends at Job complete", () => {
  assert.equal(techStatusOf({}), "AWAITING_WORK_ORDER");
  assert.equal(techStatusOf({ woExists: true }), "WORK_ORDER_READY");
  assert.equal(techStatusOf({ woExists: true, woAccepted: true }), "WORK_IN_PROGRESS");
  assert.equal(techStatusOf({ woExists: true, started: true }), "WORK_IN_PROGRESS");
  assert.equal(techStatusOf({ woExists: true, woAccepted: true, installDone: true }), "QC");
  assert.equal(techStatusOf({ woExists: true, woAccepted: true, installDone: true, qcSigned: true }), "JOB_COMPLETE");
  // A closed-out job routinely carries qc_customer_signed and completed_at while install_done was
  // never stamped (seeded and legacy rows both do it). Either finishing fact ends the tech's job —
  // requiring all three told a technician their finished work was still in progress. Caught live on
  // ASC0129, which reads 3 of 3 lines complete at the completion stage.
  assert.equal(techStatusOf({ woExists: true, woAccepted: true, qcSigned: true }), "JOB_COMPLETE", "QC signed, install_done never stamped");
  assert.equal(techStatusOf({ woExists: true, woAccepted: true, completed: true }), "JOB_COMPLETE", "project closed out");
  // An unpaid invoice is not a state a technician has: the ladder has no input for it.
  const src = read("../lib/tech-scope.js");
  assert.ok(!/AWAITING_FINAL_PAYMENT|AWAITING_DEPOSIT|balance/.test(src.slice(src.indexOf("TECH_STATUS"))), "no money state in the tech ladder");
});

test("bug #5: a tech is never told to create the work order", () => {
  const none = techWorkOrderCard({});
  assert.equal(none.action, null, "no button when there is no work order");
  assert.match(none.sub, /has not issued it yet/);
  assert.ok(!/create/i.test(none.sub + none.action), "and the word Create never appears");
  assert.equal(techWorkOrderCard({ woExists: true }).action, "Start");
  assert.equal(techWorkOrderCard({ woExists: true, woAccepted: true }).action, "Continue");
  assert.equal(techWorkOrderCard({ woExists: true, woAccepted: true, started: true, lineProgress: { done: 3, total: 8 } }).sub, "3 of 8 lines complete.");
  assert.equal(techWorkOrderCard({ woExists: true, woAccepted: true, installDone: true, qcSigned: true }).done, true);
  // Creating one is an office action that names nothing, so the server refuses it too.
  assert.ok(!TECH_ALLOW.has("createWorkOrderAction"));
  assert.ok(!TECH_ALLOW.has("createWorkOrderDocAction"));
  assert.ok(!TECH_ALLOW.has("submitWorkOrderAction"));
  assert.equal(can("tech", "wo.edit"), false);
});
