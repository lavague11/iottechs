// Part B — addendum approval email: prompt (Send now / Schedule / Not now), gated+demo-safe email,
// no-PIN magic link, and the scheduled-send sweep.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const email = readFileSync(new URL("../lib/email.js", import.meta.url), "utf8");
const auth = readFileSync(new URL("../lib/auth.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/project/[accessId]/actions.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/project/[accessId]/install-addendum.jsx", import.meta.url), "utf8");
const sweep = readFileSync(new URL("../lib/addendum-emails.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/addendum-approve/route.js", import.meta.url), "utf8");

test("emailAddendumApproval is gated, demo-safe, pending-only, with a magic link + new total", () => {
  const i = email.indexOf("export async function emailAddendumApproval");
  assert.ok(i >= 0, "helper exists");
  const fn = email.slice(i, i + 2200);
  assert.ok(fn.includes("if (!emailEnabled())"), "respects email gating");
  assert.ok(/@journey-test\\?\.local/.test(fn) && fn.includes('source === "journey-test"'), "never sends for demo/test");
  assert.ok(fn.includes('add.status !== "pending"') && fn.includes("needsPricing"), "only a pending, priced add-on");
  assert.ok(fn.includes("makeAddendumToken") && fn.includes("/api/addendum-approve?t="), "builds the no-PIN magic link");
  assert.ok(fn.includes("new balance if approved") || fn.includes("newBalance"), "shows the new balance if approved");
});

test("addendum token helpers + the magic-link route grant no-PIN access to the add-on", () => {
  assert.ok(auth.includes("export async function makeAddendumToken") && auth.includes("export async function verifyAddendumToken"), "signed token helpers");
  assert.ok(auth.includes("ADDENDUM_TOKEN_TTL_MS") && auth.includes("expired"), "token expires");
  assert.ok(route.includes("verifyAddendumToken") && route.includes('makeAccessToken(grant.accessId, "customer")'), "verifies token + grants customer access");
  assert.ok(route.includes("open=addendum&approve="), "lands on the add-on with approve open");
});

test("office actions: send now, schedule, cancel (office-only, server-stamped)", () => {
  for (const n of ["sendAddendumApprovalAction", "scheduleAddendumApprovalAction", "cancelAddendumScheduleAction"]) {
    assert.ok(actions.includes(`export async function ${n}`), `${n} exists`);
  }
  assert.ok(actions.includes('["admin", "manager", "sales"].includes(tok.role)'), "office only");
  assert.ok(actions.includes("emailSentAt") && actions.includes("scheduledSendAt"), "stamps send/schedule state");
});

test("UI prompt has all three options + default Send now, and card email-state", () => {
  assert.ok(ui.includes("Send approval email to") && ui.includes("Send now") && ui.includes("Schedule") && ui.includes("Not now"), "three-option prompt");
  assert.ok(ui.includes("tomorrow9") && ui.includes('setHours(9, 0, 0, 0)'), "Schedule defaults to tomorrow 9 AM");
  assert.ok(ui.includes("Email scheduled for") && ui.includes("Approval email sent") && ui.includes("Send approval email"), "card shows scheduled / sent / send-later states");
  assert.ok(ui.includes('sp?.get("approve")') && ui.includes("setSignId(want)"), "magic-link ?approve auto-opens the sign modal");
});

test("scheduled sweep sends due emails and skips non-pending/demo", () => {
  assert.ok(sweep.includes("export async function sendDueAddendumEmails"), "sweep exists");
  assert.ok(sweep.includes('a.status !== "pending"') && sweep.includes("a.emailSentAt"), "skips non-pending / already-sent");
  assert.ok(sweep.includes("PERMANENT_SKIP") && sweep.includes('"demo-project"'), "demo/no-email are permanent skips (schedule cleared, never retried)");
  assert.ok(sweep.includes("due > now"), "only sends when due");
});
