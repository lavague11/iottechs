// Detailed proposal PDF (node --test): the SAME proposal version rendered with every package expanded
// and a system summary first. Standard stays concise; money is identical; components explain the
// package total and are never added again; no internal cost appears; pagination safeguards hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadProposalPdf, PDF_PAGE } from "../lib/proposal-pdf.js";

let seq = 0;
const block = (name, parts) => ({ id: `b${seq++}`, name, qty: 1, price: 0, sub: parts.map(([n, q, pr]) => ({ id: `s${seq++}`, name: n, qty: q, price: pr })) });
function audioProposal(n = 10) {
  const items = [
    { id: "amp", name: "Amplifier (4-Zone)", qty: 1, price: 350, ampSlot: 1 },
    { id: "rack", name: "Rack & Mount", qty: 1, price: 150, ampSlot: 2 },
    ...Array.from({ length: n }, () => block("Ceiling Speaker", [["Ceiling Speaker", 1, 75], ["Speaker Wire Run", 1, 150], ["Drill Mount Tune", 1, 75]])),
  ];
  return { id: 42, version: 2, tax_rate: 0, deposit_pct: 50, created_at: "2026-09-27 10:00:00", created_by_name: "Ahmed",
    payload: { options: [{ id: "A", name: "Premium Security", services: [{ key: "sound", label: "Sound System", items }] }], payment_plan: "50_50", discount: { type: "flat", value: 350 }, pcp_credit: 350 } };
}
function cctvProposal() {
  const cams = ["Front Entrance", "Rear Lot", "Bay 1"].map((loc) => block(loc, [["Camera", 1, 70], ["Cat6 Drop", 1, 150], ["Cat6 Termination", 1, 20], ["Camera Mounting", 1, 20], ["Camera Programming", 1, 0]]));
  const items = [{ id: "nvr", name: "NVR (8-Channel)", qty: 1, price: 150 }, { id: "hdd", name: "8TB Storage Drive", qty: 1, price: 360, slot: 1 }, ...cams];
  return { id: 43, version: 1, tax_rate: 6.625, deposit_pct: 50, created_at: "2026-09-27 10:00:00",
    payload: { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items }] }], payment_plan: "50_50", discount: { type: "flat", value: 0 }, pcp_credit: 0 } };
}
const render = (p, mode) => {
  const trace = [], footers = [], warnings = [];
  const meta = { customerName: "Zain Farooq", __trace: trace, __footers: footers, __warnings: warnings, __return: true, mode };
  const doc = downloadProposalPdf(p, meta);
  return { trace, footers, warnings, pages: doc.getNumberOfPages(), texts: trace.map((t) => t.text), label: meta.__docLabel };
};
const count = (texts, needle) => texts.filter((t) => t === needle).length;
const has = (texts, needle) => texts.some((t) => t.toLowerCase() === needle.toLowerCase());
const pageOf = (trace, needle) => [...new Set(trace.filter((t) => t.text.includes(needle)).map((t) => t.page))];

test("audio: standard stays concise; detailed adds a system summary and expands all ten packages; totals identical", () => {
  const p = audioProposal(10);
  const std = render(p, "standard"), det = render(p, "detailed");
  assert.equal(count(std.texts, "Speaker Wire Run"), 0);
  assert.equal(count(std.texts, "SYSTEM SUMMARY"), 0);
  assert.equal(count(std.texts, "Ceiling Speaker"), 10);
  assert.equal(std.label, "SYSTEM PROPOSAL"); assert.equal(det.label, "DETAILED PROPOSAL");
  assert.equal(count(det.texts, "10 × Ceiling Speaker"), 1, "the speaker hardware is implied by the package line, not repeated");

  assert.ok(det.texts.includes("SYSTEM SUMMARY") && det.texts.includes("DETAILED SYSTEM BREAKDOWN"));
  assert.ok(det.texts.includes("10 × Ceiling Speaker"));
  assert.ok(has(det.texts, "1 × Amplifier (4-Zone)"));
  assert.ok(det.texts.includes("10 × Speaker Wire Run"));
  assert.equal(count(det.texts, "Speaker Wire Run"), 10, "one component row per package");
  assert.equal(count(det.texts, "Drill Mount Tune"), 10);
  assert.equal(count(det.texts, "$300.00"), 20, "each package prints its unit and its total once (10 × 2), components never re-add it");
  for (const needle of ["$3,500.00", "-$350.00", "$2,800.00"]) { assert.ok(std.texts.includes(needle), needle); assert.ok(det.texts.includes(needle), needle); }
  assert.ok(det.pages >= std.pages);
  assert.deepEqual(det.warnings, []);
  assert.deepEqual(det.trace.filter((t) => t.y > PDF_PAGE.BOTTOM), [], "nothing under the footer");
  assert.equal(new Set([...pageOf(det.trace, "PAYMENT TERMS"), ...pageOf(det.trace, "Price subject to applicable sales tax")]).size, 1);
  assert.deepEqual(det.footers, Array.from({ length: det.pages }, (_, i) => `Proposal | ${i + 1}`));
});

test("cctv: named locations, Included for $0 components, recorder + storage in the summary, no internal cost", () => {
  const det = render(cctvProposal(), "detailed");
  assert.ok(det.texts.includes("3 × Camera location"));
  assert.ok(has(det.texts, "1 × NVR (8-Channel)"));
  assert.ok(has(det.texts, "1 × 8TB Storage Drive"));
  for (const loc of ["Front Entrance", "Rear Lot", "Bay 1"]) assert.ok(det.texts.includes(loc), loc);
  assert.equal(count(det.texts, "Cat6 Drop"), 3);
  assert.equal(count(det.texts, "Included"), 3, "a $0 component reads Included");
  assert.ok(!det.texts.some((t) => /\b(cost|margin|payout|commission)\b/i.test(t)));
  const std = render(cctvProposal(), "standard");
  assert.equal(count(std.texts, "Cat6 Drop"), 0);
});

test("multi-service: a section and subtotal per service, one project total, components under each package", () => {
  const a = audioProposal(4), c = cctvProposal();
  const p = { ...a, payload: { ...a.payload, options: [{ id: "A", name: "Premium Security", services: [...c.payload.options[0].services, ...a.payload.options[0].services] }] } };
  const det = render(p, "detailed");
  assert.ok(det.texts.includes("SECURITY CAMERAS") && det.texts.includes("SOUND SYSTEM"));
  assert.ok(det.texts.includes("Security Cameras Subtotal") && det.texts.includes("Sound System Subtotal"));
  assert.equal(count(det.texts, "PROJECT SUBTOTAL"), 1);
  assert.equal(count(det.texts, "GRAND TOTAL"), 1);
  assert.equal(count(det.texts, "Cat6 Drop"), 3);
  assert.equal(count(det.texts, "Drill Mount Tune"), 4);
  assert.deepEqual(det.trace.filter((t) => t.y > PDF_PAGE.BOTTOM), []);
});

test("a package priced on top of its components is flagged internally, never re-priced", () => {
  const p = audioProposal(1);
  p.payload.options[0].services[0].items[2].price = 25;   // parent carries $25 of its own
  const det = render(p, "detailed");
  assert.equal(det.warnings.length, 1);
  assert.match(det.warnings[0], /differs from package total/);
  assert.ok(det.texts.includes("$325.00"), "package total keeps the canonical value");
});
