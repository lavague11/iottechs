// Canonical finance/closure resolver — the owner's lifecycle test cases A–I plus the money math.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProjectFinancialState, signatureDeadlineFrom, FS, SIGNATURE_WINDOW_DAYS } from "../lib/receivables-model.js";

const DAY = 86400000;
const NOW = new Date("2026-06-01T12:00:00");
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
const r = (input) => resolveProjectFinancialState({ now: NOW, ...input });

test("TEST A — approved, unsigned, day 10 → Awaiting Signature (not overdue, no money due)", () => {
  const s = r({ approved: true, signed: false, approvedAt: ago(10), total: 10000, depositPct: 50 });
  assert.equal(s.financialState, FS.AWAITING_SIGNATURE);
  assert.equal(s.isReceivable, true);
  assert.equal(s.amountDueNow, 0, "an approved-unsigned proposal is never money due");
  assert.equal(s.signatureOverdue, false);
  assert.equal(s.shouldAutoCloseUnsigned, false);
  assert.equal(s.agingDays, 10);
  assert.equal(s.agingBasis, "approvedAt");
});

test("TEST B — approved, unsigned, day 31 → overdue → flagged for auto-close", () => {
  const s = r({ approved: true, signed: false, approvedAt: ago(31), total: 10000 });
  assert.equal(s.financialState, FS.AWAITING_SIGNATURE);
  assert.equal(s.signatureOverdue, true);
  assert.equal(s.shouldAutoCloseUnsigned, true, "the daily job closes it as Closed — Unsigned");
  assert.equal(s.amountDueNow, 0);
});

test("TEST C — signed day 20, deposit unpaid → Awaiting Deposit; NOT auto-closed at day 30", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(30), total: 10000, depositPct: 50, paidConfirmed: 0 });
  assert.equal(s.financialState, FS.AWAITING_DEPOSIT);
  assert.equal(s.amountDueNow, 5000, "only the unpaid deposit is due now");
  assert.equal(s.pendingAmount, 5000, "the remaining balance is future");
  assert.equal(s.shouldAutoCloseUnsigned, false, "deposit states never auto-close");
  assert.equal(s.agingBasis, "signedAt");
});

test("TEST D — signed, deposit unpaid, day 90 → still Awaiting Deposit (open)", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(90), total: 10000, depositPct: 50, paidConfirmed: 0 });
  assert.equal(s.financialState, FS.AWAITING_DEPOSIT);
  assert.equal(s.amountDueNow, 5000);
  assert.equal(s.agingDays, 90);
  assert.equal(s.shouldAutoCloseUnsigned, false);
});

test("TEST E — closed (manual) → Closed, history preserved, reopenable, nothing active", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(40), total: 10000, depositPct: 50, paidConfirmed: 0,
                closed: true, closedAt: ago(5), closeReason: "Customer declined" });
  assert.equal(s.financialState, FS.CLOSED);
  assert.equal(s.isReceivable, false);
  assert.equal(s.amountDueNow, 0);
  assert.equal(s.pendingAmount, 0);
  assert.equal(s.canReopen, true);
  assert.equal(s.agingDays, 5);
  assert.equal(s.agingBasis, "closedAt");
});

test("TEST F — reopened signed + deposit unpaid → Awaiting Deposit", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(50), total: 10000, depositPct: 50, paidConfirmed: 0,
                closed: false, reopenedAt: ago(3) });
  assert.equal(s.financialState, FS.AWAITING_DEPOSIT);
  assert.equal(s.amountDueNow, 5000);
});

test("TEST G — auto-closed unsigned, reopened → Awaiting Signature with a NEW 30-day window from reopen", () => {
  const s = r({ approved: true, signed: false, approvedAt: ago(120), reopenedAt: ago(10), total: 10000 });
  assert.equal(s.financialState, FS.AWAITING_SIGNATURE);
  assert.equal(s.signatureOverdue, false, "the clock restarts from reopenedAt, not the stale approval");
  assert.equal(s.agingBasis, "reopenedAt");
  assert.equal(s.agingDays, 10);
  // deadline = reopenedAt + 30d
  const expected = signatureDeadlineFrom(ago(10)).getTime();
  assert.equal(s.signatureDeadline.getTime(), expected);
});

test("TEST H — 100%-on-completion (no deposit) signed → NO Awaiting Deposit (Pending until completion)", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(5), total: 10000, depositPct: 0, paidConfirmed: 0, completed: false });
  assert.equal(s.financialState, FS.PENDING);
  assert.equal(s.amountDueNow, 0);
  assert.equal(s.pendingAmount, 10000);
});

test("TEST I — 50/50 signed → only the first 50% is Due Now; remaining 50% stays Pending", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(2), total: 10000, depositPct: 50, paidConfirmed: 0 });
  assert.equal(s.financialState, FS.AWAITING_DEPOSIT);
  assert.equal(s.amountDueNow, 5000);
  assert.equal(s.pendingAmount, 5000);
});

// ── additional money-model coverage ─────────────────────────────────────────
test("deposit paid, not completed → Pending (remaining balance is future, nothing due)", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(10), total: 10000, depositPct: 50, paidConfirmed: 5000, completed: false });
  assert.equal(s.financialState, FS.PENDING);
  assert.equal(s.amountDueNow, 0);
  assert.equal(s.pendingAmount, 5000);
  assert.equal(s.paidAmount, 5000);
});

test("deposit paid, completed, balance remaining → Due Now (completion balance)", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(30), total: 10000, depositPct: 50, paidConfirmed: 5000,
                completed: true, completedAt: ago(4) });
  assert.equal(s.financialState, FS.DUE_NOW);
  assert.equal(s.amountDueNow, 5000);
  assert.equal(s.agingDays, 4);
  assert.equal(s.agingBasis, "completedAt");
});

test("paid in full → Collected (nothing due or pending)", () => {
  const s = r({ approved: true, signed: true, signedAt: ago(40), total: 10000, depositPct: 50, paidConfirmed: 10000, completed: true });
  assert.equal(s.financialState, FS.COLLECTED);
  assert.equal(s.amountDueNow, 0);
  assert.equal(s.pendingAmount, 0);
  assert.equal(s.balance, 0);
});

test("not approved and not signed → not a receivable (never shown / counted)", () => {
  const s = r({ approved: false, signed: false, total: 10000 });
  assert.equal(s.financialState, FS.NONE);
  assert.equal(s.isReceivable, false);
  assert.equal(s.amountDueNow, 0);
});

test("a stored signatureDeadline is honored over the derived one", () => {
  const explicit = new Date(NOW.getTime() + 5 * DAY).toISOString();
  const s = r({ approved: true, signed: false, approvedAt: ago(60), signatureDeadline: explicit });
  assert.equal(s.signatureOverdue, false, "stored deadline in the future → not overdue despite old approval");
});

test("signatureDeadlineFrom adds exactly the 30-day window", () => {
  const start = "2026-01-01T00:00:00";
  const d = signatureDeadlineFrom(start);
  assert.equal(Math.round((d.getTime() - new Date(start).getTime()) / DAY), SIGNATURE_WINDOW_DAYS);
});
