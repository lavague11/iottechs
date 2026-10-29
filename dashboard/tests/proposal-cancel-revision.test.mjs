// Cancel Revision — discard the unsent working draft and restore the version the customer last received.
// Only valid when a published version exists AND an unsent draft sits above it; never on a never-sent draft.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "cancelrev-"));
process.env.TZ = "America/New_York";

let db;
const proj = (name, phone) => {
  const r = db.createLeadProject(name, `${name.replace(/\W/g, "").toLowerCase()}@x.com`, phone, "2503 Jay Pl", "cctv", `${name} Co`);
  return r.accessId || r.access_id || r;
};
const payloadAt = (price) => ({ options: [{ id: "A", name: "Opt", services: [{ key: "camera", label: "Cameras", items: [{ id: "i1", name: "Cam", qty: 1, price }] }] }] });

before(async () => { db = await import("../lib/db.js"); });

test("cancelRevision reverts an unsent revision to the sent version; preserves published content", () => {
  const acc = proj("Cancel", "5551230000");
  db.saveProposalDraft(acc, { payload: payloadAt(100), taxRate: 0, depositPct: 0 }, "Tester");
  db.markProposalSent(acc, "Tester");
  assert.equal(db.getPublishedProposal(acc).version, 1);

  // Revise → working draft v2, then edit its price.
  db.reviseProposal(acc, "Tester");
  const working = db.getActiveProposal(acc);
  assert.ok(working.version === 2 && working.id !== db.getPublishedProposal(acc).id, "a separate draft exists");
  db.saveProposalDraft(acc, { payload: payloadAt(200), taxRate: 0, depositPct: 0 }, "Tester");
  assert.equal(db.getProposalChangeState(acc).hasUnsentChanges, true, "edit registers as unsent");

  // Cancel → the draft is discarded; active === published v1; nothing unsent; price is the SENT 100.
  const r = db.cancelRevision(acc);
  assert.equal(r.ok, true);
  const act = db.getActiveProposal(acc), pub = db.getPublishedProposal(acc);
  assert.equal(act.id, pub.id, "active is back to the published row");
  assert.equal(pub.version, 1, "reverted to v1");
  assert.equal(pub.status, "sent", "published status restored (un-superseded)");
  assert.equal(JSON.parse(pub.payload).options[0].services[0].items[0].price, 100, "customer content unchanged");
  assert.equal(db.getProposalChangeState(acc).hasUnsentChanges, false, "no unsent changes after cancel");

  // Nothing left to cancel.
  assert.equal(db.cancelRevision(acc).ok, false, "second cancel is a no-op");
});

test("cancelRevision refuses on a brand-new, never-sent draft (nothing to revert to)", () => {
  const acc = proj("NeverSent", "5559990000");
  db.saveProposalDraft(acc, { payload: payloadAt(50), taxRate: 0, depositPct: 0 }, "Tester");
  const r = db.cancelRevision(acc);
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing has been sent/i);
  // The draft is untouched.
  assert.equal(db.getActiveProposal(acc).status, "draft");
});
