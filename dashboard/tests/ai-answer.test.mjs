// Phase-1 "answer" layer: read-only business questions resolve to REAL data (never invented) via injected
// db functions, authorized per role. Pure — we inject fakes, so no DB.
import test from "node:test";
import assert from "node:assert/strict";
import { runQuery, READ_QUERIES } from "../lib/ai-answer.js";

const PROPOSAL = { options: [{ id: "A", services: [{ key: "camera", items: [{ id: "i1", name: "Camera", qty: 4, price: 150 }] }] }] };
const JOBS = {
  ASC1: { access_id: "ASC1", customer: "Crazy Cars", stage: "proposal" },
  ASC2: { access_id: "ASC2", customer: "Nobo Restaurant", stage: "qc" },
};
const db = {
  getActiveProposal: (a) => a === "ASC1" ? { status: "sent", payload: JSON.stringify(PROPOSAL), tax_rate: 0, deposit_pct: 50, selected_option: "A", signed_name: null } : { status: "draft" },
  getJobByAccessId: (a) => JOBS[a] || null,
  getReceivables: () => [
    { access_id: "ASC1", customer: "Crazy Cars", status: "sent", signed_name: null, declined_at: null },
    { access_id: "ASC2", customer: "Nobo Restaurant", status: "accepted", signed_name: "Owner", declined_at: null },
  ],
  getVisibleJobs: (_uid, role) => (role === "admin" || role === "manager") ? Object.values(JOBS) : [JOBS.ASC1],   // sales sees only ASC1
  searchProjects: (q) => Object.values(JOBS).filter((j) => j.customer.toLowerCase().includes(String(q).toLowerCase())),
};
const fin = { optionTotals: (opt) => ({ grand: (opt.services || []).reduce((s, sv) => s + (sv.items || []).reduce((a, it) => a + it.qty * it.price, 0), 0) }) };
const ctx = (role = "admin", currentAccessId = null) => ({ role, userId: 1, currentAccessId, can: () => true, db, fin });

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
