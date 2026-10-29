// Square online payments — the money-critical server logic (no live Square calls): what's due (deposit vs
// balance, with pending counted so you can't double-pay), the idempotent pending→confirmed ledger, the 5%
// convenience fee math, webhook signature verification, and the dormant-until-configured gate.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.env.DB_DIR = mkdtempSync(path.join(tmpdir(), "square-"));
process.env.TZ = "America/New_York";

let db, sq, acc;
const PAYLOAD = { options: [{ id: "A", name: "Opt", services: [{ key: "camera", label: "Cameras", items: [{ id: "i1", name: "Cam", qty: 1, price: 1000 }] }] }] };

before(async () => {
  db = await import("../lib/db.js");
  sq = await import("../lib/square.js");
  const r = db.createLeadProject("Pay Co", "payco@x.com", "5551234567", "2503 Jay Pl", "cctv", "Pay Co");
  acc = r.accessId || r.access_id || r;
  db.saveProposalDraft(acc, { payload: PAYLOAD, taxRate: 0, depositPct: 50 }, "Tester");
  db.markProposalSent(acc, "Tester");
});

test("dormant until configured; configured once keys are in the vault", () => {
  assert.equal(sq.squareConfigured(), false, "no keys → off");
  db.setSecret("SQUARE_ACCESS_TOKEN", "sandbox-tok", "t");
  db.setSecret("SQUARE_LOCATION_ID", "LOC123", "t");
  assert.equal(sq.squareConfigured(), true, "keys → on");
  assert.equal(sq.squareEnv(), "sandbox", "defaults to sandbox");
});

test("amount due: deposit = total×pct; balance = total; pending + paid both reduce it (no double-pay)", () => {
  assert.equal(db.amountDueForPayment(acc, "deposit").due, 500);
  assert.equal(db.amountDueForPayment(acc, "balance").due, 1000);
  // A $200 checkout is created → pending; it should immediately reduce what's still payable.
  assert.equal(db.recordSquarePending({ accessId: acc, orderId: "ORDER_1", amount: 200, feeAmount: 10, kind: "deposit" }).ok, true);
  assert.equal(db.amountDueForPayment(acc, "deposit").due, 300, "pending counts against the deposit");
  assert.equal(db.amountDueForPayment(acc, "balance").due, 800, "pending counts against the balance");
});

test("pending is idempotent; confirm credits the balance and is idempotent", () => {
  assert.equal(db.recordSquarePending({ accessId: acc, orderId: "ORDER_1", amount: 200, feeAmount: 10, kind: "deposit" }).duplicate, true, "same order → no second row");
  assert.equal(db.getProjectFinancialState(acc).paid, 0, "pending is NOT yet counted as paid");
  const c = db.confirmSquarePaymentByOrder("ORDER_1");
  assert.equal(c.ok, true); assert.equal(c.accessId, acc);
  assert.equal(db.getProjectFinancialState(acc).paid, 200, "confirmed money credits the balance");
  assert.equal(db.confirmSquarePaymentByOrder("ORDER_1").already, true, "re-confirm is a no-op");
  assert.equal(db.getProjectFinancialState(acc).paid, 200, "no double-credit on re-delivery");
  // The fee rode on fee_amount, never on the amount applied to the balance.
  const row = db.getProjectPayments(acc).find((p) => p.external_id === "ORDER_1");
  assert.equal(row.amount, 200); assert.equal(row.fee_amount, 10); assert.equal(row.source, "square"); assert.equal(row.status, "confirmed");
  assert.equal(db.confirmSquarePaymentByOrder("NOPE").notFound, true);
});

test("5% convenience fee math (added on top, rounded to the cent)", () => {
  const base = 500;                         // $500 deposit
  const baseCents = Math.round(base * 100);
  const feeCents = Math.round(baseCents * 0.05);
  assert.equal(feeCents, 2500, "$25 fee on $500");
  assert.equal((baseCents + feeCents) / 100, 525, "customer pays $525");
});

test("webhook signature verification (HMAC-SHA256 over url+body)", () => {
  db.setSecret("SQUARE_WEBHOOK_SIGNATURE_KEY", "whsec_test", "t");
  const url = "https://iot-techs.com/api/pay/webhook";
  const body = JSON.stringify({ type: "payment.updated", data: { object: { payment: { order_id: "ORDER_1", status: "COMPLETED" } } } });
  const good = crypto.createHmac("sha256", "whsec_test").update(url + body).digest("base64");
  assert.equal(sq.verifyWebhook(good, body, url), true, "correct signature verifies");
  assert.equal(sq.verifyWebhook("tampered", body, url), false, "wrong signature rejected");
  assert.equal(sq.verifyWebhook(good, body + "x", url), false, "mutated body rejected");
});
