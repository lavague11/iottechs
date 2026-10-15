// A proposal line item may carry a NEGATIVE price → a customer credit (e.g. "Wiring Credit" -$150).
// It must validate (save), and the subtotal/total must include it.
import test from "node:test";
import assert from "node:assert/strict";
import { validatePayload, optionTotals, svcSubtotal } from "../lib/proposal.js";

const payload = (price) => ({
  options: [{ id: "A", name: "A", services: [{ key: "camera", label: "Security Cameras", items: [
    { id: "x", name: "Camera", qty: 1, price: 300, cost: 0 },
    { id: "c", name: "Wiring Credit", qty: 9, price, cost: 0 },
  ] }] }],
  discount: { type: "flat", value: 0 }, pcp_credit: 0, payment_plan: "50_50",
});

test("validatePayload accepts a negative-price (credit) line item", () => {
  assert.ok(!validatePayload(payload(-150)), "a -$150 credit line is valid (was rejected as 'Bad price')");
  assert.equal(validatePayload(payload(2000000)), "Bad price.", "still rejects an out-of-range price");
  assert.equal(validatePayload(payload(-2000000)), "Bad price.", "still rejects an absurdly large credit");
});

test("the credit reduces the subtotal and total", () => {
  const opt = payload(-150).options[0];
  assert.equal(svcSubtotal(opt.services[0]), 300 + 9 * -150, "subtotal includes the negative line (300 - 1350 = -1050 for this service)");
  const t = optionTotals(opt, 0, { type: "flat", value: 0 }, 50, 0);
  assert.equal(t.sub, 300 - 1350, "option subtotal nets the credit");
  // tax base never goes negative, but the subtotal/grand reflect the credit
  assert.equal(t.grand, Math.max(0, 300 - 1350) + 0, "taxable floors at 0 (no negative tax), grand = max(0, net)");
});
