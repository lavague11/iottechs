// Stage 4 of docs/customer-flow-v2.md — the work order as its own signed document.
// These pin the two things that change behaviour on live data: the auto-draft, and the gate that closes
// the "assigned a tech, so the work order counts as accepted" hole WITHOUT retro-locking anything.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STAGE_FLOW, blockingReqs } from "../lib/stage-flow.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");

const schedReq = () => STAGE_FLOW.schedule.find((r) => /accepted the work order/i.test(r.label));

test("item 9: a project WITH a work-order document must have it signed", () => {
  const r = schedReq();
  assert.ok(r, "the requirement exists");
  // Has a document, nobody signed it → blocked, even with a technician assigned.
  assert.equal(r.check({ wo_exists: true, wo_signed: false, tech: "Dana", tech_accepted: true },
    [{ role: "tech" }]), false, "an assignment is no longer acceptance");
  assert.equal(r.check({ wo_exists: true, wo_signed: true }, []), true, "a signature is");
});

test("item 9: a project with NO work-order document keeps the old rule — nothing is retro-locked", () => {
  const r = schedReq();
  assert.equal(r.check({ wo_exists: false, tech_accepted: true }, []), true, "legacy tech acceptance");
  assert.equal(r.check({ wo_exists: false, tech: "Dana" }, []), true, "the legacy projects.tech field");
  assert.equal(r.check({ wo_exists: false }, [{ role: "tech" }]), true, "or an assignment");
  assert.equal(r.check({ wo_exists: false }, []), false, "but still not nothing at all");
});

test("item 9: the gate holds the SCHEDULE stage, so no project past it is frozen", () => {
  // Tightening install/qc/payment instead would strand live jobs sitting in those stages. The schedule
  // requirement gates ENTERING install, and gateThroughIndex never regresses below a project's position.
  const facts = { wo_exists: true, wo_signed: false, install_done: true, qc_passed: true,
    qc_manager_approved: true, qc_customer_signed: true, final_balance_paid: true, completion_docs: true };
  assert.deepEqual(blockingReqs("install", facts, []).map((r) => r.label), [], "install never asks for a signature");
  assert.deepEqual(blockingReqs("qc", facts, []).map((r) => r.label), []);
  assert.deepEqual(blockingReqs("payment", facts, []).map((r) => r.label), []);
  assert.equal(blockingReqs("schedule", { ...facts, install_confirmed: true }, []).length, 1, "only schedule holds it");
});

test("item 9: the facts are real queries, and the signature must be a live tech one", () => {
  assert.match(db, /wo_exists: !!db\.prepare\("SELECT 1 FROM wo WHERE project_access_id=\? LIMIT 1"\)/);
  const at = db.indexOf("wo_signed: !!db.prepare(");
  const q = db.slice(at, at + 320);
  assert.match(q, /FROM wo_signatures s JOIN wo w ON w\.id = s\.wo_id/);
  assert.match(q, /s\.party='tech'/, "a customer sign-off is not a technician accepting the work");
  assert.match(q, /s\.voided_at IS NULL/, "a voided signature does not count");
});

test("item 1: signing the proposal auto-drafts the work order, and cannot send it", () => {
  const at = db.indexOf("export function signProposal(");
  const body = db.slice(at, db.indexOf("\n}", db.indexOf("return getPublishedProposal(accessId);", at)));
  assert.match(body, /createWorkOrderDoc\(accessId, \{ byName: "auto · proposal signed" \}\)/, "the draft is made on signing");
  assert.match(body, /try \{ createWorkOrderDoc/, "and a failed draft can never fail a signature");
  // Nothing in this path sends — sending is a separate, deliberate act. Comments are stripped first:
  // the explanation above the call names the sending action, and matching that would be matching prose.
  const code = body.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/sendWorkOrderVersion|markWorkOrderSent|wo_versions/.test(code), "the auto-draft never sends");
  // createWorkOrderDoc inserts no status or version, so the row takes the schema defaults — draft, 0.
  const mk = db.slice(db.indexOf("export function createWorkOrderDoc("), db.indexOf("export function createWorkOrderDoc(") + 1400);
  assert.match(mk, /INSERT INTO wo \(project_access_id, source_proposal_id, source_version, source_option, payload, created_by\)/);
  assert.ok(!/INSERT INTO wo \([^)]*\bstatus\b/.test(mk), "status is never set on create — it defaults to draft");
});

test("item 1: the auto-draft is idempotent, so re-signing never re-snapshots an edited work order", () => {
  const mk = db.slice(db.indexOf("export function createWorkOrderDoc("), db.indexOf("export function createWorkOrderDoc(") + 900);
  assert.match(mk, /const existing = woRow\(accessId\);\s*\n\s*if \(existing\) return \{ ok: true, id: existing\.id, existed: true \};/);
});
