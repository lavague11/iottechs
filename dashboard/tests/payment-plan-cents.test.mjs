// Stage 1 (docs/customer-flow-v2.md) — installments must sum EXACTLY to the total, and "due up front"
// must follow each installment's own trigger once custom rows carry one.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planScheduleRows, customPlanRows, splitAmounts, planDepositPct, customWhenOf, CUSTOM_WHEN } from "../lib/proposal.js";

const sum = (ns) => Math.round(ns.reduce((a, b) => a + (+b || 0), 0) * 100) / 100;

test("the reported bug: 50/50 on $2,649.55 no longer prints a cent over", () => {
  const rows = planScheduleRows("50_50", [], 2649.55);
  assert.deepEqual(rows.map((r) => r.amount), [1324.78, 1324.77]);
  assert.equal(sum(rows.map((r) => r.amount)), 2649.55, "the parts are the whole");
});

test("every preset plan sums exactly, at awkward totals", () => {
  for (const total of [2649.55, 1190, 999.99, 0.03, 12345.67]) {
    for (const plan of ["50_50", "50_30_20", "100", "100_end"]) {
      const rows = planScheduleRows(plan, [], total);
      assert.equal(sum(rows.map((r) => r.amount)), total, `${plan} @ ${total}`);
    }
  }
});

test("custom installments sum exactly — the last one absorbs the residual", () => {
  const rows = customPlanRows([{ pct: 34 }, { pct: 33 }, { pct: 33 }], 2649.55);
  assert.equal(sum(rows.map((r) => r.amount)), 2649.55, "no $0.55 lost to whole-dollar rounding");
  assert.equal(rows.length, 3);
});

test("splitAmounts is the one place percentages become dollars", () => {
  assert.deepEqual(splitAmounts([50, 50], 2649.55), [1324.78, 1324.77]);
  assert.deepEqual(splitAmounts([100], 99.99), [99.99]);
  assert.deepEqual(splitAmounts([50, 50], 0), [null, null], "no total → no amounts, never $0.00");
});

test("a row's `when` decides what is due up front, and legacy plans keep their old meaning", () => {
  // Tagged rows: every Before-we-begin installment counts, wherever it sits in the list.
  const tagged = { payment_plan: "custom", custom_plan: { rows: [
    { pct: 20, when: "begin" }, { pct: 30, when: "halfway" }, { pct: 20, when: "begin" }, { pct: 30, when: "completion" },
  ] } };
  assert.equal(planDepositPct(tagged, 50), 40, "20 + 20 due before we begin");
  // A completion-only custom plan owes nothing up front.
  assert.equal(planDepositPct({ payment_plan: "custom", custom_plan: { rows: [{ pct: 100, when: "completion" }] } }, 50), 0);
  // UNTAGGED (date-only) rows are legacy: the first installment was the deposit. That must not change,
  // or every proposal already signed on a custom plan would silently owe a different amount.
  const legacy = { payment_plan: "custom", custom_plan: { rows: [{ pct: 40, due: "2026-01-01" }, { pct: 60, due: "2026-02-01" }] } };
  assert.equal(planDepositPct(legacy, 50), 40);
  assert.equal(customWhenOf({ pct: 10, due: "2026-01-01" }), "date", "no `when` reads as a dated row");
  assert.deepEqual(Object.keys(CUSTOM_WHEN), ["begin", "halfway", "completion", "date"]);
});

test("50 / 30 / 20 is no longer offered but stays renderable for proposals signed on it", () => {
  const builder = readFileSync(new URL("../app/project/[accessId]/proposal-builder.jsx", import.meta.url), "utf8");
  assert.ok(!/>50 \/ 30 \/ 20</.test(builder), "no picker button");
  assert.equal(planScheduleRows("50_30_20", [], 2000).length, 3, "an already-signed 50/30/20 still renders");
});
