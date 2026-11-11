// Email magic-link password reset: a signed, single-use, 30-minute token emailed to the account holder →
// /reset sets a new password and signs them in. Token round-trip is functional; wiring is source-level.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makePasswordResetToken, verifyPasswordResetToken } from "../lib/auth.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the reset token round-trips (userId + password fingerprint) and rejects tampering", async () => {
  const tok = await makePasswordResetToken(42, "abc123def456");
  const v = await verifyPasswordResetToken(tok);
  assert.equal(v.userId, 42); assert.equal(v.fp, "abc123def456");
  assert.equal(await verifyPasswordResetToken(tok + "x"), null, "tampered → null");
  assert.equal(await verifyPasswordResetToken("not.a.token"), null, "garbage → null");
});

test("the link is single-use: bound to a fingerprint of the current password hash", () => {
  const db = read("../lib/db.js");
  assert.ok(db.includes("export function passwordResetFingerprint"), "fingerprint helper exists");
  assert.ok(db.includes('createHash("sha256").update(String(r?.password_hash || "none"))'), "hashes the current password_hash (never exposed)");
  const auth = read("../lib/auth.js");
  assert.ok(auth.includes("PWRESET_TTL_MS = 30 * 60 * 1000"), "30-minute TTL");
});

test("the email goes ONLY to the account holder (never BCC'd), with a /reset link", () => {
  const email = read("../lib/email.js");
  assert.ok(email.includes("export async function emailPasswordReset"), "sender exists");
  // Isolate just the emailPasswordReset function body (up to the next top-level declaration).
  const start = email.indexOf("export async function emailPasswordReset");
  const body = email.slice(start, email.indexOf("\n// ---- Event copy"));
  assert.ok(body.includes("makePasswordResetToken(userId, passwordResetFingerprint(userId))") && body.includes("/reset?t="), "mints a token + links to /reset");
  assert.ok(body.includes("sendEmail({ to, subject:") && !body.includes("bcc") && !body.includes("customerCopyBcc"), "no BCC to admin/Maya on a reset link");
  assert.ok(body.includes("/@journey-test\\.local$/i.test(to)"), "demo accounts never send");
});

test("requesting a reset never reveals whether an account exists", () => {
  const actions = read("../app/forgot/actions.js");
  assert.ok(actions.includes("export async function requestPasswordResetByEmailAction"), "request action exists");
  assert.ok(/return \{ ok: true, sent: true \};/.test(actions) && actions.includes("never reveal"), "always returns the same generic result");
});

test("completing a reset re-verifies the token, enforces single-use, and signs in", () => {
  const actions = read("../app/reset/actions.js");
  assert.ok(actions.includes("verifyPasswordResetToken(token)"), "re-verifies the signed token");
  assert.ok(actions.includes("passwordResetFingerprint(v.userId) !== v.fp") && actions.includes("already been used"), "rejects an already-used link");
  assert.ok(actions.includes("resetUserPassword(v.userId, password)") && actions.includes('jar.set("iot_session"'), "sets the password + signs in");
  const page = read("../app/reset/page.jsx");
  assert.ok(page.includes("passwordResetFingerprint(v.userId) === v.fp"), "the page shows expired for an already-used link (not a dead form)");
});

test("the /forgot page offers the emailed link by default, phone last-4 as fallback", () => {
  const page = read("../app/forgot/page.jsx");
  assert.ok(page.includes('useState("email")') && page.includes("Email me a reset link"), "email link is the default mode");
  assert.ok(page.includes("Use your phone instead") && page.includes("resetPasswordAction"), "phone last-4 remains as a fallback");
});
