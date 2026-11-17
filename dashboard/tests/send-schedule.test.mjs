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
  assert.ok(sheet.includes("import ScheduledSendBanner") && sheet.includes('label="Signature email"')
    && sheet.includes("onEdit=") && sheet.includes("onSendNow=") && sheet.includes("onCancel="),
    "scheduled row is the shared banner, wired to Edit · Send now · Cancel");
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

// ---- Submit the proposal → the same chooser, not an instant overnight email -------------------------

test("sendProposalAction defers ONLY the email when emailAt is given", () => {
  const act = read("../app/project/[accessId]/proposal-actions.js");
  const i = act.indexOf("export async function sendProposalAction");
  const send = act.slice(i, act.indexOf("export async function", i + 10));
  assert.ok(/sendProposalAction\(accessId, \{ emailAt \} = \{\}\)/.test(send), "takes an optional emailAt");
  assert.ok(send.includes("isNaN(when.getTime())"), "rejects an invalid time instead of sending now");
  // The scheduled branch must return BEFORE the immediate email, and reuse the existing sig_email store.
  const schedAt = send.indexOf("_saveSigSchedule");
  const mailAt = send.indexOf("emailSignatureRequest");
  assert.ok(schedAt > -1 && mailAt > -1 && schedAt < mailAt, "schedules through _saveSigSchedule ahead of the immediate send");
  assert.ok(/if \(when\)[\s\S]*return \{ ok: true, stage, emailed: false, scheduledSendAt/.test(send), "scheduled submit reports emailed:false + the time");
  // The binding must describe the SENT row, so the sweep's stale check compares like with like.
  assert.ok(send.indexOf("markProposalSent") < schedAt, "the schedule is written after the proposal is marked sent");
  assert.ok(send.includes("binding: _sigBinding(accessId)"), "binds to the current (sent) version + fingerprint");
  // Lifecycle around the send is untouched by scheduling.
  assert.ok(send.includes("advanceStageForward") && send.includes("seedTechPricingMap") && send.includes("createNotification"),
    "stage advance, payout seeding and the in-app notification still happen");
});

test("sendProposalAction with no emailAt still emails immediately (the AI send_proposal path)", () => {
  const act = read("../app/project/[accessId]/proposal-actions.js");
  const i = act.indexOf("export async function sendProposalAction");
  const send = act.slice(i, act.indexOf("export async function", i + 10));
  assert.ok(send.includes("const er = await emailSignatureRequest(accessId, primaryOpt)"), "unscheduled send still emails inline");
  assert.ok(read("../app/project/[accessId]/ai-actions.js").includes("await sendProposalAction(accessId)"), "the AI caller passes no options, so it is unchanged");
});

test("the proposal builder's Submit opens the chooser instead of sending straight away", () => {
  const b = read("../app/project/[accessId]/proposal-builder.jsx");
  assert.ok(b.includes("import SendScheduler"), "reuses the shared chooser");
  assert.ok(b.includes("function send() { setSendSheet(true); }"), "Submit only opens the chooser");
  assert.ok(b.includes("async function doSend({ emailAt } = {})"), "the real submit is separate");
  assert.ok(b.includes("onSendNow={() => doSend()}") && b.includes("onSchedule={(iso) => doSend({ emailAt: iso })}"), "both chooser outcomes wired");
  assert.ok(b.includes("sendProposalAction(accessId, emailAt ? { emailAt } : undefined)"), "passes the chosen time through");
  assert.ok(!b.includes("confirmSend"), "the old two-step confirm is gone — the chooser IS the confirm");
  assert.ok(b.includes("friendlyWhen(r.scheduledSendAt)"), "the toast names the scheduled time");
});

test("the scheduled-email row has ONE definition, used by all three surfaces", () => {
  const banner = read("../app/project/[accessId]/scheduled-send-banner.jsx");
  assert.ok(banner.includes("scheduled for {friendlyWhen(at)}"), "one wording");
  assert.ok(banner.includes(">Edit<") && banner.includes(">Send now<") && banner.includes(">Cancel<"), "Edit · Send now · Cancel");
  assert.ok(banner.includes('@media (prefers-color-scheme:dark)') && banner.includes(':root:not([data-theme="light"])'), "dark mode guarded the house way");
  for (const host of ["request-signature-sheet.jsx", "staff-hub.jsx", "proposal-builder.jsx"]) {
    const src = read(`../app/project/[accessId]/${host}`);
    assert.ok(src.includes("import ScheduledSendBanner"), `${host} uses the shared banner`);
    assert.ok(!/sig-sched-t|sig-sched-acts/.test(src), `${host} has no hand-rolled copy left`);
  }
});
