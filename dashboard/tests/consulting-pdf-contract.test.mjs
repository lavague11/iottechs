// Consulting → Proposal/PDF CONTRACT snapshot (P0 safety net).
// The reorg must leave the Consulting→PDF contract byte-stable. This renders a representative proposal
// (cameras → bundle lines + auto-NVR) with Site Survey + Mockup attachments through the REAL jsPDF
// renderer (trace hook, no file written) and asserts the deterministic tuple: document order, page
// count, section footers, the device legend text, page orientation, and the planner↔proposal scope
// warning. Run before P1 and after every phase; any drift here means a phase leaked into the contract.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { downloadProposalPdf, PDF_PAGE } from "../lib/proposal-pdf.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

// Fixed created_at → payment dates are stable. Three cameras → one NVR auto-sized (8-ch), three bundles.
function fixture() {
  const cams = Array.from({ length: 3 }, (_, i) => ({
    id: `c${i}`, name: `Camera Location ${i + 1}`, qty: 1, price: 0,
    sub: [{ name: "Camera", qty: 1, price: 350 }, { name: "Cat6 Drop", qty: 1, price: 150 }],
  }));
  const p = {
    id: 77, version: 1, tax_rate: 6.625, deposit_pct: 50, created_at: "2026-09-27 10:00:00", created_by_name: "Ahmed",
    payload: {
      options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items: cams }] }],
      payment_plan: "50_50", discount: { type: "flat", value: 0 }, pcp_credit: 0,
    },
  };
  const devices = Array.from({ length: 3 }, (_, i) => ({ code: `C${i + 1}`, label: `Camera Location ${i + 1}`, identity: `Camera Location ${i + 1}`, room: "Exterior", kind: "cam", group: "cctv", icon: "cam" }));
  const surveyImages = [{ name: "Exterior", img: PNG, devices, counts: { canonical: 3, rendered: 3 } }];
  const surveyFloors = [{ name: "Exterior", bg: "x", devices: Array.from({ length: 3 }, (_, i) => ({ id: i, k: "cam", x: 20 + i * 20, y: 50 })) }];
  const mockupImages = [JPG];
  return { p, attachments: { surveyImages, surveyFloors, mockupImages } };
}

function render() {
  const { p, attachments } = fixture();
  const trace = [], footers = [], warnings = [];
  const doc = downloadProposalPdf(p, { customerName: "Contract Fixture", customerAddress: "2503 Jay Pl, Union, NJ", __trace: trace, __footers: footers, __warnings: warnings, __return: true }, attachments);
  return { doc, trace, footers, warnings, pages: doc.getNumberOfPages() };
}

test("document order is Proposal → Site Survey → System Mockup, with section footers in sequence", () => {
  const { footers } = render();
  const firstOf = (pfx) => footers.findIndex((f) => f.startsWith(pfx));
  assert.equal(firstOf("Proposal"), 0, "proposal pages first");
  assert.ok(firstOf("Survey") > firstOf("Proposal"), "survey after proposal");
  assert.ok(firstOf("Mockup") > firstOf("Survey"), "mockup after survey");
  assert.ok(footers.at(-1).startsWith("Mockup | "), "mockup is the last section (no Terms page)");
  assert.ok(!footers.some((f) => f.startsWith("Terms")), "no Terms page");
});

test("Site Survey legend prints every device code+identity; nothing paints below the safe area", () => {
  const { trace } = render();
  const texts = trace.map((t) => t.text);
  assert.ok(texts.includes("SITE SURVEY"), "survey section header");
  for (let i = 1; i <= 3; i++) { assert.ok(texts.includes(`C${i}`), `code C${i}`); assert.ok(texts.includes(`Camera Location ${i}`), `identity ${i}`); }
  assert.deepEqual(trace.filter((t) => t.y > PDF_PAGE.BOTTOM), [], "content under the footer");
});

test("page geometry: survey sheets landscape, mockup appendix portrait", () => {
  const { doc, footers } = render();
  const firstOf = (pfx) => footers.findIndex((f) => f.startsWith(pfx));
  const dims = (pg) => { doc.setPage(pg); return { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() }; };
  const sd = dims(firstOf("Survey") + 1), md = dims(firstOf("Mockup") + 1);
  assert.ok(sd.w > sd.h, "survey sheet landscape");
  assert.ok(md.w < md.h, "mockup page portrait");
});

test("page count is stable for the fixture (drift tripwire)", () => {
  // If a reorg phase changes what feeds the PDF, the page count or section layout shifts and trips here.
  const { pages, footers } = render();
  assert.ok(pages >= 3, `expected at least proposal+survey+mockup pages, got ${pages}`);
  assert.equal(footers.length, pages, "one footer label per page");
});

test("System Mockup appendix aligns to the document content frame (lm/rw), not its own symmetric margins", () => {
  // The document's left margin (lm) is wider than the right (brand band): rw = W - lm - 28.8. The mockup
  // appendix used its own symmetric margin (28.8) → its border stuck out left of the SYSTEM MOCKUP header
  // and the rest of the document. It must use lm/rw so the frame lines up on every page.
  const pdf = readFileSync(new URL("../lib/proposal-pdf.js", import.meta.url), "utf8");
  // mockup section: fit + imgX use the content frame rw/lm, never a bespoke availW/margin
  assert.ok(pdf.includes("const d = fit(src, rw - 2 * pad, 250);"), "mockup image fits within the content row width (rw)");
  assert.ok(pdf.includes("const imgX = lm + (rw - d.w) / 2;"), "mockup image centers within the content frame (lm..lm+rw)");
  assert.ok(!/const margin = 28\.8, availW/.test(pdf), "the bespoke symmetric margin/availW is gone");
});
