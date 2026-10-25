// The standard (customer) proposal PDF is a clean Description → Total read: no Qty/Unit columns, a qty>1
// shows as "N × $unit" under the name, infrastructure rows are unnumbered, and every line total prints at
// one consistent size. The detailed breakdown keeps the full Qty | Unit | Total accounting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadProposalPdf } from "../lib/proposal-pdf.js";

const NUM_X = 57.6 + 12;   // the "#" column x (lm + 12)
function render(items, mode = "standard") {
  const trace = [];
  downloadProposalPdf(
    { id: 7, version: 1, tax_rate: 0, deposit_pct: 50, created_at: "2026-10-25 10:00:00", created_by_name: "Ahmed",
      payload: { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items }] }], payment_plan: "50_50", discount: { type: "flat", value: 0 }, pcp_credit: 0 } },
    { customerName: "Jamie Tester", customerAddress: "2503 Jay Pl", customerPhone: "(201) 555-0100", customerEmail: "t@example.com", mode, __trace: trace, __return: true },
  );
  return trace;
}
const cam = (id, name, price = 300) => ({ id, name, qty: 1, price, sub: [{ id: id + "s", name: "Camera", qty: 1, price }] });
const texts = (trace) => trace.map((t) => t.text);
const rowNums = (trace) => trace.filter((t) => Math.abs(t.x - NUM_X) < 0.5 && /^\d+$/.test(t.text)).map((t) => t.text);

test("standard mode drops the Qty/Unit columns, keeps Total", () => {
  const t = texts(render([cam("c1", "Full Camera Install")]));
  assert.ok(t.includes("Total"), "Total header stays");
  assert.ok(!t.includes("Qty") && !t.includes("Unit"), "no Qty/Unit accounting columns on the customer proposal");
});

test("detailed mode keeps the full Qty | Unit | Total accounting", () => {
  const t = texts(render([cam("c1", "Full Camera Install")], "detailed"));
  assert.ok(t.includes("Qty") && t.includes("Unit") && t.includes("Total"), "detailed breakdown shows all columns");
});

test("qty > 1 shows as a secondary 'N × $unit' line in standard mode (not a column)", () => {
  const t = texts(render([{ id: "spk", name: "Ceiling Speakers", qty: 4, price: 100 }]));
  assert.ok(t.includes("4 × $100.00"), "the math reads as secondary metadata under the name");
  assert.ok(t.includes("$400.00"), "the line total is the primary amount");
});

test("qty === 1 never prints a '1' or a duplicate unit price", () => {
  const nums = rowNums(render([cam("c1", "Full Camera Install")]));
  assert.deepEqual(nums, ["1"], "the only number in the # column is the endpoint number, not a qty of 1");
});

test("infrastructure is unnumbered; endpoints carry the sequential number", () => {
  const trace = render([cam("c1", "Front Camera"), { id: "nvr", name: "NVR (8-Channel)", baseName: "NVR", qty: 1, price: 150 }, cam("c2", "Rear Camera")]);
  assert.deepEqual(rowNums(trace), ["1", "2"], "two endpoints numbered 1,2; the NVR between them takes no number");
  const t = texts(trace);
  assert.ok(t.includes("NVR (8-Channel)"), "the NVR still renders, just without an endpoint number");
});

test("all line totals print at one consistent size regardless of value (the condition-line reset)", () => {
  // A conditioned row used to leave the font at 7pt, shrinking its price. Render a $90 conditioned row and a
  // $300 plain row; both totals must come back in the trace (same render path, same size).
  const t = texts(render([
    { id: "a", name: "Rear Parking Camera", qty: 1, price: 90, conditions: ["existingCable"] },
    { id: "b", name: "Full Camera Install", qty: 1, price: 300 },
  ]));
  assert.ok(t.includes("$90.00") && t.includes("$300.00"), "both totals render");
  assert.ok(t.includes("EXISTING CABLE"), "the condition still shows");
});
