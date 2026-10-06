import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeProposal } from "../lib/proposal.js";

// Role-visibility matrix for the proposal payload on the wire (server-side stripping, not UI-hiding).
// Guards the house rule: customer/sales never see wholesale cost or tech payout; tech never sees retail
// or customer financials; vendor never sees the proposal at all (tracking + address only, elsewhere).

function makeRow(status = "sent") {
  const payload = {
    options: [{
      id: "A", name: "Option A",
      services: [{
        name: "CCTV",
        items: [{
          id: "i1", name: "Camera", qty: 4,
          price: 150,          // retail (customer-facing)
          cost: 60,            // wholesale — internal only
          techPrice: 90,       // tech work-order price
          techPay: 40,         // tech payout — internal only
          sub: [{ id: "s1", name: "Drop", price: 20, cost: 8, techPrice: 12, techPay: 6 }],
        }],
      }],
    }],
  };
  return {
    id: "P1", version: 2, status, payload: JSON.stringify(payload),
    sent_at: status === "draft" ? null : "2026-10-01",
    tax_rate: 0.08, deposit_pct: 0.5,
  };
}

function firstItem(san) {
  return san?.payload?.options?.[0]?.services?.[0]?.items?.[0] ?? null;
}

test("admin & manager: full payload incl. cost + tech payout", () => {
  for (const role of ["admin", "manager"]) {
    const it = firstItem(sanitizeProposal(makeRow(), role));
    assert.equal(it.cost, 60, role);
    assert.equal(it.techPay, 40, role);
    assert.equal(it.price, 150, role);
  }
});

test("sales: retail visible, wholesale cost + tech payout stripped (incl. sub-lines)", () => {
  const it = firstItem(sanitizeProposal(makeRow(), "sales"));
  assert.equal(it.price, 150);
  assert.equal(it.cost, undefined);
  assert.equal(it.techPrice, undefined);
  assert.equal(it.techPay, undefined);
  assert.equal(it.sub[0].cost, undefined);
  assert.equal(it.sub[0].techPay, undefined);
  assert.equal(it.sub[0].price, 20);
});

test("customer: retail visible, cost + payout stripped; draft is invisible beyond its existence", () => {
  const it = firstItem(sanitizeProposal(makeRow(), "customer"));
  assert.equal(it.price, 150);
  assert.equal(it.cost, undefined);
  assert.equal(it.techPay, undefined);
  const draft = sanitizeProposal(makeRow("draft"), "customer");
  assert.equal(draft.payload, undefined);
  assert.equal(draft.status, "draft");
});

test("tech: work order with tech price, never retail price or wholesale cost", () => {
  const san = sanitizeProposal(makeRow(), "tech");
  assert.equal(san.workOrder, true);
  const it = firstItem(san);
  assert.equal(it.price, undefined, "no retail price");
  assert.equal(it.cost, undefined, "no wholesale cost");
  // unsent proposal stays hidden from the tech
  const draft = sanitizeProposal(makeRow("draft"), "tech");
  assert.equal(draft.payload, undefined);
  assert.equal(draft.status, "draft");
});

test("vendor: never receives the proposal (null), not the retail fallthrough", () => {
  assert.equal(sanitizeProposal(makeRow(), "vendor"), null);
  assert.equal(sanitizeProposal(makeRow("accepted"), "vendor"), null);
});

test("null row → null", () => {
  assert.equal(sanitizeProposal(null, "admin"), null);
});
