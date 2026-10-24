// Payment-received email: confirm the customer gets a "payment recorded" email when money is in hand.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const email = readFileSync(new URL("../lib/email.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");

test("lib/email exposes emailPaymentReceived with amount + kind, gated on a positive amount", () => {
  assert.ok(/export async function emailPaymentReceived\(accessId, \{ amount, kind, method, paidAt \} = \{\}\)/.test(email), "signature takes the payment fields");
  const fn = email.slice(email.indexOf("export async function emailPaymentReceived"), email.indexOf("export async function emailProposalReady"));
  assert.ok(/if \(!\(amt > 0\)\) return \{ ok: false, error: "no-amount" \}/.test(fn), "no email for a zero/negative amount");
  assert.ok(fn.includes('toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })'), "amount rendered as currency");
  assert.ok(fn.includes("has been received and applied toward your balance"), "confirms it's applied to the balance");
  assert.ok(fn.includes("Amount: ${money}"), "the amount is in the body");
  assert.ok(fn.includes('subject: `Payment received'), "clear subject with the amount");
  assert.ok(fn.includes('open: "payment"'), "CTA deep-links to the payment/balance view");
  assert.ok(/PAY_KIND_LABEL = \{ deposit: "deposit", final: "final balance", partial: "partial payment", other: "payment" \}/.test(email), "kind labels");
});

test("proposal-actions fires the email when money is in hand (staff entry + staff confirmation), not on a pending submission", () => {
  assert.ok(actions.includes("emailPaymentReceived") && /import \{ emailProposalReady, emailSignatureRequest, emailPaymentReceived[,} ]/.test(actions), "imported");
  // staff-recorded payment = confirmed → email; guarded so a customer's pending submission does NOT email here
  const rec = actions.slice(actions.indexOf("export async function recordPaymentAction"), actions.indexOf("export async function deletePaymentAction"));
  assert.ok(/if \(!isCustomer\) \{[\s\S]*emailPaymentReceived\(accessId, \{/.test(rec), "staff entry emails; customer pending does not");
  // staff confirming a customer submission = money received → email with the confirmed payment's amount
  const conf = actions.slice(actions.indexOf("export async function confirmPaymentAction"), actions.indexOf("export async function getPaymentsForLogAction"));
  assert.ok(conf.includes("confirmProjectPayment(accessId, id)") && conf.includes("emailPaymentReceived(accessId, {"), "confirm path emails");
  assert.ok(conf.includes("find((x) => String(x.id) === String(id))"), "emails the amount of the payment just confirmed");
});
