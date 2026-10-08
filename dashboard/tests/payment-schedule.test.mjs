// Payment schedule (node --test): one schedule source for the builder, the customer view and the PDF.
// A pay-in-full plan is ONE milestone (before we begin / upon completion / by a chosen date), never a
// "Deposit 100% + Final 0%" split. Multi-phase plans keep their milestones; amounts track the total.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planScheduleRows, fmtPlanDate } from "../lib/proposal.js";
import { downloadProposalPdf } from "../lib/proposal-pdf.js";

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
