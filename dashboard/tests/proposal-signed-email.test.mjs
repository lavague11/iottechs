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
  // From the PLAN (planDepositPct via upFrontDue), NOT amountDueNow: that reads the legacy deposit_pct
  // column, which drifts from the plan. A Stage 6 fixture — a custom plan of Halfway + a date — was
  // branched into "payment due" and chased for $800 it had never asked the customer for.
  assert.match(body, /await upFrontDue\(accessId\)/, "the plan decides what is owed up front");
  assert.ok(!/amountDueNow/.test(body), "never the legacy-derived figure");
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

test("upFrontDue reads the PLAN, and claims nothing when there is no plan to read", () => {
  const at = email.indexOf("export async function upFrontDue(");
  assert.ok(at > 0, "the helper exists");
  const fn = email.slice(at, email.indexOf("\n}", at));
  assert.match(fn, /planDepositPct\(payload, 0\)/, "the plan, with a zero fallback");
  // Chasing someone for a figure we are not sure about is the worse failure, so no plan means no chase.
  assert.ok(!/deposit_pct \|\| 50|fallbackPct = 50/.test(fn), "never a 50% guess");
  // The two existing money functions are left alone on purpose — they are live paths on real records.
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.match(db, /const depositAmt = Math\.round\(total \* \(\(\+pub\?\.deposit_pct \|\| 0\) \/ 100\)/,
    "amountDueForPayment still reads deposit_pct — changing it is its own decision");
});
