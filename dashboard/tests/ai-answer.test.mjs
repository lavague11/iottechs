// Phase-1 "answer" layer: read-only business questions resolve to REAL data (never invented) via injected
// db functions, authorized per role. Pure — we inject fakes, so no DB.
import test from "node:test";
import assert from "node:assert/strict";
import { runQuery, READ_QUERIES } from "../lib/ai-answer.js";
import { can } from "../lib/roles.js";

const PROPOSAL = { options: [{ id: "A", services: [{ key: "camera", items: [{ id: "i1", name: "Camera", qty: 4, price: 150 }] }] }] };
const JOBS = {
  ASC1: { access_id: "ASC1", customer: "Crazy Cars", stage: "proposal", tech: "Tess Tech", payout_amount: 500, payout_status: "approved" },
  ASC2: { access_id: "ASC2", customer: "Nobo Restaurant", stage: "qc" },
};
const db = {
  getActiveProposal: (a) => a === "ASC1" ? { status: "sent", payload: JSON.stringify(PROPOSAL), tax_rate: 0, deposit_pct: 50, selected_option: "A", signed_name: null } : { status: "draft" },
  getJobByAccessId: (a) => JOBS[a] || null,
  getReceivables: () => [
    { access_id: "ASC1", customer: "Crazy Cars", status: "sent", financialState: "awaiting_signature" },
    { access_id: "ASC2", customer: "Nobo Restaurant", status: "accepted", financialState: "due_now" },
  ],
  getVisibleJobs: (_uid, role) => (role === "admin" || role === "manager") ? Object.values(JOBS) : [JOBS.ASC1],   // non-privileged see only ASC1
  searchProjects: (q) => Object.values(JOBS).filter((j) => j.customer.toLowerCase().includes(String(q).toLowerCase())),
  buildStageFacts: (a) => a === "ASC1" ? { stage: "proposal", proposal_status: "sent" } : { stage: "qc" },   // ASC1: sent, not accepted → customer must accept
  getProjectAssignments: () => [{ role: "tech", user_id: 7 }],
  getProjectFinancialState: (a) => a === "ASC1" ? { total: 600, paid: 100, balance: 500, pendingPayments: 0 } : null,
  listInstallIssues: (a) => a === "ASC1" ? [{ status: "NEEDS_REVIEW", title: "Camera 3 offline" }, { status: "RESOLVED", title: "Old flag" }] : [],
};
const fin = { optionTotals: (opt) => ({ grand: (opt.services || []).reduce((s, sv) => s + (sv.items || []).reduce((a, it) => a + it.qty * it.price, 0), 0) }) };
// Uses the REAL capability map so role-stripping is genuinely exercised. userName matches ASC1.tech for the
// own-payout test.
const ctx = (role = "admin", currentAccessId = null, userName = "Admin") => ({ role, userId: 1, userName, currentAccessId, can, db, fin });

test("proposal_total retrieves the real grand total (by name and by 'this')", () => {
  const r = runQuery({ query: "proposal_total", target: "Crazy Cars" }, ctx());
  assert.match(r.text, /Crazy Cars.*\$600\.00/);
  assert.ok(r.facts.some((f) => /\$600\.00/.test(f)), "records the fact for memory");
  assert.match(runQuery({ query: "proposal_total", target: "this" }, ctx("admin", "ASC1")).text, /\$600\.00/);
});

test("a resolved read returns the project so memory can track 'it' later", () => {
  // Reads carry back the resolved project → the client remembers it → a later pronoun resolves via
  // currentAccessId, even though nothing navigated.
  const total = runQuery({ query: "proposal_total", target: "Crazy Cars" }, ctx());
  assert.deepEqual(total.project, { accessId: "ASC1", name: "Crazy Cars" });
  const status = runQuery({ query: "project_status", target: "Crazy Cars" }, ctx());
  assert.deepEqual(status.project, { accessId: "ASC1", name: "Crazy Cars" });
  // "what's going on with it" after that answer → target "this" resolves to the remembered project.
  assert.match(runQuery({ query: "project_status", target: "it" }, ctx("admin", "ASC1")).text, /Crazy Cars/);
});

test("project_status reports stage + proposal state, never invented", () => {
  const r = runQuery({ query: "project_status", target: "Crazy Cars" }, ctx());
  assert.match(r.text, /Proposal stage/);
  assert.match(r.text, /awaiting signature/);
});

test("awaiting_signature lists only unsigned, visible proposals", () => {
  const r = runQuery({ query: "awaiting_signature" }, ctx());
  assert.match(r.text, /1 proposal.*awaiting signature: Crazy Cars/);   // Nobo is signed → excluded
});

test("projects_by_stage filters the authorized project list", () => {
  assert.match(runQuery({ query: "projects_by_stage", stage: "qc" }, ctx()).text, /1 project.*Quality Control: Nobo Restaurant/);
  assert.match(runQuery({ query: "projects_by_stage", stage: "proposal" }, ctx()).text, /Crazy Cars/);
});

test("authorization: a sales user can't read a project they can't see (no leak)", () => {
  const r = runQuery({ query: "proposal_total", target: "Nobo Restaurant" }, ctx("sales"));
  assert.ok(r.error && r.reason === "no_data", "scoped out → no_data, not the real total");
  // …but awaiting_signature for sales shows only their visible set (Crazy Cars), never Nobo.
  assert.doesNotMatch(runQuery({ query: "awaiting_signature" }, ctx("sales")).text || "", /Nobo/);
});

test("ambiguous + unknown reads classify instead of guessing", () => {
  assert.equal(runQuery({ query: "proposal_total" }, ctx("admin", null)).reason, "ambiguous");   // no target, no current project
  assert.equal(runQuery({ query: "nonsense" }, ctx()).reason, "unsupported_read");
  assert.ok(READ_QUERIES.includes("proposal_total") && READ_QUERIES.length >= 4);
});

test("project_next names the blocker, whose turn, the recommended action — and staff get parallel prep", () => {
  const r = runQuery({ query: "project_next", target: "Crazy Cars" }, ctx("manager"));
  assert.match(r.text, /Proposal stage/);
  assert.match(r.text, /blocker/i);
  assert.match(r.text, /customer'?s turn/i);          // ASC1: sent, awaiting the customer to accept
  assert.match(r.text, /recommended/i);
});

test("project_money is cap-gated: office sees it, a technician never does", () => {
  assert.match(runQuery({ query: "project_money", target: "Crazy Cars" }, ctx("sales")).text, /balance \$500\.00/);
  const tech = runQuery({ query: "project_money", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech"));
  assert.equal(tech.reason, "permission", "a tech cannot see customer financials");
});

test("proposal_total + project_status strip retail from a technician (no price leak)", () => {
  assert.equal(runQuery({ query: "proposal_total", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech")).reason, "permission");
  const status = runQuery({ query: "project_status", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech"));
  assert.doesNotMatch(status.text, /\$/, "a tech sees the stage + proposal state but never the total");
  assert.match(status.text, /Proposal stage/);
});

test("project_payout: a tech sees ONLY their own job; refused on a job they aren't on", () => {
  const mine = runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech"));
  assert.match(mine.text, /Your payout is \$500\.00 \(approved\)/);
  const notMine = runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("tech", null, "Someone Else"));
  assert.equal(notMine.reason, "permission", "not their assigned job → no payout leak");
  // Admin sees the figure named by project; sales (no install.pay.view) is refused.
  assert.match(runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("admin")).text, /payout is \$500\.00/);
  assert.equal(runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("sales")).reason, "permission");
});

test("project_issues lists only OPEN flags; project_timeline is stage-aware", () => {
  assert.match(runQuery({ query: "project_issues", target: "Crazy Cars" }, ctx()).text, /1 open issue: Camera 3 offline/);
  assert.doesNotMatch(runQuery({ query: "project_issues", target: "Crazy Cars" }, ctx()).text, /Old flag/);
  assert.match(runQuery({ query: "project_timeline", target: "Crazy Cars" }, ctx()).text, /Proposal stage/);
});
