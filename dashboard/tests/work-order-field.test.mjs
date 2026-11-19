// Work order Stage 3 (docs/WORK_ORDERS.md): check in on site, the three-state line with its step path
// inside it, required photos, the action log, and an offline replay that cannot double-pay.
// Decisions A and B (owner, 2026-11-19) are what these tests actually protect.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  LINE_STATUS, lineSteps, stepCount, stepWeights, stepCredit, creditsForAdvance,
  lineStatusGate, stepsAfterStatus, normalizeOp, sortQueue, opKey, fieldProgress,
} from "../lib/work-order-field.js";
import { CAMERA_STEPS, NVR_STEPS } from "../lib/install-checklist-model.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const actions = read("../app/project/[accessId]/work-order-actions.js");
const field = read("../app/project/[accessId]/work-order-field.jsx");
const queue = read("../app/project/[accessId]/work-order-queue.js");

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
function fresh() {
  const d = new DatabaseSync(":memory:");
  for (const t of ["wo", "wo_lines", "wo_checkins", "wo_events", "wo_line_media", "wo_line_credits", "wo_day_logs"]) d.exec(ddl(t));
  return d;
}
const RATES = { cam_drop: 10, cam_mgmt: 18, cam_term: 12, cam_mount: 12, nvr_setup: 75 };
const CAMERA = { key: "c1", kind: "camera", name: "Front Camera", payout: 52, needsPhotos: true };

test("decision A: the three-state line keeps the install checklist's step path", () => {
  assert.deepEqual(lineSteps("camera"), CAMERA_STEPS, "the camera path is the install checklist's, not a copy");
  assert.deepEqual(lineSteps("nvr"), NVR_STEPS);
  assert.equal(stepCount("camera"), 5);
  assert.equal(stepCount("labor"), 1, "a labor line is one tap");
  // Complete fills the path; Incomplete can say how far the crew got; the picker wins over both.
  assert.equal(stepsAfterStatus("camera", LINE_STATUS.COMPLETE, { stepsDone: 2 }), 5);
  assert.equal(stepsAfterStatus("camera", LINE_STATUS.INCOMPLETE, { stepsDone: 2 }), 2);
  assert.equal(stepsAfterStatus("camera", LINE_STATUS.INCOMPLETE, { stepsDone: 2, pickStep: 4 }), 4);
  assert.equal(stepsAfterStatus("camera", LINE_STATUS.INCOMPLETE, { stepsDone: 4, pickStep: 1 }), 1, "a line can be rewound");
  assert.equal(stepsAfterStatus("camera", LINE_STATUS.ATTENTION, { stepsDone: 3 }), 3, "flagging does not change progress");
  assert.equal(stepsAfterStatus("camera", LINE_STATUS.COMPLETE, { pickStep: 2 }), 5, "Complete means complete");
});

test("decision B: a step credits whoever crossed it, and the steps add up to the line", () => {
  const w = stepWeights(RATES);
  assert.deepEqual(w.camera, [10, 18, 12, 12, 0]);
  assert.deepEqual(w.speaker, w.camera, "a speaker pays exactly like a camera");
  // 52 split by the weights: 10/52, 18/52, 12/52, 12/52, 0.
  assert.equal(stepCredit("camera", 0, 52, RATES), 10);
  assert.equal(stepCredit("camera", 1, 52, RATES), 18);
  assert.equal(stepCredit("camera", 4, 52, RATES), 0, "Camera Online is a $0 verification step");
  const all = creditsForAdvance("camera", 0, 5, 52, RATES);
  assert.equal(all.length, 5);
  assert.equal(all.reduce((s, c) => s + c.amount, 0), 52, "a full line's credits equal its payout");
  // A line with no weighted path splits evenly across its steps.
  assert.equal(stepCredit("nvr", 0, 75, RATES), 25, "NVR: three steps, evenly");
  // Only the NEWLY crossed steps are credited, so a second tech picking up mid-line is paid for theirs.
  const second = creditsForAdvance("camera", 2, 5, 52, RATES);
  assert.deepEqual(second.map((c) => c.stepIdx), [2, 3, 4]);
  assert.equal(second.reduce((s, c) => s + c.amount, 0), 24);
});

test("requirement 16: nothing can be marked before the technician is on site today", () => {
  assert.equal(lineStatusGate({ status: LINE_STATUS.COMPLETE, checkedInToday: false, line: { needsPhotos: false } }), "Check in on site first.");
  assert.equal(lineStatusGate({ status: LINE_STATUS.INCOMPLETE, checkedInToday: false, line: {} }), "Check in on site first.");
  assert.equal(lineStatusGate({ status: LINE_STATUS.INCOMPLETE, checkedInToday: true, line: {} }), null);
});

test("requirement 18: a flag needs a note OR a photo", () => {
  const base = { status: LINE_STATUS.ATTENTION, checkedInToday: true, line: { needsPhotos: true } };
  assert.match(lineStatusGate(base), /note or a photo/);
  assert.equal(lineStatusGate({ ...base, note: "Conduit is blocked" }), null, "a note is enough");
  assert.equal(lineStatusGate({ ...base, photos: [{ slot: "issue" }] }), null, "so is a photo");
  assert.equal(lineStatusGate({ ...base, note: "   " }), "Add a note or a photo so the office knows what's wrong.", "whitespace is not a note");
});

test("requirement 19: a key line needs BEFORE and AFTER before it can be Complete", () => {
  const g = (photos) => lineStatusGate({ status: LINE_STATUS.COMPLETE, checkedInToday: true, line: CAMERA, photos });
  assert.match(g([]), /before photo/);
  assert.match(g([{ slot: "before" }]), /after photo/);
  assert.equal(g([{ slot: "before" }, { slot: "after" }]), null);
  // A line that isn't a key line needs none.
  assert.equal(lineStatusGate({ status: LINE_STATUS.COMPLETE, checkedInToday: true, line: { needsPhotos: false }, photos: [] }), null);
  // …and the photo rule does not block flagging a problem or rewinding.
  assert.equal(lineStatusGate({ status: LINE_STATUS.INCOMPLETE, checkedInToday: true, line: CAMERA, photos: [] }), null);
});

test("the gate runs on the SERVER, not only in the popup", () => {
  const body = fnBody("setWoLineStatus");
  assert.ok(body.includes("const gate = lineStatusGate({"), "the action re-runs the same gate");
  assert.ok(body.includes("woCheckedInToday(doc.id, actorId, who, day)"), "check-in is resolved server-side");
  assert.ok(body.includes("woLineMediaFor(doc.id, line.key)"), "photos are counted from the rows, not from the client");
  assert.ok(body.includes("if (gate) return { error: gate }"), "and it refuses rather than half-applying");
  // The popup uses the same import, so a disabled button and a refused save always agree.
  assert.ok(field.includes('lineStatusGate } from "../../../lib/work-order-field"') || field.includes("lineStatusGate,"), "the popup imports the same gate");
});

test("marking a line writes the state, the log and the credits in ONE transaction", () => {
  const body = fnBody("setWoLineStatus");
  assert.ok(body.includes('db.exec("BEGIN")') && body.includes('db.exec("ROLLBACK")'), "transactional");
  assert.ok(/UPDATE wo_lines SET status=\?, steps_done=\?/.test(body), "state");
  assert.ok(/INSERT OR IGNORE INTO wo_events[\s\S]*?'status'/.test(body), "the log (requirement 20)");
  // The credits split the LINE's money (qty × payout), not the per-unit figure. Crediting `line.payout`
  // on a six-camera line pays a sixth of the work — caught live on 2026-11-19, pinned here.
  assert.ok(body.includes("creditsForAdvance(line.kind, from, to, line.total, rates)"), "the credits split the line total (decision B)");
  assert.ok(!/creditsForAdvance\([^)]*line\.payout/.test(body), "never the per-unit payout");
  assert.ok(/owner_id=COALESCE\(owner_id,\?\)/.test(body), "the first person to touch a line owns it");
  assert.ok(body.includes("DELETE FROM wo_line_credits WHERE wo_id=? AND line_key=? AND day_log_id IS NULL"), "rewinding removes credits that are not yet locked into a day");
});

test("requirement 20: the log records who, what, which line, and when", () => {
  const d = fresh();
  d.prepare("INSERT INTO wo (project_access_id, payload) VALUES ('P1','{}')").run();
  const id = Number(d.prepare("SELECT id FROM wo").get().id);
  d.prepare("INSERT INTO wo_events (wo_id, line_key, action, from_status, to_status, actor_id, actor_name, client_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, "c1", "status", "incomplete", "complete", 5, "Tech A", "2026-03-01T14:05:00.000Z");
  const e = d.prepare("SELECT * FROM wo_events WHERE wo_id=?").get(id);
  assert.equal(e.actor_name, "Tech A");
  assert.equal(e.line_key, "c1");
  assert.equal(e.to_status, "complete");
  assert.ok(e.at, "the server time is stamped as well as the device's");
  assert.equal(e.client_at, "2026-03-01T14:05:00.000Z");
});

test("requirement 21: a replayed tap is one act, however many times it arrives", () => {
  const d = fresh();
  d.prepare("INSERT INTO wo (project_access_id, payload) VALUES ('P1','{}')").run();
  const id = Number(d.prepare("SELECT id FROM wo").get().id);
  const ins = d.prepare("INSERT OR IGNORE INTO wo_events (wo_id, line_key, action, to_status, actor_name, client_at) VALUES (?,?,'status',?,?,?)");
  for (let i = 0; i < 4; i++) ins.run(id, "c1", "complete", "Tech A", "2026-03-01T14:05:00.000Z");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM wo_events WHERE wo_id=?").get(id).n, 1, "four sends, one event");
  // And setWoLineStatus short-circuits on the same key, so the credits are never written twice.
  const body = fnBody("setWoLineStatus");
  assert.ok(/SELECT 1 FROM wo_events WHERE wo_id=\? AND line_key=\? AND action='status' AND actor_name=\? AND client_at=\?/.test(body), "it checks before it writes");
  assert.ok(body.includes("if (seen) return { ok: true, replayed: true }"), "a replay is a success, not an error");
});

test("the queue is validated, ordered oldest-first, and keyed without an actor", () => {
  assert.equal(normalizeOp({ action: "nope", clientAt: "2026-03-01T14:05:00.000Z" }).error, "Unknown action.");
  assert.equal(normalizeOp({ action: "status", lineKey: "c1", status: "complete", clientAt: "yesterday" }).error, "Bad timestamp.");
  assert.equal(normalizeOp({ action: "status", status: "complete", clientAt: "2026-03-01T14:05:00.000Z" }).error, "Missing line.");
  assert.equal(normalizeOp({ action: "status", lineKey: "c1", status: "done", clientAt: "2026-03-01T14:05:00.000Z" }).error, "Unknown status.");
  const good = normalizeOp({ action: "status", lineKey: "c1", status: "complete", clientAt: "2026-03-01T14:05:00.000Z", note: "x" });
  assert.equal(good.error, undefined);
  assert.equal(good.op.lineKey, "c1");
  // Oldest first — a queue replayed backwards lands the step credits on the wrong taps.
  const q = sortQueue([{ clientAt: "2026-03-01T15:00:00.000Z" }, { clientAt: "2026-03-01T14:00:00.000Z" }]);
  assert.equal(q[0].clientAt, "2026-03-01T14:00:00.000Z");
  // The phone's key must match what the server echoes back, or the queue never drains.
  assert.equal(opKey({ lineKey: "c1", action: "status", clientAt: "T" }), "c1|status|T");
  assert.ok(queue.includes('export const opKeyOf = (op) => [op.lineKey || "", op.action || "", op.clientAt || ""].join("|")'), "the client key is identical");
  assert.ok(!/actorName/.test(queue.split("opKeyOf")[1].slice(0, 200)), "the device never sends an actor");
});

test("the field view never loses a tap and shows when work is waiting", () => {
  // Queue first, send second — that order is the requirement.
  const i = field.indexOf("async function mark(");
  const body = field.slice(i, field.indexOf("\n  }", i));
  assert.ok(body.indexOf("await enqueue(") < body.indexOf("await setLineStatusAction("), "the op is written to the device BEFORE it is sent");
  assert.ok(/catch \{\s*\n\s*setErr\(null\);/.test(body), "offline is not an error — the op stays queued");
  assert.ok(field.includes("pending sync"), "and the technician can see it is waiting");
  assert.ok(field.includes('window.addEventListener("online", on)'), "it replays when the signal returns");
  assert.ok(queue.includes('from "./idb-store"'), "IndexedDB, not localStorage — a long day is hundreds of ops");
  // A photo is uploaded before its URL is stored; a data: URL is refused server-side too.
  assert.ok(field.includes('fetch("/api/media"'), "photos go through /api/media");
  assert.ok(fnBody("addWoLineMedia").includes('if (!url || /^data:/i.test(url)) return { error: "Upload the photo first." }'), "a data: URL never reaches a row");
});

test("requirement 18: a flag notifies the OFFICE, never the customer", () => {
  const i = actions.indexOf("export async function setLineStatusAction");
  const body = actions.slice(i, actions.indexOf("\nexport ", i + 10));
  assert.ok(body.includes('notifyRoles(["admin", "manager"]'), "admin and manager only");
  // The only "customer" in this action is the job's NAME, used to title the office's notification.
  // Nothing addresses the customer: no customer role in notifyRoles, no customer email, no portal flag.
  assert.ok(!/notifyRoles\([^)]*customer/.test(body), "the customer is never notified");
  assert.ok(!/email|getCustomerUserForProject|createNotification\(\s*\{\s*user_id/.test(body), "no customer-facing message of any kind");
  assert.ok(body.includes('if (status === "attention" && !r.replayed)'), "and a replay does not re-notify");
});

test("the actor is always the session, never the client", () => {
  assert.ok(actions.includes("const who = (tok) => ({ actorId: tok.id ?? null, actorName: actorName(tok) })"), "derived from the token");
  for (const name of ["checkInAction", "setLineStatusAction", "addLinePhotoAction", "syncFieldQueueAction"]) {
    const i = actions.indexOf(`export async function ${name}`);
    const head = actions.slice(i, actions.indexOf("\n}", i));
    assert.match(head, /await gate\(accessId, "wo\./, `${name} is capability-gated`);
    assert.ok(/who\(g\.tok\)|actorName\(g\.tok\)/.test(head), `${name} takes the actor from the session`);
    // Whatever the client sends is destructured explicitly; an actor is never among the fields.
    const params = head.slice(head.indexOf("("), head.indexOf(")") + 1);
    assert.ok(!/actor|byName|userId|signedBy/i.test(params), `${name} accepts no actor from the client`);
  }
});

// ---- Unassigned check-in (Stage 3 addendum, owner 2026-11-19) --------------------------------
// A technician can open a project link, PIN in as themselves, and start work on a job nobody put them
// on. The work is real and is recorded; the MONEY waits for an admin.

test("identity comes from the login, never from the link", () => {
  // A staff PIN login mints that person's own session (actions.js), so tok.id/tok.name are theirs.
  const pinLogin = read("../app/project/[accessId]/actions.js");
  assert.ok(pinLogin.includes("const staffUser = findInternalUserByPin(entered)") && pinLogin.includes("makeToken(staffUser)"),
    "a staff PIN is a real login as that person");
  // The other grant — a project-scoped tech PIN off the link — is anonymous, and is refused: work
  // recorded under nobody is work nobody can be paid for.
  assert.ok(actions.includes("function identified(tok)") && /tok\.viaPin && tok\.id == null/.test(actions), "the anonymous link grant is detected");
  for (const name of ["checkInAction", "setLineStatusAction", "addLinePhotoAction", "syncFieldQueueAction"]) {
    const i = actions.indexOf(`export async function ${name}`);
    const head = actions.slice(i, actions.indexOf("\nexport ", i + 10));
    assert.ok(/const anon = identified\(g\.tok\);\s*\n\s*if \(anon\) return \{ error: anon \}/.test(head), `${name} refuses an anonymous grant`);
  }
});

test("an unassigned arrival is flagged, notified once, and its money held", () => {
  const d = fresh();
  d.prepare("INSERT INTO wo (project_access_id, payload) VALUES ('P1','{}')").run();
  const id = Number(d.prepare("SELECT id FROM wo").get().id);
  d.prepare("INSERT INTO wo_checkins (wo_id, user_id, name, day, assigned, device) VALUES (?,?,?,?,?,?)").run(id, 9, "Rogue Tech", "2026-03-01", 0, "iPhone");
  const c = d.prepare("SELECT * FROM wo_checkins WHERE wo_id=?").get(id);
  assert.equal(c.assigned, 0);
  assert.equal(c.decision, null, "undecided until an admin says otherwise");
  assert.equal(c.device, "iPhone", "the log keeps the device");

  // woCheckIn only raises the prompt on the FIRST arrival of a day — a second tap is the same arrival.
  const body = fnBody("woCheckIn");
  assert.ok(body.includes("if (existing) return { ok: true, day: d, first: false"), "a repeat tap reports first: false");
  const act = actions.slice(actions.indexOf("export async function checkInAction"), actions.indexOf("\nexport ", actions.indexOf("export async function checkInAction") + 10));
  assert.ok(/if \(!assigned && r\.first\)/.test(act), "the office is pinged once, not on every tap");
  assert.ok(act.includes('notifyRoles(["admin", "manager"]'), "and only the office is pinged");
  assert.ok(act.includes("woIsAssigned(accessId,"), "assignment is resolved server-side, not claimed by the client");
});

test("pending work does not reach payroll until an admin decides", () => {
  const body = fnBody("woWorkIsPending");
  assert.ok(body.includes('return !c.assigned && c.decision !== "assigned"'), "assigned, or decided assigned, is the only way out of pending");
  assert.ok(body.includes("if (!c) return false"), "no check-in at all is not 'pending' — the gate refuses that work anyway");
  // And the credit carries the flag at the moment it is written.
  const st = fnBody("setWoLineStatus");
  assert.ok(st.includes("const pending = woWorkIsPending(doc.id, { userId: actorId, name: who, day })"), "resolved per write");
  assert.ok(/ins\.run\(doc\.id, line\.key, actorId, who, 0, c\.amount, who, pending \? 1 : 0\)/.test(st), "and stored on the credit");
  assert.ok(st.includes('JSON.stringify({ assigned: !pending })'), "the log records assigned yes/no");
});

test("Assign releases the money; Reject voids it and keeps the record", () => {
  const d = fresh();
  d.prepare("INSERT INTO wo (project_access_id, payload) VALUES ('P1','{}')").run();
  const id = Number(d.prepare("SELECT id FROM wo").get().id);
  const credit = (name, amt, pending) => d.prepare("INSERT INTO wo_line_credits (wo_id, line_key, name, share, amount, pending) VALUES (?,?,?,?,?,?)").run(id, "c1", name, 0, amt, pending);
  credit("Rogue Tech", 10, 1); credit("Rogue Tech", 18, 1); credit("Crew Tech", 12, 0);

  // Assign — their pending credits become payable; nobody else's are touched.
  d.prepare("UPDATE wo_line_credits SET pending=0 WHERE wo_id=? AND name=? COLLATE NOCASE AND pending=1 AND voided_at IS NULL").run(id, "Rogue Tech");
  const payable = d.prepare("SELECT ROUND(SUM(amount),2) s FROM wo_line_credits WHERE wo_id=? AND pending=0 AND voided_at IS NULL").get(id).s;
  assert.equal(payable, 40, "10 + 18 released, plus the crew tech's 12");

  // Reject — on a second rogue, the credits are voided but the rows stay for the record.
  credit("Other Tech", 25, 1);
  d.prepare("UPDATE wo_line_credits SET voided_at=datetime('now','localtime') WHERE wo_id=? AND name=? COLLATE NOCASE AND voided_at IS NULL AND day_log_id IS NULL").run(id, "Other Tech");
  const after = d.prepare("SELECT ROUND(SUM(amount),2) s FROM wo_line_credits WHERE wo_id=? AND pending=0 AND voided_at IS NULL").get(id).s;
  assert.equal(after, 40, "a rejected credit adds nothing");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM wo_line_credits WHERE wo_id=? AND name='Other Tech'").get(id).n, 1, "and is still in the record");

  // A credit already locked into a paid day is never voided retroactively.
  const bodyD = fnBody("woDecideCheckin");
  assert.ok(bodyD.includes("AND day_log_id IS NULL"), "a locked day is not reopened by a Reject");
  assert.ok(bodyD.includes('db.exec("ROLLBACK")'), "transactional");
  assert.ok(bodyD.includes('"checkin_decision"'), "and the decision itself is logged");
});

test("'Not now' changes nothing except the log", () => {
  const body = fnBody("woDecideCheckin");
  const notNow = body.slice(body.indexOf('if (decision === "not_now")'), body.indexOf('db.exec("BEGIN")'));
  assert.ok(notNow.includes("wo_events"), "it is logged");
  assert.ok(!/UPDATE wo_checkins|UPDATE wo_line_credits/.test(notNow), "and nothing else moves — the prompt stays");
});

test("Assign puts the technician on the crew, which is what adds them to the install event", () => {
  const i = actions.indexOf("export async function decideCheckinAction");
  const body = actions.slice(i, actions.indexOf("\nexport ", i + 10));
  assert.ok(body.includes('await gate(accessId, "assignment.edit")'), "changing the crew needs the crew capability");
  assert.ok(body.includes("addProjectAssignment(accessId,"), "Assign adds the assignment");
  assert.ok(body.includes("const already = getProjectAssignments(accessId).some("), "pressing it twice is a no-op");
  // The scheduler invites from the assignments it is handed, so the event follows from the crew.
  const sched = read("../app/project/[accessId]/scheduling-widget.jsx");
  assert.ok(/assignments\.forEach\(a => \{ const nm = /.test(sched), "the installation event invites the crew");
});

test("the office sees who is on site; the technician sees only their own banner", () => {
  const crew = read("../app/project/[accessId]/work-order-crew.jsx");
  assert.ok(crew.includes("On site today"), "the checked-in list");
  assert.ok(/clock\(c\.in_at\)/.test(crew), "with the time each person arrived");
  assert.ok(crew.includes("isn't on this job."), "and the prompt naming them");
  for (const b of ["Not now", "Reject", "Assign"]) assert.ok(crew.includes(`>${b}<`), `the ${b} button`);
  assert.ok(/canDecide \? \(doc\.pendingCheckins \|\| \[\]\) : \[\]/.test(crew), "only the office is offered the decision");
  // The technician's own view says it plainly and does not list anyone else.
  assert.ok(field.includes("You're not assigned to this job — admin has been notified."), "the technician's banner");
  assert.ok(!/pendingCheckins/.test(field), "a technician is never shown the queue of other people");
  const editor = read("../app/project/[accessId]/work-order-editor.jsx");
  assert.ok(/<WorkOrderCrew[\s\S]{0,160}canDecide=\{canAssign\}/.test(editor), "the decision is gated on assignment.edit");
});

test("progress counts steps, not opinions", () => {
  const lines = [
    { kind: "camera", state: { steps_done: 5, status: "complete" } },
    { kind: "camera", state: { steps_done: 2, status: "incomplete" } },
    { kind: "nvr", state: { steps_done: 0, status: "attention" } },
  ];
  const p = fieldProgress(lines);
  assert.equal(p.total, 5 + 5 + 3);
  assert.equal(p.done, 7);
  assert.equal(p.complete, 1);
  assert.equal(p.attention, 1);
  assert.equal(p.allDone, false);
  assert.equal(fieldProgress([{ kind: "labor", state: { steps_done: 1, status: "complete" } }]).allDone, true);
  assert.equal(fieldProgress([]).pct, 0, "no lines is not 100%");
});
