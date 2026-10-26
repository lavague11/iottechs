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
let proposalChangeState;
let downloadProposalPdf;

// 4 cameras × $150 = $600 (no tax) → grand 600, 50% deposit = 300.
const PAYLOAD = { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i1", name: "Camera", qty: 4, price: 150 }] }] }] };
// Same shape, higher price — stands in for an unsent working-draft edit.
const PAYLOAD_V2 = { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "i1", name: "Camera", qty: 4, price: 300 }] }] }] };

let seq = 0;
const project = () => { seq++; const r = db.createLeadProject(`Resolver ${seq}`, `resolver${seq}@example.com`, `201555${String(1000 + seq)}`, "2503 Jay Pl", "cctv", `Resolver ${seq} Co`); return r.accessId || r.access_id || r; };
const sendV1 = (a) => { db.saveProposalDraft(a, { payload: PAYLOAD, taxRate: 0, depositPct: 50 }, "Staff"); db.markProposalSent(a, "Staff"); };

before(async () => { db = await import("../lib/db.js"); ({ proposalChangeState } = await import("../lib/proposal.js")); ({ downloadProposalPdf } = await import("../lib/proposal-pdf.js")); });

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

// ---- Phase 1.2: customer required-actions read the published version ----
test("Phase 1.2: an unsent draft doesn't hide (or misattribute) v1's pending signature requirement", () => {
  const a = project(); sendV1(a);                                   // v1 sent, awaiting signature
  const before = db.resolveCustomerRequiredActions(a).find((x) => x.documentType === "proposal");
  assert.ok(before && before.action === "signature", "a sent-but-unsigned v1 needs a signature");
  assert.equal(before.version, 1);

  db.reviseProposal(a, "Staff");                                    // mint unsent draft v2
  const after = db.resolveCustomerRequiredActions(a).find((x) => x.documentType === "proposal");
  assert.ok(after && after.action === "signature", "the pending signature on published v1 is still surfaced");
  assert.equal(after.version, 1, "the required action references PUBLISHED v1, not the unsent draft v2");
});

// ---- Phase 3: signatures/acceptance bind to the published version ----
test("Phase 3: accept + sign resolve the published version; re-sign required once a revision is published", () => {
  const a = project(); sendV1(a);
  db.selectProposalOption(a, "A");
  db.signProposal(a, "Jordan Rivera", null, { terms: true });
  const pub = db.getPublishedProposal(a);
  assert.equal(pub.version, 1); assert.ok(pub.signed_name, "published v1 is signed");
  assert.equal(db.buildStageFacts(a).proposal_signed, true);

  db.reviseProposal(a, "Staff");
  db.saveProposalDraft(a, { payload: PAYLOAD_V2, taxRate: 0, depositPct: 50 }, "Staff");
  db.markProposalSent(a, "Staff");                                   // publish the revision
  const pub2 = db.getPublishedProposal(a);
  assert.equal(pub2.version, 2); assert.equal(!!pub2.signed_name, false, "the republished v2 is unsigned");
  assert.equal(db.buildStageFacts(a).proposal_signed, false, "re-signature required on the published revision");
  assert.equal(db.getLatestSignedVersion(a).version, 1, "v1's signature stays immutable in history");
});

test("Phase 3: accepting the published version while a draft exists keeps v1's supersession marker", () => {
  const a = project(); sendV1(a);
  db.reviseProposal(a, "Staff");                                     // draft v2; v1 stored-status = superseded
  db.selectProposalOption(a, "A");                                   // customer accepts the published v1
  const pub = db.getPublishedProposal(a);
  assert.equal(pub.version, 1);
  assert.equal(pub.status, "accepted", "effective published status is accepted");
  assert.deepEqual(JSON.parse(pub.accepted_options), ["A"]);
  const stored = db.sqliteHandle().prepare("SELECT status FROM proposals WHERE project_access_id=? AND version=1").get(a);
  assert.equal(stored.status, "superseded", "v1 stays marked superseded — the version model isn't corrupted");
  assert.equal(db.getActiveProposal(a).version, 2, "staff workspace is still the draft v2");
});

// ---- Phase 4: per-version PDF reproducibility (each version's row is an immutable snapshot) ----
test("Phase 4: a superseded version's PDF reproduces exactly that version, not the later one", () => {
  const a = project(); sendV1(a);                                   // v1 = $600
  db.reviseProposal(a, "Staff");
  db.saveProposalDraft(a, { payload: PAYLOAD_V2, taxRate: 0, depositPct: 50 }, "Staff");
  db.markProposalSent(a, "Staff");                                   // v2 = $1,200 published
  // v1's stored row still carries its ORIGINAL payload — render it and confirm it reproduces v1's numbers.
  const v1row = db.sqliteHandle().prepare("SELECT * FROM proposals WHERE project_access_id=? AND version=1").get(a);
  const trace = [];
  downloadProposalPdf({ ...v1row, payload: JSON.parse(v1row.payload) }, { customerName: "T", __trace: trace, __return: true });
  const texts = trace.map((t) => t.text).join(" ");
  assert.ok(/\$600\b/.test(texts), "v1 PDF reproduces v1's $600 total");
  assert.ok(!/\$1,200\b/.test(texts), "v1 PDF never shows the later v2 ($1,200) total");
});

// ---- Phase 1.1: AR / receivables follows the published version too ----
test("AR: a signed project with an unsent draft stays in receivables at the PUBLISHED v1 numbers", () => {
  const a = project(); sendV1(a);
  db.selectProposalOption(a, "A");
  db.signProposal(a, "Jordan Rivera", null, { terms: true });
  const before = db.getReceivables().find((x) => x.access_id === a);
  assert.ok(before, "signed project is in AR");
  assert.equal(before.total, 600, "AR total = signed v1 ($600)");

  db.reviseProposal(a, "Staff");                                                       // mint draft v2
  db.saveProposalDraft(a, { payload: PAYLOAD_V2, taxRate: 0, depositPct: 50 }, "Staff"); // draft doubles the price
  const after = db.getReceivables().find((x) => x.access_id === a);
  assert.ok(after, "the project does NOT disappear from AR while an unsent draft exists");
  assert.equal(after.total, 600, "AR still bills the published v1 ($600), not the unsent draft ($1,200)");
  assert.equal(after.status, "accepted", "AR status normalized from 'superseded' back to 'accepted'");
});

test("AR: after Send Revision and re-acceptance, receivables bills the republished v2", () => {
  const a = project(); sendV1(a);
  db.selectProposalOption(a, "A");                                                     // accept v1 → $600 receivable
  assert.equal(db.getReceivables().find((x) => x.access_id === a)?.total, 600, "accepted v1 is a $600 receivable");
  db.reviseProposal(a, "Staff");
  db.saveProposalDraft(a, { payload: PAYLOAD_V2, taxRate: 0, depositPct: 50 }, "Staff");
  db.markProposalSent(a, "Staff");                                                     // Send Revision (v2 sent)
  db.selectProposalOption(a, "A");                                                     // customer re-accepts v2
  assert.equal(db.getReceivables().find((x) => x.access_id === a)?.total, 1200, "AR bills the re-accepted, republished v2");
});

// ---- Phase 2: unsent-change state (working vs published, reusing fingerprint + proposalDiff) ----
test("Phase 2: no unsent changes before first send, or on a sent proposal with no draft", () => {
  const a = project();
  db.saveProposalDraft(a, { payload: PAYLOAD, taxRate: 0, depositPct: 50 }, "Staff");  // first draft, never sent
  let cs = db.getProposalChangeState(a);
  assert.equal(cs.hasUnsentChanges, false, "the first never-sent draft is not 'unsent changes'");
  assert.equal(cs.publishedVersion, null);
  assert.equal(cs.workingVersion, 1);
  db.markProposalSent(a, "Staff");                                                     // now sent, no draft
  cs = db.getProposalChangeState(a);
  assert.equal(cs.hasUnsentChanges, false, "sent with no outstanding draft ⇒ nothing unsent");
  assert.equal(cs.publishedVersion, 1); assert.equal(cs.workingVersion, 1);
});

test("Phase 2: a freshly-minted draft with no edits yet reports zero unsent changes (fingerprint match)", () => {
  const a = project(); sendV1(a);
  db.reviseProposal(a, "Staff");                                                       // draft v2 clones v1's payload
  const cs = db.getProposalChangeState(a);
  assert.equal(cs.hasUnsentChanges, false, "identical draft ⇒ no meaningful change");
  assert.equal(cs.publishedVersion, 1); assert.equal(cs.workingVersion, 2);
  assert.equal(cs.changeCount, 0);
});

test("Phase 2: an edited draft surfaces structured changes, a count, and a signed financial delta", () => {
  const a = project(); sendV1(a);
  db.reviseProposal(a, "Staff");
  db.saveProposalDraft(a, { payload: PAYLOAD_V2, taxRate: 0, depositPct: 50 }, "Staff"); // $600 → $1,200 on one item
  const cs = db.getProposalChangeState(a);
  assert.equal(cs.hasUnsentChanges, true);
  assert.equal(cs.publishedVersion, 1); assert.equal(cs.workingVersion, 2);
  assert.equal(cs.changeCount, 1, "one line item changed (price)");
  assert.equal(cs.financialDelta, 600, "net +$600 vs the published version");
  assert.ok(cs.structuredChanges && cs.structuredChanges.options?.[0]?.changed?.length === 1, "reuses proposalDiff's structured output");
});

test("Phase 2 (pure): proposalChangeState is null-safe and ignores a same-row comparison", () => {
  assert.equal(proposalChangeState(null, null).hasUnsentChanges, false);
  assert.equal(proposalChangeState(null, { id: 1, version: 1, payload: "{}" }).hasUnsentChanges, false); // nothing published
  const same = { id: 7, version: 2, payload: JSON.stringify(PAYLOAD), tax_rate: 0, deposit_pct: 50 };
  assert.equal(proposalChangeState(same, same).hasUnsentChanges, false, "same row id ⇒ not a revision");
});
