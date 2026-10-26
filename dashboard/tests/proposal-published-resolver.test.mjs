// Phase 1 — published-vs-working proposal resolution (node --test, real node:sqlite via a temp DB_DIR).
// The canonical rule: getActiveProposal = the staff WORKING row (latest non-superseded, i.e. the draft
// once one exists); getPublishedProposal = the latest version the customer actually RECEIVED (sent_at set),
// which stays the contractual truth even after a newer working draft supersedes it. Stage facts and
// contractual financials must read PUBLISHED so an in-progress revision never leaks to the customer or
// rewinds the gate.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "pub-resolver-"));
process.env.TZ = "America/New_York";

let db;

// 4 cameras × $150 = $600 (no tax) → grand 600, 50% deposit = 300.
const PAYLOAD = { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i1", name: "Camera", qty: 4, price: 150 }] }] }] };
// Same shape, higher price — stands in for an unsent working-draft edit.
const PAYLOAD_V2 = { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i1", name: "Camera", qty: 4, price: 300 }] }] }] };

let seq = 0;
const project = () => { seq++; const r = db.createLeadProject(`Resolver ${seq}`, `resolver${seq}@example.com`, `201555${String(1000 + seq)}`, "2503 Jay Pl", "cctv", `Resolver ${seq} Co`); return r.accessId || r.access_id || r; };
const sendV1 = (a) => { db.saveProposalDraft(a, { payload: PAYLOAD, taxRate: 0, depositPct: 50 }, "Staff"); db.markProposalSent(a, "Staff"); };

before(async () => { db = await import("../lib/db.js"); });

test("before first send: no published version (no contract), working draft exists", () => {
  const a = project();
  db.saveProposalDraft(a, { payload: PAYLOAD, taxRate: 0, depositPct: 50 }, "Staff");
  assert.equal(db.getPublishedProposal(a), null, "nothing sent ⇒ no published version");
  const active = db.getActiveProposal(a);
  assert.ok(active && active.status === "draft", "the working draft is the active row");
  assert.equal(db.getProjectFinancialState(a), null, "no contract to bill before send");
});

test("after send: published === active, both are v1 sent", () => {
  const a = project(); sendV1(a);
  const pub = db.getPublishedProposal(a), act = db.getActiveProposal(a);
  assert.equal(pub.version, 1); assert.equal(act.version, 1);
  assert.equal(pub.status, "sent"); assert.equal(pub.id, act.id);
});

test("revise splits them: working draft advances to v2, published stays v1", () => {
  const a = project(); sendV1(a);
  db.reviseProposal(a, "Staff");                       // mint v2 draft, supersede v1
  const act = db.getActiveProposal(a), pub = db.getPublishedProposal(a);
  assert.equal(act.version, 2); assert.equal(act.status, "draft", "staff edit the draft");
  assert.equal(pub.version, 1, "customer still sees the last sent version");
  assert.equal(pub.status, "sent", "published status is normalized back from 'superseded'");
});

test("editing the working draft never moves the published contract (price, total)", () => {
  const a = project(); sendV1(a);
  db.selectProposalOption(a, "A");                     // accept v1 → $600 contract
  const before = db.getProjectFinancialState(a);
  assert.equal(before.total, 600, "accepted v1 total");
  db.reviseProposal(a, "Staff");
  db.saveProposalDraft(a, { payload: PAYLOAD_V2, taxRate: 0, depositPct: 50 }, "Staff");  // draft doubles the price
  assert.equal(db.getActiveProposal(a).version, 2, "working draft carries the new price");
  const after = db.getProjectFinancialState(a);
  assert.equal(after.total, 600, "billed total still follows the PUBLISHED v1, not the unsent draft");
  assert.equal(db.getPublishedProposal(a).status, "accepted", "published status stays 'accepted' after revise");
});

test("sending the revision republishes: published moves to v2", () => {
  const a = project(); sendV1(a);
  db.reviseProposal(a, "Staff");
  db.saveProposalDraft(a, { payload: PAYLOAD_V2, taxRate: 0, depositPct: 50 }, "Staff");
  db.markProposalSent(a, "Staff");                     // Send Revision
  const pub = db.getPublishedProposal(a);
  assert.equal(pub.version, 2); assert.equal(pub.status, "sent");
  assert.equal(db.getProjectFinancialState(a).total, 1200, "now billing the republished v2");
});

test("stage facts read published: revising a signed proposal does NOT rewind the gate", () => {
  const a = project(); sendV1(a);
  db.selectProposalOption(a, "A");                     // accept
  db.signProposal(a, "Jordan Rivera", null, { terms: true });
  const signedFacts = db.buildStageFacts(a);
  assert.equal(signedFacts.proposal_signed, true, "signed before revise");
  assert.equal(signedFacts.proposal_status, "accepted");

  db.reviseProposal(a, "Staff");                       // working draft v2 (unsigned)
  const act = db.getActiveProposal(a);
  assert.equal(act.version, 2); assert.equal(!!act.signed_name, false, "the draft carries no signature");
  const facts = db.buildStageFacts(a);
  assert.equal(facts.proposal_signed, true, "gate still sees the signed PUBLISHED v1 — not rewound by the draft");
  assert.equal(facts.proposal_status, "accepted", "contractual status stays accepted");
  assert.equal(facts.proposal_version, 1, "stage facts reflect the published version number");
});
