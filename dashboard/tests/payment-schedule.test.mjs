// Payment schedule (node --test): one schedule source for the builder, the customer view and the PDF.
// A pay-in-full plan is ONE milestone (before we begin / upon completion / by a chosen date), never a
// "Deposit 100% + Final 0%" split. Multi-phase plans keep their milestones; amounts track the total.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planScheduleRows, fmtPlanDate, planDepositPct, projectFinancials } from "../lib/proposal.js";
import { downloadProposalPdf } from "../lib/proposal-pdf.js";

// The ONE canonical "deposit due up front" %, derived from the payment PLAN — every stage (customer
// summary, Record-a-Payment, completion) must agree. It must NOT follow the legacy deposit_pct when a
// plan is present (that field can drift: a proposal switched to 100%-on-completion but still deposit_pct:50).
test("planDepositPct: up-front % comes from the plan, never a drifted deposit_pct", () => {
  assert.equal(planDepositPct({ payment_plan: "100_end" }, 50), 0, "pay on completion → nothing up front, even if deposit_pct says 50");
  assert.equal(planDepositPct({ payment_plan: "100" }, 50), 100, "prepaid → full up front");
  assert.equal(planDepositPct({ payment_plan: "50_50" }, 99), 50);
  assert.equal(planDepositPct({ payment_plan: "50_30_20" }, 10), 50);
  assert.equal(planDepositPct({ payment_plan: "custom", custom_plan: { rows: [{ pct: 30 }, { pct: 70 }] } }, 50), 30, "custom → first installment %");
  assert.equal(planDepositPct({}, 50), 50, "no plan → fall back to deposit_pct");
  assert.equal(planDepositPct(null, 25), 25);
});

test("projectFinancials + planDepositPct: a 100%-on-completion plan owes $0 deposit (not 50% of the total)", () => {
  // ASC0050's shape: plan 100_end but a stale deposit_pct of 50 on the row.
  const payload = { payment_plan: "100_end" }, grand = 1087.58;
  const fin = projectFinancials(grand, 0, 0, planDepositPct(payload, 50));
  assert.equal(fin.depositTarget, 0, "no deposit due up front");
  assert.equal(fin.depositDue, 0);
  assert.equal(fin.balance, 1087.58, "the full amount is the balance");
  // Contrast: feeding the stale deposit_pct directly reproduces the reported $543.79 bug.
  assert.equal(projectFinancials(grand, 0, 0, 50).depositDue, 543.79);
});

test("pay-in-full is a single row — prepaid, postpaid, or by a chosen date", () => {
  const pre = planScheduleRows("100", null, 1000);
  assert.equal(pre.length, 1);
  assert.deepEqual(pre[0], { pctLabel: "100%", amount: 1000, when: "before we begin" });

  const post = planScheduleRows("100_end", null, 1000);
  assert.equal(post.length, 1);
  assert.equal(post[0].when, "upon completion");
  assert.equal(post[0].pctLabel, "100%");

  const byDate = planScheduleRows("100", null, 1000, "2026-12-01");
  assert.equal(byDate.length, 1);
  assert.equal(byDate[0].when, "by Dec 1, 2026");
  // a date only labels the pay-in-full plans; it never touches a multi-phase plan
  assert.equal(planScheduleRows("50_50", null, 1000, "2026-12-01").length, 2);
});

test("multi-phase plans keep their milestones; amounts track the total", () => {
  assert.deepEqual(planScheduleRows("50_50", null, 1000).map((r) => [r.pctLabel, r.amount, r.when]),
    [["50%", 500, "to begin"], ["50%", 500, "upon completion"]]);
  assert.deepEqual(planScheduleRows("50_30_20", null, 1000).map((r) => [r.pctLabel, r.amount]),
    [["50%", 500], ["30%", 300], ["20%", 200]]);
});

test("fmtPlanDate: ISO → short US date; junk → empty", () => {
  assert.equal(fmtPlanDate("2026-12-01"), "Dec 1, 2026");
  assert.equal(fmtPlanDate(""), "");
  assert.equal(fmtPlanDate("not-a-date"), "");
});

// The PDF renders the schedule from the same source: a 100% plan prints one payment line, never a 0% Final.
const fullProposal = (plan, full_date) => ({
  id: 50, version: 1, tax_rate: 0, deposit_pct: plan === "100_end" ? 0 : 100, created_at: "2026-09-27 10:00:00",
  payload: { options: [{ id: "A", name: "A", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "x", name: "NVR", qty: 1, price: 1000 }] }] }], payment_plan: plan, full_date: full_date || null, discount: { type: "flat", value: 0 }, pcp_credit: 0 },
});
const renderTexts = (p) => { const trace = []; downloadProposalPdf(p, { customerName: "Pay Test", __trace: trace, __return: true }); return trace.map((t) => t.text); };

test("PDF: a 100% plan is one payment line (no 0% Final split)", () => {
  const pre = renderTexts(fullProposal("100"));
  assert.ok(pre.includes("Before we begin"), "prepaid shows 'Before we begin'");
  assert.ok(pre.includes("100%"), "shows 100%");
  assert.ok(!pre.includes("0%"), "no 0% line");
  // exactly one phase cell in the payment table
  assert.equal(pre.filter((t) => t === "Payment").length, 1);
  assert.equal(pre.filter((t) => t === "Final").length, 0);

  const post = renderTexts(fullProposal("100_end"));
  assert.ok(post.includes("Upon completion"));
  assert.ok(!post.includes("0%"));

  const byDate = renderTexts(fullProposal("100", "2026-12-01"));
  assert.ok(byDate.includes("Dec 1, 2026"), "chosen date renders as the due date");
});
