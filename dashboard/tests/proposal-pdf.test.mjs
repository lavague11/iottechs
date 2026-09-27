// Proposal PDF pagination (node --test): every page has a reserved safe area above the footer; the
// Payment Terms and Acceptance blocks never straddle pages; long descriptions get taller rows; every
// line item is printed; page numbers follow the real page count. Runs the real jsPDF renderer with
// the trace hook (no file is written).
import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadProposalPdf, PDF_PAGE } from "../lib/proposal-pdf.js";

const LONG = "Exterior 4K Turret Camera — north parking lot pole, weatherproof housing, IR night vision, cabled back through the shared conduit to the rack";
function proposal(n, { long = false, plan = "50_50", discount = 0, pcp = 0, tax = 6.625, services = 1 } = {}) {
  const items = Array.from({ length: n }, (_, i) => ({ id: `li${i}`, name: long && i % 3 === 0 ? `${LONG} #${i + 1}` : `Camera Location ${i + 1}`, qty: 1, price: 350 }));
  const per = Math.ceil(n / services);
  const svcs = Array.from({ length: services }, (_, s) => ({ key: s === 0 ? "camera" : "wiring", label: s === 0 ? "Security Cameras" : "Wiring / Low-Voltage", items: items.slice(s * per, (s + 1) * per) })).filter((s) => s.items.length);
  return {
    id: 32, version: 1, tax_rate: tax, deposit_pct: 50, created_at: "2026-09-27 10:00:00", created_by_name: "Ahmed",
    payload: { options: [{ id: "A", name: "Premium Security", services: svcs }], payment_plan: plan, discount: { type: "flat", value: discount }, pcp_credit: pcp },
  };
}
function render(p) {
  const trace = [], footers = [];
  const doc = downloadProposalPdf(p, { customerName: "Test Client", customerAddress: "1 Main St, Hoboken, NJ", customerPhone: "(201) 555-0100", customerEmail: "t@example.com", __trace: trace, __footers: footers, __return: true });
  return { doc, trace, footers, pages: doc.getNumberOfPages() };
}
const pageOf = (trace, needle) => [...new Set(trace.filter((t) => t.text.includes(needle)).map((t) => t.page))];

for (const [label, n, opts] of [["short", 1, {}], ["medium", 10, {}], ["long", 30, {}], ["wrapped", 14, { long: true }], ["three-phase + discount + credit", 9, { plan: "50_30_20", discount: 100, pcp: 50 }], ["two services", 22, { services: 2 }]]) {
  test(`${label}: no content below the safe area, blocks intact, every item printed, page numbers real`, () => {
    const p = proposal(n, opts);
    const { trace, footers, pages } = render(p);
    // 1. Safe area: no content text baseline at or below BOTTOM on any page (footer is chrome, excluded).
    const low = trace.filter((t) => t.y > PDF_PAGE.BOTTOM);
    assert.deepEqual(low, [], `content painted under the footer: ${JSON.stringify(low.slice(0, 3))}`);
    // 2. Every line item name is printed somewhere.
    for (const it of p.payload.options[0].services.flatMap((s) => s.items)) {
      const head = it.name.slice(0, 24);
      assert.ok(trace.some((t) => t.text.includes(head) || t.text.includes(head.replace(/\b\w/g, (c) => c.toUpperCase()))), `missing item ${it.name}`);
    }
    // 3. Payment Terms is one block: heading, schedule, methods, plan terms and the tax note share a page.
    const pay = new Set([...pageOf(trace, "PAYMENT TERMS"), ...pageOf(trace, "Payment methods:"), ...pageOf(trace, "Price subject to applicable sales tax"), ...pageOf(trace, "Deposit"), ...pageOf(trace, "Final")]);
    assert.equal(pay.size, 1, `payment terms split across pages ${[...pay]}`);
    // 4. Acceptance is one block: heading, instruction, labels and signature line share a page.
    const acc = new Set([...pageOf(trace, "ACCEPTANCE OF PROPOSAL"), ...pageOf(trace, "By signing below"), ...pageOf(trace, "AUTHORIZED SIGNATURE"), ...pageOf(trace, "PREPARED BY")]);
    assert.equal(acc.size, 1, `acceptance split across pages ${[...acc]}`);
    // 5. Column header follows the table onto every page that has rows (no orphaned rows).
    const rowPages = new Set(trace.filter((t) => /^Camera Location|^Exterior 4K/.test(t.text)).map((t) => t.page));
    for (const pg of rowPages) assert.ok(trace.some((t) => t.page === pg && t.text === "Description"), `page ${pg} has rows but no column header`);
    // 6. Page numbers come from the real page count, in order.
    assert.deepEqual(footers, Array.from({ length: pages }, (_, i) => `Proposal | ${i + 1}`));
  });
}

test("page count grows with content and long descriptions take taller rows", () => {
  const a = render(proposal(1)).pages, b = render(proposal(10)).pages, c = render(proposal(30)).pages;
  assert.ok(a <= b && b < c, `pages ${a} ${b} ${c}`);
  const plain = render(proposal(6)).trace, wrapped = render(proposal(6, { long: true })).trace;
  const gap = (tr) => { const ys = tr.filter((t) => /^Camera Location|^Exterior 4K/.test(t.text) && t.page === 1).map((t) => t.y); return Math.max(...ys) - Math.min(...ys); };
  assert.ok(gap(wrapped) > gap(plain), "wrapped descriptions must push the rows below them down");
  const lowerLong = LONG.toLowerCase();
  const firstLines = wrapped.filter((t) => /^exterior 4k/i.test(t.text)).length;
  const continuation = wrapped.filter((t) => t.text.length > 5 && !/^exterior 4k/i.test(t.text) && lowerLong.includes(t.text.toLowerCase().replace(/ #\d+$/, "").trim())).length;
  assert.ok(firstLines >= 2 && continuation >= 2, `long names wrap onto continuation lines (${firstLines} first, ${continuation} continuation)`);
});

test("Payment Terms moves whole to the next page when the grand total lands near the bottom", () => {
  // Sweep sizes: at least one proposal ends its totals low enough that Payment Terms must move, and
  // when it does, Grand Total stays on the earlier page while the whole block lands on the next.
  let moved = 0;
  for (let n = 1; n <= 24; n++) {
    const { trace } = render(proposal(n));
    const gt = pageOf(trace, "GRAND TOTAL")[0], pt = pageOf(trace, "PAYMENT TERMS")[0];
    assert.ok(pt === gt || pt === gt + 1, `n=${n}: payment terms page ${pt} vs grand total page ${gt}`);
    if (pt === gt + 1) {
      moved++;
      const firstOnPage = Math.min(...trace.filter((t) => t.page === pt).map((t) => t.y));
      assert.ok(firstOnPage < PDF_PAGE.TOP + 40, `n=${n}: the moved block should start at the top of page ${pt}`);
    }
  }
  assert.ok(moved > 0, "the sweep never exercised the move-to-next-page path");
});
