// Stage 2 item 2 — "signed copy and alert to admins and Maya". A signed change order is a contractual
// amendment, so it raises the same paper trail a signed proposal does (emailContractSigned).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const email = read("../lib/email.js");
const actions = read("../app/project/[accessId]/proposal-actions.js");

test("the signed change order goes to the admins AND Maya, with the document attached", () => {
  const at = email.indexOf("export async function emailAddendumSigned(");
  assert.ok(at > 0, "the sender exists");
  const body = email.slice(at, email.indexOf("\nexport ", at + 10));
  assert.match(body, /adminNotifyRecipients\(\)/, "the configured admins");
  assert.match(body, /MAYA_EMAIL/, "and Maya");
  assert.match(body, /buildAddendumProposalPdf/, "the signed change order is attached");
  assert.match(body, /isDemoProject\(project\)/, "and a demo project never sends");
  assert.match(body, /if \(!emailEnabled\(\)\)/, "gated like every other send");
});

test("it fires on signature, and can never reverse one", () => {
  const at = actions.indexOf("export async function signAddendumAction(");
  const body = actions.slice(at, actions.indexOf("\n}", actions.indexOf("return { ok: true, addendums: list }", at)));
  assert.match(body, /emailAddendumSigned\(accessId, addendumId\)/, "fired from the signing action");
  // Fire-and-forget, after the write — a slow or failed email must not undo a completed signature.
  assert.ok(body.indexOf("saveToolData") < body.indexOf("emailAddendumSigned"), "the signature is stored first");
  assert.match(body, /\.catch\(\(\) => \{\}\)/, "and a failure is swallowed");
});

test("the customer is not re-sent the change order on signing", () => {
  const at = email.indexOf("export async function emailAddendumSigned(");
  const body = email.slice(at, email.indexOf("\nexport ", at + 10));
  assert.ok(!/sendCustomerEmail/.test(body), "they already have it from the approval email");
});
