// Direct Signature Request — admin "Request Signature" (share link / email) + the ?sign= deep-link that
// auto-opens the customer signer. PIN-gated: the link carries no secret; identity is confirmed at the
// door, then the signer opens on the CURRENT revision (outdated/revised/signed handled by the e-sign
// version+fingerprint binding). Source-level assertions, matching tests/payment-email.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const email = read("../lib/email.js");
const actions = read("../app/project/[accessId]/proposal-actions.js");
const custView = read("../app/project/[accessId]/proposal-customer-view.jsx");
const builder = read("../app/project/[accessId]/proposal-builder.jsx");

test("email: projectLink carries ?sign and emailSignatureRequest deep-links to the signer with a gold CTA", () => {
  assert.ok(/function projectLink\(accessId, open, sign\)/.test(email), "projectLink takes a sign param");
  assert.ok(email.includes('qs.set("sign", String(sign))'), "sign is appended to the link");
  const fn = email.slice(email.indexOf("export async function emailSignatureRequest"), email.length);
  assert.ok(fn.includes("export async function emailSignatureRequest(accessId, optKey)"), "signature-request helper exists");
  assert.ok(fn.includes('open: "proposal"') && fn.includes("sign: optKey"), "CTA opens the proposal and auto-opens the signer");
  assert.ok(fn.includes("Review & Sign Your Proposal"), "gold CTA label matches the customer's Review & Sign");
});

test("action: requestSignatureEmailAction is staff-only, refuses a draft, debounced, and logged — never on share", () => {
  const fn = actions.slice(actions.indexOf("export async function requestSignatureEmailAction"),
                           actions.indexOf("export async function", actions.indexOf("export async function requestSignatureEmailAction") + 10));
  assert.ok(fn.includes("STAFF_EDIT.has(tok.role)"), "staff-only");
  assert.ok(fn.includes('cur.status === "draft"') && fn.includes("Send the proposal first"), "a draft can't be requested");
  assert.ok(/< 90000/.test(fn) && fn.includes("Just sent"), "debounced against repeated taps");
  assert.ok(fn.includes("emailSignatureRequest(accessId, optKey)"), "sends the direct signing email");
  assert.ok(fn.includes("logProjectEvent(accessId, { kind: \"email\"") && fn.includes("createNotification("), "a real send is logged + notifies");
});

test("customer view: ?sign= is captured once, stripped, gated on signability, then opens the signer", () => {
  assert.ok(custView.includes('new URLSearchParams(window.location.search).get("sign")'), "reads the sign param");
  assert.ok(custView.includes("signConsumed") && custView.includes('u.searchParams.delete("sign")'), "consumed once + stripped from the URL");
  assert.ok(/const signable = .*p\.status\)/.test(custView) && custView.includes("setEsignFor(match.id)"), "opens the signer only when signable");
});

test("builder: Request Signature is gold, gated on a sent proposal, and the sheet shares a link or emails", () => {
  assert.ok(builder.includes("requestSignatureEmailAction") && builder.includes("prop-head-sign"), "gold Request Signature button wired");
  assert.ok(/\["sent", "changes_requested"\]\.includes\(status\)/.test(builder), "shown only while awaiting a signature");
  assert.ok(builder.includes("navigator.share") && builder.includes("open=proposal&sign="), "Share Signing Link uses the direct ?sign= link");
  assert.ok(builder.includes("if (sigBusy) return;"), "email is guarded against duplicate taps");
});
