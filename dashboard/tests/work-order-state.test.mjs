// Work Order card state + the System QR card on the Staff Hub.
//
// The bug this freezes: "work order submitted" has THREE separate signals — the office's Submit freezes it
// (proposals.wo_finalized_at), a technician's acceptance stamps tech_signed_name, and a technician's own
// submission is a row in `work_orders`. The hub card checked only `work_orders`, so a work order the owner
// had already submitted through the sheet still read "Create the work order." (owner report 2026-11-15).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const db = read("lib/db.js");
const page = read("app/project/[accessId]/page.jsx");
const gw = read("app/project/[accessId]/gateway-client.jsx");
const hub = read("app/project/[accessId]/staff-hub.jsx");

const factLine = (name) => {
  const m = new RegExp(`^\\s*${name}:\\s*(.+)$`, "m").exec(db);
  assert.ok(m, `buildStageFacts exposes ${name}`);
  return m[1];
};

test("the work-order facts are version-agnostic — a WO frozen/signed on an older version still counts", () => {
  for (const name of ["work_order_submitted", "work_order_accepted"]) {
    const sql = factLine(name);
    assert.match(sql, /FROM proposals WHERE project_access_id=\?/, `${name} asks the proposals table`);
    // The contractual facts filter to the published row; these two deliberately must not, or a WO frozen
    // against an earlier version reads as "never started".
    assert.doesNotMatch(sql, /sent_at|getPublishedProposal|ORDER BY version/, `${name} must not narrow to one version`);
  }
  assert.match(factLine("work_order_submitted"), /wo_finalized_at IS NOT NULL/);
  assert.match(factLine("work_order_accepted"), /tech_signed_name IS NOT NULL/);
  // The contractual one stays published-only — these are additions, not a redefinition.
  assert.match(factLine("tech_accepted"), /prop\?\.tech_signed_name/);
});

test("the server forwards both facts to the client", () => {
  for (const name of ["work_order_submitted", "work_order_accepted"]) {
    assert.match(page, new RegExp(`project\\.${name} = !!f\\.${name}`), `page.jsx ships ${name}`);
    assert.match(gw, new RegExp(`${name}:`), `gateway-client reads ${name} into custFacts`);
  }
});

test("the Work Order card combines all three signals, never work_orders alone", () => {
  const started = /const woStarted = ([^;]+);/.exec(gw);
  assert.ok(started, "woStarted is derived");
  for (const signal of ["woSigned", "woSubmitted", "workOrders"]) {
    assert.ok(started[1].includes(signal), `woStarted accounts for ${signal}`);
  }
  const card = /\{ key: "workorder",[\s\S]{0,420}?ownHeader: true \}/.exec(gw);
  assert.ok(card, "the workorder card exists");
  assert.match(card[0], /action: woStarted \? "Edit" : "Create"/, "the verb follows the combined state");
  assert.match(card[0], /done: woStarted/, "so does the done tick");
  assert.doesNotMatch(card[0], /action: workOrders\?\.length/, "the old work_orders-only test is gone");
  // A submitted-but-unsigned WO says so, instead of claiming it was never created.
  assert.match(card[0], /woSubmitted \? "Awaiting tech signature\."/);
});

test("System QR is its own internal card, wired to the tool", () => {
  const card = /\{ key: "systemqr",[\s\S]{0,300}?\},/.exec(gw);
  assert.ok(card, "the systemqr card exists");
  assert.match(card[0], /group: "internal"/, "it sits with the Work Order, not the customer cards");
  assert.match(card[0], /done: !!lp\.system_qr/, "its state is the saved code");
  assert.match(gw, /case "systemqr":[\s\S]{0,260}<SystemQrTool/, "the overlay renders the tool");
  assert.match(gw, /case "systemqr":[\s\S]{0,260}readOnly=\{viewOnly\}/, "a preview/readonly viewer can't edit it");
  assert.match(hub, /systemqr: "System QR"/, "the overlay has a title");
});
