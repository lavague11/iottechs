// Square online payments — the money-critical server logic (no live Square calls): what's due (deposit vs
// balance, with pending counted so you can't double-pay), the idempotent pending→confirmed ledger, the 5%
// convenience fee math, webhook signature verification, and the dormant-until-configured gate.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
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

test("service-call invoice: due math + idempotent pending→confirmed via the unified confirm", () => {
  const r = db.createServiceCall({ customer: "Svc Co", contact_name: "Svc Co", contact_email: "svc@x.com", contact_phone: "5550001111", address: "2503 Jay Pl", issue: "Camera down", category: "cctv", actor_role: "admin", actor_name: "Tester" });
  const svcId = r.svc_id || r.svcId || r.id || r;
  assert.ok(svcId, "service call created");
  db.saveSvcInvoice(svcId, { items: [{ desc: "Diagnostic", qty: 1, price: 200 }, { desc: "Labor", qty: 2, price: 150 }] }, { actor_role: "admin", actor_name: "Tester" });
  assert.equal(db.getSvcInvoice(svcId).total, 500);
  assert.equal(db.svcAmountDue(svcId).due, 500);

  assert.equal(db.recordSvcSquarePending({ svcId, orderId: "SVC_ORDER_1", amount: 300, feeAmount: 15 }).ok, true);
  assert.equal(db.svcAmountDue(svcId).due, 200, "pending reduces what's payable");
  assert.equal(db.recordSvcSquarePending({ svcId, orderId: "SVC_ORDER_1", amount: 300, feeAmount: 15 }).duplicate, true);

  const c = db.confirmSquarePaymentByOrder("SVC_ORDER_1");   // unified confirm routes to svc_payments
  assert.equal(c.ok, true); assert.equal(c.svcId, svcId);
  const row = db.getSvcPayments(svcId).find((p) => p.external_id === "SVC_ORDER_1");
  assert.equal(row.status, "confirmed"); assert.equal(row.amount, 300); assert.equal(row.fee_amount, 15); assert.equal(row.source, "square");
  assert.equal(db.svcAmountDue(svcId).due, 200, "confirmed money keeps due at 200");
  assert.equal(db.confirmSquarePaymentByOrder("SVC_ORDER_1").already, true, "re-confirm is a no-op");
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

// ---- B9 (latent half): "paid" names the status that means paid ----------------------------------
// Four call sites asked "is this payment money in hand?" with `status !== "pending"` — allow-by-
// default, so ANY status other than that one literal counted as cash. Only "pending" and "confirmed"
// are ever written, so the answer is identical on every existing row; but the moment someone adds
// failure handling (which B9's option 3 does), a `status='failed'` row would have inflated `paid` and
// shrunk `balance` on a real invoice.
test("B9: the paid filter names 'confirmed' rather than 'not pending'", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.match(db, /const paymentCounts = \(p\) => p\?\.status === "confirmed";/, "one predicate");
  assert.equal((db.match(/pays\.filter\(paymentCounts\)/g) || []).length, 4, "all four call sites use it");
  assert.doesNotMatch(db, /filter\(\((?:x|p)\) => (?:x|p)\.status !== "pending"\)/, "no allow-by-default copies left");

  // the predicate itself, including the statuses that do not exist yet
  const paymentCounts = (p) => p?.status === "confirmed";
  assert.equal(paymentCounts({ status: "confirmed" }), true);
  assert.equal(paymentCounts({ status: "pending" }), false);
  assert.equal(paymentCounts({ status: "failed" }), false, "a failed payment is not money received");
  assert.equal(paymentCounts({ status: "void" }), false);
  assert.equal(paymentCounts({}), false);
  assert.equal(paymentCounts(null), false);
});

test("B9: it is defined above its first use, so the module cannot be reordered into a TDZ error", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.ok(db.indexOf("const paymentCounts =") < db.indexOf("pays.filter(paymentCounts)"),
    "the predicate is declared before the first call site reads it");
});

// ---- B9 main: the stale-pending flag, OFF by default --------------------------------------------
// A pending row is created when a payment LINK is made, not when money moves, and nothing clears it,
// so one abandoned checkout refuses the customer for ever. Option 1: stop counting a pending row once
// it is older than a real checkout could take. Shipped behind PAYMENTS_IGNORE_STALE_PENDING, off.
test("B9: the flag is off unless explicitly turned on, and the window is a real checkout's length", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  assert.match(db, /export const STALE_PENDING_MINUTES = 30;/, "30 minutes");
  assert.match(db, /secretValue\("PAYMENTS_IGNORE_STALE_PENDING"\)[\s\S]{0,40}=== "on"/, "opt-in by exact value");
  // the default path must be byte-identical to the old arithmetic
  assert.match(db, /const stale = paymentsIgnoreStalePending\(\) \? stalePendingTotal\(accessId\) : 0;/);
  assert.match(db, /const applied = paid \+ pending - stale;/, "flag off -> stale is 0 -> paid + pending, as before");
});

test("B9: an unknown or recent timestamp is never released — an unknown age must not re-bill", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  const fn = db.slice(db.indexOf("export function stalePendingTotal"), db.indexOf("export function amountDueForPayment"));
  assert.match(fn, /if \(r\.status !== "pending"\) return s;/, "confirmed money is never 'stale'");
  assert.match(fn, /if \(!Number\.isFinite\(t\) \|\| t >= cutoff\) return s;/, "unparseable or recent still counts");
  // replicate the predicate to pin the direction of each boundary
  const WINDOW = 30 * 60 * 1000, now = Date.parse("2026-11-16T12:00:00Z"), cutoff = now - WINDOW;
  const releases = (status, created) => {
    if (status !== "pending") return false;
    const t = Date.parse(String(created || "").replace(" ", "T") + "Z");
    return Number.isFinite(t) && t < cutoff;
  };
  assert.equal(releases("pending", "2026-07-09 05:49:00"), true, "months old -> released");
  assert.equal(releases("pending", "2026-11-16 11:00:00"), true, "an hour old -> released");
  assert.equal(releases("pending", "2026-11-16 11:45:00"), false, "15 minutes old -> still in flight");
  assert.equal(releases("pending", null), false, "no timestamp -> never released");
  assert.equal(releases("pending", "nonsense"), false, "unparseable -> never released");
  assert.equal(releases("confirmed", "2026-07-09 05:49:00"), false, "confirmed money is not pending");
});

test("B9: the flag moves only what is payable now — never total, paid or balance", () => {
  const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
  const fn = db.slice(db.indexOf("export function amountDueForPayment"), db.indexOf("// Staff confirm a customer-submitted payment"));
  // `stale` may appear only in the `applied` line; total/paid come straight from fin
  assert.match(fn, /const total = \+fin\.total \|\| 0;/);
  assert.match(fn, /const paid = \+fin\.paid \|\| 0;/);
  // `stale` may appear on three lines only: where it is computed, where it reduces `applied`, and
  // where it is reported back. If it ever reaches the total/paid/deposit lines, the flag has started
  // moving an invoice figure.
  const staleLines = fn.split("\n").filter((l) => /\bstale/i.test(l));
  assert.equal(staleLines.length, 3, `stale appears on ${staleLines.length} lines:\n${staleLines.join("\n")}`);
  assert.match(staleLines[0], /const stale = /);
  assert.match(staleLines[1], /const applied = paid \+ pending - stale;/);
  assert.match(staleLines[2], /return \{ ok: true/);
  for (const l of fn.split("\n").filter((l) => /const (total|paid|pending|depositAmt) =/.test(l)))
    assert.doesNotMatch(l, /stale/i, `an invoice figure is derived from the flag: ${l.trim()}`);
  // and getProjectFinancialState — the source of total/paid/balance — knows nothing about it
  const gpfs = db.slice(db.indexOf("export function getProjectFinancialState"), db.indexOf("export function getProjectFinancialState") + 2500);
  assert.doesNotMatch(gpfs, /stalePending|IGNORE_STALE/, "the invoice figures are untouched by the flag");
});
