// Stage 5 of docs/customer-flow-v2.md — "deduped with a persisted per-project, per-email flag so it can
// never send twice", plus the gate change that lets a plan owing nothing up front reach scheduling.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STAGE_FLOW, blockingReqs } from "../lib/stage-flow.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");
const email = read("../lib/email.js");
const instr = read("../instrumentation.js");

test("the ledger claims BEFORE sending — the insert is the lock", () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS customer_email_log/);
  assert.match(db, /PRIMARY KEY \(project_access_id, key\)/, "one row per project per email");
  const at = db.indexOf("export function claimCustomerEmail(");
  const body = db.slice(at, db.indexOf("\n}", at));
  assert.match(body, /INSERT OR IGNORE INTO customer_email_log/, "the claim IS the insert");
  assert.match(body, /return r\.changes > 0/, "and it reports whether it won the race");
});

test("a failed send gives the claim back; a SKIPPED one does not", () => {
  const at = email.indexOf("export async function onceForProject(");
  const body = email.slice(at, email.indexOf("\nexport ", at + 10));
  assert.match(body, /if \(!claimCustomerEmail\(accessId, key\)\) return \{ skipped: "already-sent", key \}/);
  assert.match(body, /releaseCustomerEmail\(accessId, key\)/, "a failure is retryable");
  // A demo project or a disabled mailer must NOT bank the email for later — otherwise every live project
  // would receive its whole backlog the moment a Resend key is configured.
  assert.match(body, /const skipped = !!\(r && r\.skipped\)/);
  assert.match(body, /if \(!ok && !skipped\) \{[^}]*releaseCustomerEmail/, "only genuine failures release");
});

test("item 6: any first payment unlocks scheduling, and nothing-due unlocks on the signature", () => {
  const signed = { proposal_status: "accepted", proposal_signed: true };
  const labels = (f) => blockingReqs("approval_deposit", f, []).map((r) => r.label);
  assert.deepEqual(labels({ ...signed, deposit_required: false }), [], "nothing due up front → signing is enough");
  assert.deepEqual(labels({ ...signed, deposit_required: true }), ["First payment received"]);
  assert.deepEqual(labels({ ...signed, deposit_required: true, first_payment_recorded: true }), [], "any confirmed payment");
  assert.deepEqual(labels({ ...signed, deposit_required: true, deposit_recorded: true }), [], "a deposit still counts");
  // The two old rows are gone, so a 100%-on-completion plan is no longer asked for a deposit forever.
  const names = STAGE_FLOW.approval_deposit.map((r) => r.label);
  assert.ok(!names.includes("Deposit submitted") && !names.includes("Deposit receipt confirmed"));
});

test("item 6: 'due up front' comes from the PLAN, never the legacy deposit_pct column", () => {
  const at = db.indexOf("deposit_required: (() => {");
  const body = db.slice(at, at + 400);
  assert.match(body, /planDepositPct\(/, "the plan is the source");
});

test("items 8 and 11: the sign-off chase and the automatic appointment reminders no longer run", () => {
  // Comments are stripped first: the explanation of each removal names the function it removed, and
  // matching that would be matching prose rather than a live call.
  // No `$` anchor: these files have CRLF endings, and `.` does not match the \r, so an anchored
  // pattern silently fails to strip anything.
  const code = instr.split(/\r?\n/).map((l) => l.replace(/\/\/.*/, "")).join("\n");
  assert.ok(!/sweepSignoffReminders/.test(code), "no 24h sign-off chase on a timer");
  assert.ok(!/sendDueAppointmentReminders/.test(code), "no day-before or same-day sweep");
  // Both are left in the tree unused, so re-enabling either is one line rather than a rewrite.
  assert.match(read("../lib/wo-notify.js"), /export async function sweepSignoffReminders/);
  assert.match(read("../lib/appointment-reminders.js"), /export async function sendDueAppointmentReminders/);
  // The office can still ask by hand.
  assert.match(read("../app/project/[accessId]/work-order-actions.js"), /export async function requestSignoffAction/);
  assert.match(read("../app/project/[accessId]/actions.js"), /export async function sendAppointmentEmailAction/);
});
