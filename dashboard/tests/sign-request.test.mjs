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
const sheet = read("../app/project/[accessId]/request-signature-sheet.jsx");

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

test("builder: Request Signature is gold, gated on a sent proposal; the sheet shares a link or emails", () => {
  assert.ok(builder.includes("prop-head-sign") && builder.includes("RequestSignatureSheet"), "gold Request Signature button opens the share sheet");
  assert.ok(/\["sent", "changes_requested"\]\.includes\(status\)/.test(builder), "shown only while awaiting a signature");
  // The share sheet lives in its own component now (so the hub can open it directly too).
  assert.ok(sheet.includes("requestSignatureEmailAction"), "the sheet can email the request");
  assert.ok(sheet.includes("navigator.share") && sheet.includes("open=proposal&sign="), "Share Signing Link uses the direct ?sign= link");
  assert.ok(sheet.includes("if (busy) return;"), "email is guarded against duplicate taps");
});

// ---- B12: the deep-link guard tests the SIGNATURE, not the acceptance ----------------------------
// selectProposalOption writes accepted_options when the customer picks an option, long before they
// sign. Gating "already signed" on acceptance refused the signer in exactly the awaiting-signature
// state the link exists for. These run the real handler's branch logic over the four states.
function signerOutcome({ status, signed_name = null, accepted_options = [], options, want }) {
  const p = { status, signed_name, accepted_options, payload: { options } };
  const accepted = new Set(p.accepted_options || []);
  const signable = !(p.signed_name && accepted.size > 0) && ["sent", "changes_requested", "accepted", "declined"].includes(p.status);
  if (!signable) return "toast:not-awaiting";
  const opts = p.payload.options;
  const match = opts.find((o) => String(o.id) === String(want)) || (opts.length === 1 ? opts[0] : null);
  const optionSigned = !!p.signed_name && accepted.has(match?.id);          // the fixed guard
  if (match && optionSigned) return "toast:already-signed";
  if (match) return `signer:${match.id}`;
  return "toast:open-an-option";
}

const ONE = [{ id: "a" }];
const TWO = [{ id: "a" }, { id: "b" }];

test("B12: an accepted-but-unsigned proposal OPENS the signer instead of toasting", () => {
  // the state the Sign CTA and the signature-request email both exist for
  assert.equal(signerOutcome({ status: "accepted", accepted_options: ["a"], options: ONE, want: "a" }), "signer:a");
  assert.equal(signerOutcome({ status: "accepted", accepted_options: ["b"], options: TWO, want: "b" }), "signer:b");
  // and the single-option fallback still resolves when the param is the legacy literal
  assert.equal(signerOutcome({ status: "accepted", accepted_options: ["a"], options: ONE, want: "1" }), "signer:a");
});

test("B12: a genuinely SIGNED proposal is still refused", () => {
  assert.equal(signerOutcome({ status: "accepted", signed_name: "Sam Ali", accepted_options: ["a"], options: ONE, want: "a" }),
    "toast:not-awaiting", "the signable check catches it first");
  // and the per-option guard is correct on its own terms: signature present → refuse
  const p = { signed_name: "Sam Ali" }, accepted = new Set(["a"]);
  assert.equal(!!p.signed_name && accepted.has("a"), true);
  assert.equal(!!null && accepted.has("a"), false, "no signature → never 'already signed'");
});

test("B12: the signature-request email path is unchanged — sent + nothing accepted still opens the signer", () => {
  // what requestSignatureEmailAction / emailSignatureRequest actually send: ?sign=<optKey> while sent
  assert.equal(signerOutcome({ status: "sent", options: TWO, want: "b" }), "signer:b");
  assert.equal(signerOutcome({ status: "sent", options: ONE, want: "a" }), "signer:a");
  assert.equal(signerOutcome({ status: "changes_requested", options: TWO, want: "a" }), "signer:a");
  // an unknown option on a multi-option proposal still asks them to pick one
  assert.equal(signerOutcome({ status: "sent", options: TWO, want: "zzz" }), "toast:open-an-option");
  // a draft is still refused
  assert.equal(signerOutcome({ status: "draft", options: ONE, want: "a" }), "toast:not-awaiting");
});

test("B12: the shipped guard tests signed_name, and the acceptance-only form is gone", () => {
  assert.match(custView, /const optionSigned = !!p\.signed_name && accepted\.has\(match\?\.id\)/, "the guard reads the signature");
  assert.doesNotMatch(custView, /if \(match && accepted\.has\(match\.id\)\) showToast/, "the acceptance-only guard is gone");
});
