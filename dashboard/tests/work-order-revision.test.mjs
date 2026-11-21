// Work order Stage 2 (docs/WORK_ORDERS.md): versions, the revision bar, the PIN-gated technician
// signature, and a signed proposal revision / approved add-on arriving as an UNSENT revision.
// The SQL is lifted out of lib/db.js and executed, so a rename breaks this test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { workOrderPayloadFrom, workOrderFingerprint, workOrderChangeState, woLines } from "../lib/work-order.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const actions = read("../app/project/[accessId]/work-order-actions.js");
const footer = read("../app/project/[accessId]/work-order-footer.jsx");
const editor = read("../app/project/[accessId]/work-order-editor.jsx");
const gateway = read("../app/project/[accessId]/gateway-client.jsx");
const propFooter = read("../app/project/[accessId]/proposal-footer.jsx");

function ddl(name) {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n    \\)`).exec(db);
  assert.ok(m, `${name} DDL found`);
  return m[0];
}
function fnBody(name) {
  const i = db.indexOf(`export function ${name}`);
  assert.ok(i >= 0, `${name} exported`);
  const j = db.indexOf("\nexport ", i + 10);
  return db.slice(i, j < 0 ? undefined : j);
}
const TABLES = ["wo", "wo_versions", "wo_lines", "wo_signatures", "wo_events"];
function fresh() {
  const d = new DatabaseSync(":memory:");
  for (const t of TABLES) d.exec(ddl(t));
  return d;
}
const RATES = { cam_drop: 10, cam_mgmt: 18, cam_term: 12, cam_mount: 12, nvr_setup: 75 };
const PROPOSAL = { id: 7, version: 2, selected_option: "A", payload: { options: [{ id: "A", name: "Rec", services: [{ key: "camera", label: "Cameras", items: [
  { id: "c1", name: "Front Camera", qty: 1, price: 450, sub: [{ id: "c1a", name: "Cat6 Drop", qty: 1, price: 150 }] },
  { id: "n1", name: "NVR (8-Channel)", qty: 1, price: 700 },
] }] }] } };

function seed(d, payload) {
  d.prepare("INSERT INTO wo (project_access_id, source_proposal_id, source_version, source_option, payload) VALUES ('P1',7,2,'A',?)").run(JSON.stringify(payload));
  return Number(d.prepare("SELECT id FROM wo WHERE project_access_id='P1'").get().id);
}
// sendWorkOrderVersion's statements, in its order.
function sendVersion(d, id, version, payload, by = "Admin") {
  d.prepare("UPDATE wo_versions SET superseded_at=datetime('now','localtime') WHERE wo_id=? AND superseded_at IS NULL").run(id);
  d.prepare("INSERT INTO wo_versions (wo_id, version, payload, fingerprint, sent_by) VALUES (?,?,?,?,?)").run(id, version, JSON.stringify(payload), workOrderFingerprint(payload), by);
  d.prepare("UPDATE wo_signatures SET voided_at=datetime('now','localtime'), voided_by=? WHERE wo_id=? AND version<? AND voided_at IS NULL").run(by, id, version);
  d.prepare("UPDATE wo SET version=?, status='sent', updated_at=datetime('now','localtime') WHERE id=?").run(version, id);
}

test("sending a revision voids the signature on the earlier version, and keeps it in the record", () => {
  const d = fresh();
  const payload = workOrderPayloadFrom(PROPOSAL, { rates: RATES });
  const id = seed(d, payload);
  sendVersion(d, id, 1, payload);
  d.prepare("INSERT INTO wo_signatures (wo_id, version, user_id, name, fingerprint, pin_verified_at, device, ip) VALUES (?,1,5,'Tech A',?,datetime('now','localtime'),'iPhone','203.0.113.9')")
    .run(id, workOrderFingerprint(payload));
  d.prepare("UPDATE wo SET status='signed' WHERE id=?").run(id);

  const revised = JSON.parse(JSON.stringify(payload));
  revised.options[0].services[0].items[1].techPrice = 120;
  sendVersion(d, id, 2, revised);

  const sig = d.prepare("SELECT version, voided_at, voided_by, device, ip, pin_verified_at FROM wo_signatures WHERE wo_id=?").all(id);
  assert.equal(sig.length, 1, "the signature row is kept, not deleted");
  assert.ok(sig[0].voided_at, "and voided — v1's scope no longer exists");
  assert.equal(sig[0].device, "iPhone");
  assert.equal(sig[0].ip, "203.0.113.9");
  assert.ok(sig[0].pin_verified_at, "the PIN confirmation is part of the record");
  const vs = d.prepare("SELECT version, superseded_at FROM wo_versions WHERE wo_id=? ORDER BY version").all(id);
  assert.ok(vs[0].superseded_at, "v1 is superseded");
  assert.equal(vs[1].superseded_at, null, "v2 is current");
  assert.equal(d.prepare("SELECT version FROM wo WHERE id=?").get(id).version, 2);
});

test("a revision does NOT disturb the field state (requirement 13)", () => {
  const d = fresh();
  const payload = workOrderPayloadFrom(PROPOSAL, { rates: RATES });
  const id = seed(d, payload);
  d.prepare("INSERT INTO wo_lines (wo_id, line_key, status, status_by) VALUES (?,'c1','complete','Tech A')").run(id);
  sendVersion(d, id, 1, payload);
  const revised = JSON.parse(JSON.stringify(payload));
  revised.options[0].services[0].items[1].techPrice = 120;
  sendVersion(d, id, 2, revised);
  const line = d.prepare("SELECT status, status_by FROM wo_lines WHERE wo_id=? AND line_key='c1'").get(id);
  assert.equal(line.status, "complete");
  assert.equal(line.status_by, "Tech A");
  // And nothing in sendWorkOrderVersion's SQL touches wo_lines at all.
  const body = fnBody("sendWorkOrderVersion");
  assert.ok(!/wo_lines/.test(body), "sending a version never writes a line's field state");
});

test("Cancel Revision restores the version the technician last received", () => {
  const sent = workOrderPayloadFrom(PROPOSAL, { rates: RATES });
  const working = JSON.parse(JSON.stringify(sent));
  working.options[0].services[0].items[1].techPrice = 999;
  const before = workOrderChangeState({ version: 1, payload: sent }, { payload: working });
  assert.equal(before.hasUnsentChanges, true);
  // Cancelling writes the sent payload back over the draft; the comparison then reports nothing unsent.
  const after = workOrderChangeState({ version: 1, payload: sent }, { payload: JSON.parse(JSON.stringify(sent)) });
  assert.equal(after.hasUnsentChanges, false);
  const body = fnBody("cancelWorkOrderRevision");
  assert.ok(body.includes("woLatestSentVersion(row.id)") && body.includes("UPDATE wo SET payload=?"), "restores from the sent version");
  assert.ok(body.includes("woSyncLines(row.id, sent.payload)"), "and re-syncs the line rows");
  assert.ok(body.includes('db.exec("ROLLBACK")'), "transactional");
});

test("the signature is refused unless the PIN matched, the version is sent, and the scope still matches", () => {
  const body = fnBody("signWorkOrder");
  assert.ok(body.includes('if (!row.version) return { error: "This work order hasn\'t been sent for signature yet." }'), "nothing to sign before it is sent");
  assert.ok(body.includes("if (!pinVerified) return"), "the PIN gate is not optional");
  assert.ok(/if \(fp !== workOrderFingerprint\(live\)\) return/.test(body), "an edited draft cannot be signed as the sent version");
  assert.ok(/SELECT 1 FROM wo_signatures WHERE wo_id=\? AND version=\? AND name=\? COLLATE NOCASE AND voided_at IS NULL/.test(body), "no double-signing a version");
  // The PIN itself never reaches the database layer: the action verifies it and passes a boolean.
  assert.ok(!/\bpin\b/.test(body.replace(/pinVerified|pin_verified_at|PIN/g, "")), "signWorkOrder never receives the PIN");
});

test("the action checks the signer's OWN pin, records device + IP, and never stores the PIN", () => {
  const i = actions.indexOf("export async function signWorkOrderAction");
  const body = actions.slice(i, actions.indexOf("\nexport ", i + 10));
  assert.ok(body.includes('const g = await gate(accessId, "wo.sign")'), "capability-gated");
  // The PIN is compared in the DATA layer and discarded there. It is never fetched into the action,
  // so it cannot be held, logged or returned by mistake.
  assert.ok(body.includes("userPinMatches(me.id, pin)"), "compared against THIS account's own PIN");
  assert.ok(body.includes("userHasPin(me.id)"), "and says plainly when there is no PIN to compare");
  assert.ok(!/userEffectivePin/.test(body), "never reads the expected PIN up here");
  // getUserById projects a SAFE column list with no pin_custom, so using it for the comparison would
  // silently fall through to the technician's phone digits and ignore an office-set PIN. Caught live.
  const dbSrc = read("../lib/db.js");
  assert.ok(!/SELECT id, name, username, email, phone, role, disabled, tech_cert, session_epoch[^"]*pin_custom/.test(dbSrc), "getUserById still omits the PIN");
  const matches = dbSrc.slice(dbSrc.indexOf("export function userPinMatches"), dbSrc.indexOf("export function userHasPin"));
  assert.ok(matches.includes("SELECT pin_custom, phone, disabled FROM users"), "it reads the column itself");
  assert.ok(matches.includes("if (!u || u.disabled) return false"), "a disabled account can't sign");
  assert.ok(/return !!expected && String\(expected\) === pin/.test(matches), "an account with no PIN never matches");
  assert.ok(body.includes("parseUserAgent(hdrs.get(\"user-agent\"))") && body.includes("trustedClientIp"), "device + IP captured from the request, not the client");
  assert.ok(body.includes("pinVerified: true"), "only a verified PIN reaches the db layer");
  assert.ok(!/signWorkOrder\([^)]*pin[,)\s]/.test(body.replace("pinVerified: true", "")), "the PIN is not forwarded");
  // And nothing returns or logs it.
  assert.ok(!/return[^;]*\bpin\b/.test(body), "the PIN is never echoed back");
});

test("voiding a signature keeps the row and drops the work order back to 'sent'", () => {
  const d = fresh();
  const payload = workOrderPayloadFrom(PROPOSAL, { rates: RATES });
  const id = seed(d, payload);
  sendVersion(d, id, 1, payload);
  d.prepare("INSERT INTO wo_signatures (wo_id, version, name, fingerprint) VALUES (?,1,'Tech A',?)").run(id, "fp");
  d.prepare("UPDATE wo SET status='signed' WHERE id=?").run(id);
  const sigId = d.prepare("SELECT id FROM wo_signatures WHERE wo_id=?").get(id).id;

  const r = d.prepare("UPDATE wo_signatures SET voided_at=datetime('now','localtime'), voided_by=? WHERE id=? AND wo_id=? AND voided_at IS NULL").run("Admin", sigId, id);
  assert.equal(r.changes, 1);
  const left = d.prepare("SELECT COUNT(*) n FROM wo_signatures WHERE wo_id=? AND version=1 AND voided_at IS NULL").get(id).n;
  assert.equal(left, 0);
  d.prepare("UPDATE wo SET status='sent' WHERE id=?").run(id);
  assert.equal(d.prepare("SELECT status FROM wo WHERE id=?").get(id).status, "sent");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM wo_signatures WHERE wo_id=?").get(id).n, 1, "the voided signature stays in the record");
  // The second void is a no-op, not a silent success.
  assert.equal(d.prepare("UPDATE wo_signatures SET voided_at=datetime('now','localtime') WHERE id=? AND voided_at IS NULL").run(sigId).changes, 0);
});

test("requirement 14: a proposal change or an approved add-on arrives as an UNSENT revision", () => {
  const body = fnBody("syncWorkOrderFromProposal");
  assert.ok(body.includes("getPublishedProposal(accessId)"), "reads the published proposal");
  assert.ok(body.includes("approvedAddonRecords(accessId)"), "and the approved add-ons");
  assert.ok(/id: `addon:\$\{a\.id\}:\$\{it\.id\}:\$\{n\}`/.test(body), "an add-on line gets a stable key");
  assert.ok(body.includes("+it.techPay || 0"), "it carries the payout the office already set on the addendum");
  assert.ok(body.includes("if (paid.has(String(it.id))) it.techPrice = paid.get(String(it.id))"), "existing payouts are carried, never re-seeded over");
  // It writes the DRAFT. It must not send, sign, or touch wo_versions — the office approves and sends.
  assert.ok(body.includes("saveWorkOrderDraft(accessId, fresh)"), "it saves the working draft");
  assert.ok(!/wo_versions|wo_signatures|status='sent'/.test(body), "it never sends or signs on the office's behalf");
  // The drift flag that surfaces it is derived, not stored.
  const drift = db.slice(db.indexOf("function woProposalDrift"), db.indexOf("function woProposalDrift") + 900);
  assert.ok(drift.includes("Number(pub.id) !== Number(row.source_proposal_id)"), "a newer published proposal is drift");
  assert.ok(drift.includes("approvedAddonRecords(accessId)"), "so is an add-on that isn't on the work order yet");
});

test("the revision bar is the proposal's, in payout dollars", () => {
  // Same words, so the office doesn't learn a second grammar.
  for (const phrase of ["Unsubmitted", "Cancel Revision", "Send Revision", "unsent"]) {
    assert.ok(footer.includes(phrase), `the work order footer says "${phrase}"`);
    assert.ok(propFooter.includes(phrase), `…exactly as the proposal footer does`);
  }
  assert.ok(footer.includes("payout</span>") || /signed\$\(cs\.payoutDelta\)/.test(footer), "the delta is payout, not retail");
  assert.ok(/workOrderChangeState/.test(db), "state comes from the one pure resolver");
  assert.ok(!/proposalDiff|optionTotals/.test(footer), "no retail formula reaches the work order footer");
  // Cancel Revision is a two-step confirm, never a native confirm().
  assert.ok(footer.includes("Discard changes?") && !/\bconfirm\(/.test(footer), "two-step in-page confirm");
  // A refused signature leaves the pad open WITH the reason on it; only success closes it.
  assert.ok(/onConfirm=\{async \(s\) => \{ const r = await onSign\(s\); if \(r\?\.ok\) setSignOpen\(false\); \}\}/.test(footer), "the pad closes only on success");
  assert.ok(footer.includes("serverError={signError}"), "and the refusal is shown on the pad, not up the page");
  // Sent versions are listed with their state.
  assert.ok(footer.includes("Superseded") && footer.includes("Current"), "the sent-versions list");
});

test("a technician can only sign a sent version with nothing unsent over it, and only once", () => {
  assert.ok(/const canSign = doc \? \(can\(role, "wo\.sign"\)/.test(editor), "capability first");
  const i = editor.indexOf("const canSign");
  const expr = editor.slice(i, editor.indexOf(";", i));
  assert.ok(expr.includes("(doc.version || 0) > 0"), "not before it is sent");
  assert.ok(expr.includes("!doc.changeState?.hasUnsentChanges"), "not while the office has unsent changes");
  assert.ok(expr.includes("s.user_id"), "not twice by the same account");
});

test("requirement 11: the work order SHOWS the install appointment and never books a second one", () => {
  assert.ok(editor.includes('getToolDataAction(accessId, "schedule")'), "read from the one scheduler's blob");
  assert.ok(!/SchedulingWidget/.test(editor), "the work order does not mount a second scheduler");
  assert.ok(editor.includes("function pickInstall"), "nearest upcoming install event");
  // Schedule opens the app's ONE scheduling dialog. It used to scroll to a SchedulingWidget parked at the
  // bottom of the same overlay; that form is gone, so assert the dialog — the requirement (reuse the one
  // scheduler, never mount a second) is what matters, not which of the two ways it was reached.
  assert.ok(/onSchedule=\{\(\) => openSchedule\("install"\)\}/.test(gateway), "the Schedule button opens the one scheduling dialog");
  assert.ok(!gateway.includes('id="wo-install-scheduler"'), "the inline work-order scheduler form is gone");
  // Assigned techs are auto-invited by that scheduler already, from the assignments it is handed.
  const sched = read("../app/project/[accessId]/scheduling-widget.jsx");
  assert.ok(/assignments\.forEach\(a => \{ const nm = \(a\.user_name \|\| a\.user_email \|\| ""\)\.trim\(\); if \(nm\) autoSet\.add\(nm\); \}\)/.test(sched), "assigned people are auto-invited");
});

test("every Stage 2 action is still capability-gated, and none of them writes a proposal", () => {
  for (const name of ["sendWorkOrderVersionAction", "cancelWorkOrderRevisionAction", "signWorkOrderAction", "voidWorkOrderSignatureAction", "syncWorkOrderFromProposalAction"]) {
    const i = actions.indexOf(`export async function ${name}`);
    assert.ok(i > 0, `${name} exists`);
    const head = actions.slice(i, actions.indexOf("\n}", i));
    assert.match(head, /await gate\(accessId, "wo\./, `${name} runs the gate`);
  }
  assert.ok(/"wo\.send"/.test(actions) && /"wo\.sign"/.test(actions) && /"wo\.sign\.void"/.test(actions), "the right capabilities");
  for (const f of ["saveProposalDraft", "setProposalTechPricing", "reviseProposal", "signProposal", "markProposalSent"]) {
    assert.ok(!actions.includes(f), `work-order-actions.js never calls ${f}`);
  }
});
