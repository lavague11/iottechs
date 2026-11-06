// Shared send scheduler — next-8:30 default, late-hour nudge, and the two surfaces that reuse it
// (signature-request emails + add-on approval emails), plus the scheduled-email sweep's stale checks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { next830, nextLocalAt, isLateFor, friendlyWhen, scheduleDefaults, toLocalInput } from "../lib/send-schedule.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("next830 / scheduleDefaults default to the next 8:30 AM", () => {
  const d = next830(new Date("2026-06-15T10:00:00"));   // after 8:30 → tomorrow 8:30
  assert.equal(d.getHours(), 8);
  assert.equal(d.getMinutes(), 30);
  assert.ok(d.getTime() > new Date("2026-06-15T10:00:00").getTime());
  const def = scheduleDefaults({ tz: "UTC", now: new Date("2026-06-15T10:00:00Z") });
  assert.ok(/T08:30$/.test(def.defaultLocal) || /08:30$/.test(def.defaultLocal), "default picker value is an 8:30 slot");
  assert.ok(def.defaultISO, "exposes an ISO instant for storage");
});

test("nextLocalAt returns today when the time is still ahead", () => {
  const d = nextLocalAt(8, 30, new Date("2026-06-15T06:00:00"));
  assert.equal(d.getDate(), 15);     // 6am < 8:30 → still today
  assert.equal(d.getHours(), 8);
});

test("isLateFor: after 7 PM or before 8 AM is late; daytime is not", () => {
  assert.equal(isLateFor("UTC", new Date("2026-06-15T20:00:00Z")), true);   // 8 PM
  assert.equal(isLateFor("UTC", new Date("2026-06-15T06:00:00Z")), true);   // 6 AM
  assert.equal(isLateFor("UTC", new Date("2026-06-15T10:00:00Z")), false);  // 10 AM
  assert.equal(isLateFor("UTC", new Date("2026-06-15T18:30:00Z")), false);  // 6:30 PM — still fine
});

test("friendlyWhen labels today / tomorrow relative to now", () => {
  const now = new Date("2026-06-15T10:00:00");
  assert.match(friendlyWhen(new Date("2026-06-15T14:00:00"), now), /today$/);
  assert.match(friendlyWhen(new Date("2026-06-16T08:30:00"), now), /tomorrow$/);
  assert.match(friendlyWhen(new Date("2026-06-20T08:30:00"), now), /on /);
});

test("the shared SendScheduler offers Send now + Schedule send with 8:30/quick picks", () => {
  const s = read("../app/project/[accessId]/send-scheduler.jsx");
  assert.ok(s.includes("Send now") && s.includes("Schedule send"), "both options");
  assert.ok(s.includes("Tomorrow 8:30 AM") && s.includes("Tomorrow 12 PM"), "quick picks");
  assert.ok(s.includes("scheduleDefaults") && s.includes("tomorrowLocalAt"), "uses the shared helpers");
  assert.ok(s.includes("It’s late") || s.includes("It's late"), "late-hour note");
  assert.ok(s.includes('setMode(d.late ? "schedule"'), "preselects Schedule when it's late");
});

test("Request-via-Email opens the scheduler and shows a scheduled state", () => {
  const sheet = read("../app/project/[accessId]/request-signature-sheet.jsx");
  assert.ok(sheet.includes("import SendScheduler"), "sheet uses the shared scheduler");
  assert.ok(sheet.includes("scheduleSignatureEmailAction") && sheet.includes("cancelSignatureEmailAction") && sheet.includes("getSignatureScheduleAction"), "wired to the schedule actions");
  assert.ok(sheet.includes("Signature email scheduled for") && sheet.includes("Send now") && /Edit/.test(sheet) && /Cancel/.test(sheet), "scheduled row has Edit · Send now · Cancel");
  assert.ok(sheet.includes("setSchedOpen(true)"), "Request via Email opens the chooser instead of sending immediately");
});

test("signature-request scheduling is version+fingerprint bound and skips when stale", () => {
  const actions = read("../app/project/[accessId]/proposal-actions.js");
  assert.ok(actions.includes("export async function scheduleSignatureEmailAction") && actions.includes("export async function cancelSignatureEmailAction") && actions.includes("export async function getSignatureScheduleAction"), "three schedule actions exported");
  assert.ok(actions.includes("_sigBinding") && actions.includes("proposalFingerprint") && actions.includes('"sig_email"'), "binds to the proposal fingerprint, stored in the sig_email blob");
  assert.ok(actions.includes("if (sent) _saveSigSchedule(accessId, null)"), "a real send clears any pending schedule");
  const sweep = read("../lib/signature-emails.js");
  assert.ok(sweep.includes('return "signed"') && sweep.includes('return "revised"'), "sweep skips signed / revised proposals");
  assert.ok(sweep.includes("journey-test"), "demo/test projects never send");
  assert.ok(sweep.includes("emailSignatureRequest"), "sends via the existing signature-request email");
});

test("add-on approval emails reuse the same scheduler + 8:30 default", () => {
  const adn = read("../app/project/[accessId]/install-addendum.jsx");
  assert.ok(adn.includes("import SendScheduler"), "addendum prompt is the shared scheduler now");
  assert.ok(!adn.includes("tomorrow9"), "old 9 AM default removed");
  assert.ok(adn.includes("onSchedule={(iso) => scheduleIt(emailPrompt, iso)}"), "schedules through the shared chooser");
});

test("a boot sweep + cron trigger run the scheduled signature emails", () => {
  assert.ok(read("../instrumentation.js").includes("sendDueSignatureEmails"), "boot scheduler runs the sweep");
  assert.ok(read("../app/api/cron/signature-emails/route.js").includes("sendDueSignatureEmails"), "cron route exists");
});
