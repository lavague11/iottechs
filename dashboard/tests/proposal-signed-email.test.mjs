// Stage 5 item 4 of docs/customer-flow-v2.md — what the CUSTOMER receives when they sign. Until this,
// signing told the office and said nothing to the person who had just signed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const email = read("../lib/email.js");
const body = email.slice(email.indexOf("export async function emailProposalSigned("),
                         email.indexOf("\nexport ", email.indexOf("export async function emailProposalSigned(") + 10));

test("two branches, decided by the canonical money — never by the stage", () => {
  assert.match(body, /getProjectFinancialState/, "the live amount due now");
  assert.match(body, /amountDueForPayment\(accessId, "deposit"\)/, "falling back to the plan's deposit");
  assert.match(body, /payment due/i, "something owed → pay");
  assert.match(body, /we'll schedule you/i, "nothing owed → scheduling");
  assert.ok(!/stage ===|project\.stage/.test(body), "the stage never decides which one goes out");
});

test("both branches carry the signed PDF, and the phone branch links to the GUIDE", () => {
  assert.match(body, /signedPdfAttachment\(accessId\)/);
  assert.match(body, /\/guide\/mobile-setup\?project=/, "not ?open=phone, which the portal has no name for");
  assert.match(body, /open: "payment"/, "the money branch opens the payment view");
});

test("it can never send twice — one key for both branches", () => {
  assert.match(body, /onceForProject\(accessId, "proposal_signed"/);
  assert.equal((body.match(/onceForProject\(/g) || []).length, 1, "one claim, not one per branch");
});

test("it fires from BOTH signing paths, and cannot reverse a signature", () => {
  for (const [file, src] of [["lib/esign/complete.js", read("../lib/esign/complete.js")],
                             ["proposal-actions.js", read("../app/project/[accessId]/proposal-actions.js")]]) {
    assert.match(src, /emailProposalSigned\(accessId\)/, `${file} sends it`);
    assert.match(src, /emailProposalSigned\(accessId\)\)\.catch\(\(\) => \{\}\)/, `${file} swallows its failures`);
  }
  // The admin alert is a separate send with its own dedupe, so neither can suppress the other.
  assert.match(read("../lib/esign/complete.js"), /emailContractSigned/);
});
