// Work order Stage 4 (docs/WORK_ORDERS.md): End of day, the 8 PM reminder, customer sign-off,
// closing, reassigning a line's pay, and payroll. The SQL is lifted out of lib/db.js and executed.
//
// The rule these tests exist to protect: a LOCKED day is frozen money. Editing a payout tomorrow must
// never restate a week somebody has already been paid for.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
// lib/wo-notify.js is NOT imported: it pulls in lib/email.js, which uses extensionless imports that
// Next's bundler resolves and plain `node --test` does not. Its two constants are read from the source
// instead, so a change to either still breaks this test.

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const actions = read("../app/project/[accessId]/work-order-actions.js");
const closeout = read("../app/project/[accessId]/work-order-closeout.jsx");
const payroll = read("../app/payroll/payroll-client.jsx");
const payrollPage = read("../app/payroll/page.jsx");
const reminders = read("../lib/wo-notify.js");
const gateway = read("../app/project/[accessId]/gateway-client.jsx");
const constOf = (name) => {
  const m = new RegExp(`export const ${name} = (\\d+)`).exec(reminders);
  assert.ok(m, `${name} exported`);
  return Number(m[1]);
};
const EOD_AFTER_HOURS = constOf("EOD_AFTER_HOURS");
const SIGNOFF_CHASE_HOURS = constOf("SIGNOFF_CHASE_HOURS");
const instrumentation = read("../instrumentation.js");
const shell = read("../app/components/admin-shell.jsx");

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
// Columns added to a table AFTER its CREATE, via db.js's ensure-column pattern. A real database has
// them; a table built from the bare DDL does not — so they are lifted the same way the DDL is, and a
// renamed column breaks this test instead of silently passing.
function ensureCols(d, table) {
  for (const m of db.matchAll(new RegExp(`ALTER TABLE ${table} ADD COLUMN (\\w+) ([A-Z ]+(?:NOT NULL DEFAULT \\S+)?)`, "g"))) {
    try { d.exec(`ALTER TABLE ${table} ADD COLUMN ${m[1]} ${m[2].trim()}`); } catch { /* already in the DDL */ }
  }
  // The loop form: `for (const [c, t] of [["paid_at", "TEXT"], …]) … ALTER TABLE x ADD COLUMN ${c} ${t}`
  const loop = new RegExp(`for \\(const \\[c, t\\] of (\\[\\[[\\s\\S]*?\\]\\])\\)[\\s\\S]{0,160}ALTER TABLE ${table} ADD COLUMN`).exec(db);
  if (loop) for (const [c, t] of JSON.parse(loop[1])) { try { d.exec(`ALTER TABLE ${table} ADD COLUMN ${c} ${t}`); } catch {} }
}
function fresh() {
  const d = new DatabaseSync(":memory:");
  for (const t of ["wo", "wo_lines", "wo_checkins", "wo_events", "wo_day_logs", "wo_line_credits", "wo_signatures"]) { d.exec(ddl(t)); ensureCols(d, t); }
  // A stub for payroll's LEFT JOIN only — `company_name` is an ensure-column on the real table, so
  // lifting that DDL would give a projects table without it.
  d.exec("CREATE TABLE projects (access_id TEXT PRIMARY KEY, company_name TEXT, customer TEXT)");
  d.prepare("INSERT INTO wo (project_access_id, payload, version, status) VALUES ('P1','{}',1,'sent')").run();
  d.prepare("INSERT OR IGNORE INTO projects (access_id, company_name) VALUES ('P1','Granite Fitness')").run();
  return { d, id: Number(d.prepare("SELECT id FROM wo").get().id) };
}
// closeWoDay's statements, in its order.
function endDay(d, id, { name, userId = null, day }) {
  const credits = d.prepare("SELECT id, line_key, amount FROM wo_line_credits WHERE wo_id=? AND name=? COLLATE NOCASE AND day_log_id IS NULL AND pending=0 AND voided_at IS NULL AND date(set_at)=?").all(id, name, day);
  const total = Math.round(credits.reduce((s, c) => s + (+c.amount || 0), 0) * 100) / 100;
  const lines = new Set(credits.map((c) => c.line_key)).size;
  const r = d.prepare("INSERT INTO wo_day_logs (wo_id, user_id, name, day, lines_completed, payout_total, locked_by) VALUES (?,?,?,?,?,?,?)").run(id, userId, name, day, lines, total, name);
  const logId = Number(r.lastInsertRowid);
  for (const c of credits) d.prepare("UPDATE wo_line_credits SET day_log_id=? WHERE id=?").run(logId, c.id);
  return { logId, lines, total };
}
const credit = (d, id, { line = "c1", name, amount, pending = 0, day = null, voided = null }) =>
  d.prepare("INSERT INTO wo_line_credits (wo_id, line_key, name, share, amount, pending, voided_at, set_at) VALUES (?,?,?,?,?,?,?,COALESCE(?, datetime('now','localtime')))")
    .run(id, line, name, 0, amount, pending, voided, day ? `${day} 12:00:00` : null);

test("End of day banks the day and locks it; it does NOT close the work order", () => {
  const { d, id } = fresh();
  credit(d, id, { name: "Tech A", amount: 10, day: "2026-03-01" });
  credit(d, id, { name: "Tech A", amount: 18, day: "2026-03-01", line: "c2" });
  credit(d, id, { name: "Tech A", amount: 99, day: "2026-03-02" });          // tomorrow's work
  credit(d, id, { name: "Tech B", amount: 50, day: "2026-03-01" });          // someone else's

  const r = endDay(d, id, { name: "Tech A", day: "2026-03-01" });
  assert.equal(r.total, 28, "only this person's credits, only this day");
  assert.equal(r.lines, 2);
  assert.equal(d.prepare("SELECT status FROM wo WHERE id=?").get(id).status, "sent", "the work order stays open — installs run over days");
  const locked = d.prepare("SELECT COUNT(*) n FROM wo_line_credits WHERE wo_id=? AND day_log_id IS NOT NULL").get(id).n;
  assert.equal(locked, 2);
  assert.ok(!fnBody("closeWoDay").includes("UPDATE wo SET status"), "closing a day never touches the work order's status");
});

test("pending and voided money is not banked", () => {
  const { d, id } = fresh();
  credit(d, id, { name: "Rogue", amount: 10, pending: 1, day: "2026-03-01" });
  credit(d, id, { name: "Rogue", amount: 7, day: "2026-03-01", voided: "2026-03-01 13:00:00" });
  credit(d, id, { name: "Rogue", amount: 5, day: "2026-03-01" });
  const r = endDay(d, id, { name: "Rogue", day: "2026-03-01" });
  assert.equal(r.total, 5, "an unassigned tech's held pay and a rejected credit both stay out");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM wo_line_credits WHERE wo_id=? AND day_log_id IS NULL").get(id).n, 2, "and stay unlocked");
});

test("a day can only be closed once", () => {
  const { d, id } = fresh();
  d.prepare("INSERT INTO wo_day_logs (wo_id, user_id, name, day, lines_completed, payout_total) VALUES (?,?,?,?,?,?)").run(id, 5, "Tech A", "2026-03-01", 1, 10);
  assert.throws(() => d.prepare("INSERT INTO wo_day_logs (wo_id, user_id, name, day, lines_completed, payout_total) VALUES (?,?,?,?,?,?)").run(id, 5, "Tech A", "2026-03-01", 2, 20), /UNIQUE|constraint/i);
  assert.ok(fnBody("closeWoDay").includes('return { error: "That day is already closed." }'), "and the helper says so plainly");
});

test("a locked day is frozen: a later payout edit cannot restate it", () => {
  const { d, id } = fresh();
  credit(d, id, { name: "Tech A", amount: 28, day: "2026-03-01" });
  const r = endDay(d, id, { name: "Tech A", day: "2026-03-01" });
  // Payroll reads the LOG's figure, not the credits.
  assert.ok(fnBody("payrollForPeriod").includes("l.payout_total"), "payroll reads the locked figure");
  assert.ok(!/creditsForAdvance|line\.total/.test(fnBody("payrollForPeriod")), "it never recomputes from the current payouts");
  // Reassigning a line leaves locked credits alone.
  const re = fnBody("reassignWoLineCredit");
  assert.ok(re.includes("DELETE FROM wo_line_credits WHERE wo_id=? AND line_key=? AND day_log_id IS NULL"), "only unlocked credits are replaced");
  assert.ok(re.includes('if (earned <= 0) return { error: "Everything on this line is already in a closed day." }'), "and a fully-paid line refuses");
  assert.equal(d.prepare("SELECT payout_total FROM wo_day_logs WHERE id=?").get(r.logId).payout_total, 28);
});

test("requirement 26: a line can be reassigned or split, and the parts add up exactly", () => {
  const body = fnBody("reassignWoLineCredit");
  assert.ok(/Math\.abs\(sum - 1\) > 0\.001/.test(body), "the shares must total 100%");
  assert.ok(body.includes("i === list.length - 1 ? Math.round(left * 100) / 100"), "the last share absorbs the rounding, so nothing is invented or lost");
  assert.ok(body.includes('"credit_reassigned"'), "and it is logged");
  // A 50/50 on an odd amount still sums to the line.
  const earned = 10.05, shares = [0.5, 0.5];
  let left = earned;
  const parts = shares.map((s, i) => { const a = i === shares.length - 1 ? Math.round(left * 100) / 100 : Math.round(earned * s * 100) / 100; left = Math.round((left - a) * 100) / 100; return a; });
  assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100, earned);
});

test("the end-of-day nudge follows the ARRIVAL, 12 hours later, once per check-in", () => {
  const { d, id } = fresh();
  d.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT)");
  const now = new Date("2026-03-01T20:00:00Z");
  const ago = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const ci = d.prepare("INSERT INTO wo_checkins (wo_id, user_id, name, day, in_at) VALUES (?,?,?,?,?)");
  ci.run(id, 5, "Early Tech", "2026-03-01", ago(13));   // 13h ago, day open      → due
  ci.run(id, 6, "Recent Tech", "2026-03-01", ago(3));   // 3h ago                 → not yet
  ci.run(id, 7, "Done Tech", "2026-03-01", ago(14));    // 14h ago but day closed → never
  d.prepare("INSERT INTO wo_day_logs (wo_id, user_id, name, day, lines_completed, payout_total) VALUES (?,?,?,?,?,?)").run(id, 7, "Done Tech", "2026-03-01", 1, 10);

  // woCheckinsNeedingEodReminder's query, lifted.
  const cutoff = ago(EOD_AFTER_HOURS);
  const due = () => d.prepare(`
    SELECT c.id, c.name FROM wo_checkins c JOIN wo w ON w.id = c.wo_id
    WHERE c.eod_reminded_at IS NULL AND c.in_at <= ? AND w.status != 'closed'
      AND NOT EXISTS (SELECT 1 FROM wo_day_logs l WHERE l.wo_id = c.wo_id AND l.user_id IS c.user_id AND l.day = c.day)
  `).all(cutoff);
  assert.equal(EOD_AFTER_HOURS, 12, "12 hours after they arrived, not 8 PM");
  assert.deepEqual(due().map((r) => r.name), ["Early Tech"], "only the one who is overdue and still open");

  // Claim-once per CHECK-IN: the stamp is a conditional UPDATE taken before the send, so two
  // overlapping sweeps cannot both win. This is also why it no longer leans on wo_events' UNIQUE
  // constraint, where a NULL line_key never collides.
  const stamp = (cid) => d.prepare("UPDATE wo_checkins SET eod_reminded_at=datetime('now','localtime') WHERE id=? AND eod_reminded_at IS NULL").run(cid).changes > 0;
  const first = due()[0].id;
  assert.equal(stamp(first), true);
  assert.equal(stamp(first), false, "the second sweep sends nothing");
  assert.equal(due().length, 0, "and it drops out of the query");
  assert.ok(fnBody("stampWoCheckinReminded").includes("AND eod_reminded_at IS NULL"), "the claim is the UPDATE itself");
  // Both the technician and the office are told; the office can close it for them.
  assert.ok(reminders.includes("createNotification({") && reminders.includes('notifyRoles(["admin", "manager"]'), "both are notified");
  assert.ok(instrumentation.includes("sweepEndOfDayReminders") && instrumentation.includes("60 * 60 * 1000"), "hourly, on the existing boot scheduler");
  assert.ok(!/8 PM|EOD_HOUR|isEodWindow/.test(instrumentation), "the fixed-hour sweep is gone");
});

test("the customer is ASKED to sign off, chased once a day later, and never blocked on", () => {
  const { d, id } = fresh();
  const now = new Date("2026-03-02T12:00:00Z");
  const ago = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  d.prepare("UPDATE wo SET signoff_requested_at=? WHERE id=?").run(ago(26), id);
  const chase = () => d.prepare(`
    SELECT w.id FROM wo w
    WHERE w.signoff_requested_at IS NOT NULL AND w.signoff_requested_at <= ? AND w.signoff_reminded_at IS NULL
      AND w.status != 'closed'
      AND NOT EXISTS (SELECT 1 FROM wo_signatures s WHERE s.wo_id = w.id AND s.party='customer' AND s.voided_at IS NULL)
  `).all(ago(SIGNOFF_CHASE_HOURS));
  assert.equal(SIGNOFF_CHASE_HOURS, 24);
  assert.equal(chase().length, 1, "asked 26 hours ago, not signed, not chased");
  assert.equal(d.prepare("UPDATE wo SET signoff_reminded_at=datetime('now','localtime') WHERE id=? AND signoff_reminded_at IS NULL").run(id).changes, 1);
  assert.equal(chase().length, 0, "chased once, never again");
  // A signature stops the chase even if the stamp was never taken.
  d.prepare("UPDATE wo SET signoff_reminded_at=NULL WHERE id=?").run(id);
  d.prepare("INSERT INTO wo_signatures (wo_id, version, name, party) VALUES (?,1,'Customer','customer')").run(id);
  assert.equal(chase().length, 0, "someone who has signed is never chased");

  // Resending restarts the clock rather than chasing twice for one ask.
  const mark = fnBody("markWoSignoffRequested");
  assert.ok(mark.includes("signoff_reminded_at=NULL"), "a resend clears the chase stamp");
  assert.ok(mark.includes('again ? "signoff_resent" : "signoff_requested"'), "and the log says which it was");
  // The first ask is automatic: the moment the last line completes.
  assert.ok(/after\?\.progress\?\.allDone && !after\.signoffRequestedAt/.test(actions), "asked once, when the work finishes");
  assert.ok(/await sendSignoffRequest\(accessId\)\.catch\(\(\) => \{\}\)/.test(actions), "and a failed send never breaks marking a line");
});

test("email and text are honest about whether they actually went", () => {
  const sms = read("../lib/sms.js");
  assert.ok(sms.includes("export function smsEnabled()") && sms.includes("TWILIO_SMS_FROM"), "SMS needs a from-number the vault can hold");
  assert.ok(sms.includes('return { ok: false, reason: "not-configured" }'), "and says so when it hasn't got one");
  assert.ok(!/throw/.test(sms.replace(/^\s*\/\/.*$/gm, "")), "a failed text never throws into the action that asked for it");
  assert.ok(reminders.includes('out.email = { ok: false, reason: "email-not-configured" }'), "same for email");
  // The office is told which channels carried it, so a dormant key never reads as a sent text.
  assert.ok(actions.includes("sent: { email: !!sent?.email?.ok, sms: !!sent?.sms?.ok }"), "the action reports per channel");
  assert.ok(closeout.includes("email and text aren't switched on"), "and the UI says so plainly");
  // The portal notification always goes — it needs no key.
  assert.ok(reminders.includes("createNotification({") && reminders.includes("getCustomerUserForProject"), "the in-app ask always lands");
});

test("closing WITHOUT a signature needs the after photos instead, and says so in the log", () => {
  const body = fnBody("closeWorkOrder");
  assert.ok(body.includes("if (!auto && !signed)"), "the check is only for an unsigned manual close");
  assert.ok(body.includes("woMissingAfterPhotos(doc)"), "every photo-required line must have its after shot");
  assert.ok(/No customer signature, so every line needs its after photo/.test(body), "and the refusal names them");
  const miss = fnBody("woMissingAfterPhotos");
  assert.ok(miss.includes("l.needsPhotos && !(l.photos || []).some((p) => p.slot === \"after\")"), "after, specifically — a before shot is not proof it was finished");
  // The log distinguishes the three ways a job ends.
  assert.ok(body.includes('`Closed by ${byName || "office"} — no customer signature`'), "the owner's wording");
  assert.ok(body.includes('`Closed by ${byName || "office"} — customer signed`') && body.includes('"auto · customer signed"'), "and the other two");
  assert.ok(body.includes("logProjectEvent(accessId,"), "it reaches the project's activity log too");
});

test("a paid period is final: no reassign, no second payment, no edit", () => {
  const { d, id } = fresh();
  d.prepare("INSERT INTO wo_day_logs (wo_id, user_id, name, day, lines_completed, payout_total) VALUES (?,?,?,?,?,?)").run(id, 5, "Tech A", "2026-03-01", 2, 28);
  const logId = Number(d.prepare("SELECT id FROM wo_day_logs").get().id);
  d.prepare("INSERT INTO wo_line_credits (wo_id, line_key, name, share, amount, day_log_id) VALUES (?,?,?,?,?,?)").run(id, "c1", "Tech A", 0, 28, logId);

  // Paying is a conditional UPDATE, so a second press changes nothing.
  const pay = () => d.prepare("UPDATE wo_day_logs SET paid_at=datetime('now','localtime'), pay_batch='b1' WHERE id=? AND paid_at IS NULL").run(logId).changes;
  assert.equal(pay(), 1);
  assert.equal(pay(), 0, "a day can never be paid twice");
  assert.ok(fnBody("payrollMarkPaid").includes("AND paid_at IS NULL"), "the guard is in the UPDATE, not the UI");
  assert.ok(fnBody("payrollMarkPaid").includes('if (!unpaid.length) return { error: "That period is already paid." }'), "and the period refuses up front");

  // And the line can no longer be reassigned.
  const paidLine = d.prepare("SELECT 1 FROM wo_line_credits c JOIN wo_day_logs l ON l.id = c.day_log_id WHERE c.wo_id=? AND c.line_key=? AND l.paid_at IS NOT NULL").get(id, "c1");
  assert.ok(paidLine, "woLinePaid sees it");
  assert.ok(fnBody("reassignWoLineCredit").includes("if (woLinePaid(doc.id, line.key)) return"), "a reassign refuses");
  // Undo exists for a mistake, and only for a whole batch.
  assert.ok(fnBody("payrollUnmarkPaid").includes("WHERE pay_batch=?"), "undo is per batch");
});

test("payroll shows Paid / Unpaid per period and records who paid, when and how", () => {
  const body = fnBody("payrollForPeriod");
  assert.ok(body.includes("if (r.paid_at)") && body.includes("t.unpaid"), "paid and unpaid are split per technician");
  // …which needs those columns to actually be SELECTED. They were not, so every period read as unpaid
  // however many had been paid. Caught live 2026-11-19.
  assert.ok(/l\.paid_at, l\.paid_by, l\.paid_method, l\.paid_note, l\.pay_batch/.test(body), "the payment columns are in the projection");
  assert.ok(body.includes('state: t.unpaid <= 0.004 ? "paid" : t.paid > 0.004 ? "part" : "unpaid"'), "three states — a mixed period is not 'paid'");
  assert.ok(body.includes("batches: [...t.batches]"), "a Set never crosses to a client component");
  assert.ok(payroll.includes("Mark {money(t.unpaid)} paid") && payroll.includes("function PayForm"), "date, method and note");
  assert.ok(payroll.includes('rows.push([t.name, l.day, l.project, l.lines_completed, (+l.payout_total || 0).toFixed(2), l.locked_at, l.locked_by, l.paid_at || "", l.paid_method || "", l.note])'), "the export carries the payment too");
  const payActions = read("../app/payroll/actions.js");
  assert.ok(payActions.includes('can(tok.role, "payroll.export")'), "only an admin records a payment");
  assert.ok(payActions.includes('recordEvent("payroll_paid"'), "and it is logged as a money event");
});

test("the Portal V2 customer sees the sign-off card — and still nothing else of the work order", () => {
  const portalLib = read("../lib/customer-portal.js");
  const portal = read("../app/project/[accessId]/customer-portal.jsx");
  assert.ok(/signoff:\s+!!\(ctx\.woSignoff\?\.allDone \|\| ctx\.woSignoff\?\.signed\)/.test(portalLib), "available when the work is done, or once signed");
  assert.ok(portalLib.includes('"addendum", "signoff", "closeout"'), "ordered after Installation, before the walkthrough");
  assert.ok(portalLib.includes('signoff: ctx.woSignoff?.signed ? "signed" : "awaiting"'), "the card's state");
  assert.ok(/PORTAL_VIEWS[\s\S]{0,200}"signoff"/.test(portalLib) && /OVERLAY_VIEWS[\s\S]{0,200}"signoff"/.test(portalLib), "and it is a real, deep-linkable overlay");
  assert.ok(portal.includes('signoff:    { title: "Sign Off"'), "card copy");
  // The portal is handed the six-field read, never the work order.
  assert.ok(gateway.includes("const refreshWoSignoff = () =>") && gateway.includes("getWorkOrderSignoffAction(project.access_id)"), "the narrow read feeds it");
  assert.ok(/woSignoff,\s*\n\s*\};/.test(gateway), "and that is what portalCtx carries");
  assert.ok(!/portalCtx[\s\S]{0,400}(payout|dayLogs|checkins)/.test(gateway), "no work-order internals reach the portal context");
  // Both portals mount the SAME narrow component, so V1 and V2 cannot drift.
  const v2 = gateway.slice(gateway.indexOf("const renderPortalOverlay"), gateway.indexOf("const renderPortalOverlay") + 900);
  assert.ok(v2.includes('case "signoff":') && v2.includes("<WorkOrderSignoff"), "V2 overlay");
  assert.ok(gateway.includes("<WorkOrderSignoff accessId={lp.access_id} preview={!!previewRole}"), "V1 deck mount is unchanged");
});

test("the office can end a day for someone else; a technician can only end their own", () => {
  const i = actions.indexOf("export async function endDayAction");
  const body = actions.slice(i, actions.indexOf("\nexport ", i + 10));
  assert.ok(body.includes('const office = can(g.tok.role, "wo.edit")'), "who may act for someone else");
  assert.ok(body.includes("const name = office && forName ? String(forName) : me.actorName"), "a technician's forName is ignored");
  assert.ok(body.includes("byName: me.actorName"), "and the log records who actually pressed it");
});

test("requirement 24: the customer signs off only when every line is complete", () => {
  const body = fnBody("signWorkOrderCustomer");
  assert.ok(body.includes('if (!doc.progress?.allDone) return { error: "Every line has to be complete before sign-off." }'), "the gate");
  assert.ok(body.includes('acceptStage(accessId, "wo_customer", who, doc.fingerprint)'), "it uses the same stage_acceptances machinery as every other customer acceptance");
  assert.ok(body.includes("party) VALUES (?,?,?,?,?,?,?, 'customer')"), "and the mark sits beside the technician's");
  assert.ok(body.includes("already signed off"), "it cannot be signed twice");
  assert.ok(body.includes('closeWorkOrder(accessId, "System", { auto: true })'), "signing closes it (requirement 25)");
});

test("requirement 25: auto-close needs all lines complete AND the signature; an admin can always close", () => {
  const auto = db.slice(db.indexOf("export function woCanAutoClose"), db.indexOf("export function closeWorkOrder"));
  assert.ok(auto.includes("doc.progress?.allDone") && auto.includes("!!doc.customerSignature"), "both conditions");
  // It must read customerSignature, NOT doc.signatures — that list is the technicians' acceptance of
  // the current version and never contains the customer, so auto-close could never fire.
  assert.ok(!/doc\.signatures/.test(auto), "never doc.signatures");
  assert.ok(/signatures: row\.version \? woSignaturesFor\(row\.id, row\.version\)\.filter\(\(s\) => !s\.voided_at && s\.party !== "customer"\)/.test(db), "which excludes the customer by design");
  assert.ok(auto.includes('doc.status !== "closed"'), "and it is not already closed");
  const close = fnBody("closeWorkOrder");
  assert.ok(close.includes("if (auto && !woCanAutoClose(doc)) return { ok: true, closed: false }"), "an auto-close that isn't earned is a no-op, not an error");
  assert.ok(close.includes('JSON.stringify({ auto, signed })'), "the log says which it was");
  assert.ok(fnBody("reopenWorkOrder").includes('row.version ? "sent" : "draft"'), "reopening returns it to the state it came from");
  // Closing by hand is gated on wo.close, which is office-only.
  const roles = read("../lib/roles.js");
  assert.ok(/"wo\.close":\s*\["admin", "manager"\]/.test(roles));
});

test("requirement 27: payroll is a read over the locked logs, admin-only, exportable", () => {
  assert.ok(payrollPage.includes('if (!can(user.role, "payroll.view")) redirect'), "a tech can never open it");
  assert.ok(payrollPage.includes("payrollForPeriod({ from, to })"), "and it reads the one helper");
  assert.ok(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/.test(payrollPage), "the period is validated, not trusted");
  const body = fnBody("payrollForPeriod");
  assert.ok(body.includes("FROM wo_day_logs l"), "locked logs only — never the live credits");
  assert.ok(body.includes("WHERE l.day BETWEEN ? AND ?"), "bounded to the pay period");
  assert.ok(body.includes("byTech"), "grouped per technician");
  assert.ok(payroll.includes("function csv(data)") && payroll.includes("Locked at"), "the export reconciles day by day");
  assert.ok(payroll.includes("canExport &&"), "and is gated on payroll.export");
  assert.ok(shell.includes('{ key: "payroll",     label: "Payroll",      href: "/payroll" }'), "it is reachable from the Finance nav");
});

test("the close-out strip shows only what is real, and money only to those allowed it", () => {
  assert.ok(closeout.includes("if (!doc.version) return null;"), "nothing before the work order has been sent");
  assert.ok(closeout.includes("{doc.myDayOpen && ("), "End of day only while a day is open");
  // …but NOT gated on the work order being open: closing a job banks nobody's day, and hiding the
  // button would strand that pay as credits that never reach payroll. Caught live 2026-11-19.
  assert.ok(!/doc\.myDayOpen && !closed/.test(closeout), "a closed job still lets its days be banked");
  assert.ok(!/canClose && !closed && openDays/.test(closeout), "and the office can still close one for them");
  assert.ok(!/status === .closed./.test(fnBody("closeWoDay")), "the data layer agrees");
  assert.ok(closeout.includes("{logs.length > 0 &&"), "no empty daily-log shell");
  assert.ok(/\{showMoney && <span className="wcl-amt">/.test(closeout), "the payout column is gated");
  // A technician's own prompt shows THEIR unbanked money, not the whole crew's.
  assert.ok(closeout.includes("const mine = doc.myUnlocked") && /Your work today isn't banked yet\.\{showMoney && mine\.payable/.test(closeout), "the figure is the person's own");
  assert.ok(fnBody("woUnlockedTotals").includes("AND name=? COLLATE NOCASE"), "which the query scopes by name");
  assert.ok(closeout.includes("Awaiting customer sign-off.") && closeout.includes("canSignoff &&"), "the office waits, or takes the signature in person");
  assert.ok(closeout.includes("Close without their signature?"), "closing by hand is a two-step confirm");
  assert.ok(!/\bconfirm\(/.test(closeout), "never a native dialog");
});

test("the customer signs the work off without ever seeing the work order", () => {
  const card = read("../app/project/[accessId]/work-order-signoff.jsx");
  const gateway = read("../app/project/[accessId]/gateway-client.jsx");
  // The customer's read returns a handful of facts, not the document.
  const i = actions.indexOf("export async function getWorkOrderSignoffAction");
  const body = actions.slice(i, actions.indexOf("\nexport ", i + 10));
  assert.ok(body.includes('await gate(accessId, "wo.signoff")'), "its own capability");
  for (const leak of ["payload", "lines:", "total", "payout", "checkins", "dayLogs", "signatures"]) {
    // `lines` here is a COUNT, which is why it is spelled `lines:` in the returned object literal.
    if (leak === "lines:") continue;
    assert.ok(!new RegExp(`\\b${leak}\\b`).test(body.replace(/progress\?\.\w+/g, "")), `the customer's read carries no ${leak}`);
  }
  assert.ok(body.includes("allDone:") && body.includes("signed:"), "just: is it finished, and is it signed");
  // The card renders nothing until there is something to say, and nothing internal ever.
  assert.ok(card.includes("if (state === undefined || !state) return null;") && card.includes("if (!state.allDone && !state.signed) return null;"), "no empty shell");
  // Comments stripped: the file EXPLAINS that it hides payouts and crew, so the words appear there.
  const code = card.replace(/^\s*\/\/.*$/gm, "");
  for (const leak of ["payout", "techPrice", "crew", "dayLog", "money"]) assert.ok(!new RegExp(leak, "i").test(code), `the card shows no ${leak}`);
  assert.ok(gateway.includes("<WorkOrderSignoff accessId={lp.access_id}"), "mounted with the walkthrough, where the customer confirms the work");
  assert.ok(!/WorkOrderEditor[\s\S]{0,200}cView === "customer"/.test(gateway), "the editor itself is never mounted for a customer");
});

test("every row the document hands a client component is spread, not a raw sqlite row", () => {
  // node:sqlite rows have a null prototype; React refuses to serialize one into a client component
  // ("Classes or null prototypes are not supported"), which crashes the whole project page. Caught
  // live on 2026-11-19 when customerSignature was returned raw.
  const doc = db.slice(db.indexOf("export function getWorkOrderDoc"), db.indexOf("function woProposalDrift"));
  for (const m of doc.matchAll(/^\s*(\w+):\s*db\.prepare\([\s\S]*?\.get\(/gm)) {
    assert.fail(`${m[1]} returns a raw sqlite row — spread it`);
  }
  assert.ok(doc.includes("return s ? { ...s } : null;"), "customerSignature is spread");
  // The helpers it calls all map or spread too.
  for (const fn of ["woRow", "woCheckinsFor", "woDayLogsFor", "woSignaturesFor", "woVersionList", "woLineMediaFor"]) {
    const b = fnBody(fn);
    assert.ok(/\{ \.\.\.r \}|\{ \.\.\.s \}|map\(\(r\) => \(\{ \.\.\.r \}\)\)/.test(b), `${fn} spreads its rows`);
  }
});

test("one signature pad serves both parties", () => {
  const pad = read("../app/project/[accessId]/work-order-signpad.jsx");
  const footer = read("../app/project/[accessId]/work-order-footer.jsx");
  assert.ok(footer.includes('import SignPad from "./work-order-signpad"') && closeout.includes('import SignPad from "./work-order-signpad"'), "both use it");
  assert.ok(!/function SignSheet/.test(footer), "the duplicate pad is gone");
  assert.ok(pad.includes("requirePin") && pad.includes("...(requirePin ? { pin } : null)"), "the PIN step is the technician's half only");
  assert.ok(!/localStorage|pin_custom/.test(pad), "the pad never stores a PIN");
});
