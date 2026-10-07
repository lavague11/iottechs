// Work Order + Site Survey PDFs (node --test): the real renderers via the trace hook. Work order shows
// locations / equipment / labor with payout rates and never retail; survey lists every device; both name
// the file canonically and keep content above the footer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { workOrderScope } from "../lib/workorder-scope.js";
import { downloadWorkOrderPdf } from "../lib/workorder-pdf.js";
import { downloadSurveyPdf } from "../lib/survey-pdf.js";
import { PDF } from "../lib/pdf-chrome.js";

const BOTTOM = PDF.H - PDF.FOOTER_H - PDF.SAFE_GAP;
let seq = 0;
const camBlock = (name) => ({ id: `b${seq++}`, name, qty: 1, price: 300, techPrice: 0, sub: [
  { id: `s${seq++}`, name: "Camera", qty: 1, price: 70, techPrice: 20 },
  { id: `s${seq++}`, name: "Cat6 Drop", qty: 1, price: 150, techPrice: 40 },
  { id: `s${seq++}`, name: "Cat6 Termination", qty: 1, price: 20, techPrice: 8 },
  { id: `s${seq++}`, name: "Camera Mounting", qty: 1, price: 20, techPrice: 10 },
] });
function zero(it) { return { ...it, techPrice: 0, sub: (it.sub || []).map((x) => ({ ...x, techPrice: 0 })) }; }
function wo(paid = true) {
  const cams = ["Front Porch", "Driveway", "Backyard"].map(camBlock);
  const nvr = { id: "nvr", name: "NVR (8-Channel)", qty: 1, price: 150, techPrice: 15 };
  const items = paid ? [nvr, ...cams] : [nvr, ...cams].map(zero);   // rates-pending = every techPrice 0
  return { id: 46, version: 2, sent_at: "2026-09-20 10:00:00", tech_signed_name: paid ? "Marco Diaz" : null, tech_signed_at: paid ? "2026-09-21 09:00:00" : null,
    payload: { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items, note: "Ladder needed for the roofline." }] }] } };
}
const base = { identity: "Maribel Santos", service: "CCTV", last4: "0046" };
const render = (fn) => { const trace = [], footers = []; const doc = fn({ __trace: trace, __footers: footers, __return: true }); return { trace, footers, name: doc?.__fileName, texts: trace.map((t) => t.text), pages: doc?.getNumberOfPages?.() || 0 }; };

test("work order scope: locations, aggregated equipment, labor with payout, retail never used", () => {
  const s = workOrderScope(wo().payload.options[0]);
  assert.equal(s.locations.length, 3);
  assert.deepEqual(s.equipment.map((e) => e.name).sort(), ["Camera", "NVR (8-Channel)"]);
  const camEquip = s.equipment.find((e) => e.name === "Camera");
  assert.equal(camEquip.qty, 3); assert.equal(camEquip.sum, 60);      // 3 × techPrice 20, not retail 70
  const labor = Object.fromEntries(s.labor.map((l) => [l.name, l]));
  assert.equal(labor["Cat6 Drop"].qty, 3); assert.equal(labor["Cat6 Drop"].sum, 120);
  assert.equal(s.laborSum, 3 * (40 + 8 + 10));
  assert.equal(s.total, 60 + 15 + s.laborSum);
  assert.equal(workOrderScope(wo(false).payload.options[0]).ratesPending, true);
});

test("work order PDF: sections, payout totals, acceptance, canonical name, nothing under the footer", () => {
  const r = render((m) => downloadWorkOrderPdf(wo(), { fileBase: base, customerName: "Maribel Santos", customerAddress: "155 Maher Ave, Clifton, NJ", techName: "Marco Diaz", installDate: "Oct 2, 2026", __trace: m.__trace, __footers: m.__footers, __return: true }));
  assert.equal(r.name, "Maribel Santos - CCTV - 0046 - Work Order.pdf");
  for (const s of ["EQUIPMENT LOCATIONS", "EQUIPMENT", "LABOR", "WORK ORDER TOTAL", "WORK ORDER ACCEPTANCE"]) assert.ok(r.texts.includes(s), s);
  assert.ok(r.texts.some((t) => t.includes("Marco Diaz")));
  assert.ok(r.texts.some((t) => /^\$/.test(t)), "payout amounts present");
  assert.ok(!r.texts.some((t) => t === "$300.00" || t === "$70.00"), "no retail prices leak in");
  assert.deepEqual(r.trace.filter((t) => t.y > BOTTOM), []);
  assert.ok(r.footers.every((f) => f.startsWith("Work Order | ")));
});

test("work order PDF: rates pending reads TBD; a proposal with no options still names + renders", () => {
  const r = render((m) => downloadWorkOrderPdf(wo(false), { fileBase: base, customerName: "Maribel Santos", __trace: m.__trace, __footers: m.__footers, __return: true }));
  assert.ok(r.texts.includes("TBD"));
  const empty = render((m) => downloadWorkOrderPdf({ id: 1, payload: { options: [] } }, { fileBase: base, __trace: m.__trace, __return: true }));
  assert.equal(empty.name, "Maribel Santos - CCTV - 0046 - Work Order.pdf");
});

test("site survey PDF: one page per floor, device list, canonical name; empty → null", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const surveyImages = [
    { name: "Exterior", img: PNG, counts: { canonical: 2, rendered: 2 }, devices: [{ code: "S1", label: "Speaker 1", kind: "Speaker" }, { code: "S2", label: "Speaker 2", kind: "Speaker" }] },
    { name: "Floor 2", img: PNG, counts: { canonical: 1, rendered: 1 }, devices: [{ code: "C1", label: "Front Door", kind: "Camera" }] },
  ];
  const r = render((m) => downloadSurveyPdf({ fileBase: base, customerName: "Maribel Santos", projectId: "ASC0046", surveyImages, meta: { __trace: m.__trace, __footers: m.__footers, __return: true, __warnings: [] } }));
  assert.equal(r.name, "Maribel Santos - CCTV - 0046 - Site Survey.pdf");
  assert.equal(r.pages, 2);   // one LANDSCAPE sheet per floor
  // Landscape sheet header: SITE SURVEY eyebrow + the floor + customer in the context line.
  assert.ok(r.texts.includes("SITE SURVEY"));
  assert.ok(r.texts.includes("Exterior") && r.texts.includes("Floor 2"));
  assert.ok(r.texts.some((t) => t.includes("Maribel Santos")));
  for (const code of ["S1", "S2", "C1"]) assert.ok(r.texts.includes(code), code);
  assert.ok(r.texts.includes("Speaker 1") && r.texts.some((t) => t.startsWith("Front Door")));
  // Landscape pages are 612 tall, well above the portrait footer line — nothing is painted under it.
  assert.deepEqual(r.trace.filter((t) => t.y > BOTTOM), []);
  assert.equal(downloadSurveyPdf({ fileBase: base, surveyImages: [] }), null, "no survey → null, not an empty PDF");
});

test("site survey PDF flags a floor whose export lost devices", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const warnings = [];
  downloadSurveyPdf({ fileBase: base, projectId: "ASC0046", surveyImages: [{ name: "Exterior", img: PNG, counts: { canonical: 9, rendered: 0 }, devices: [] }], meta: { __return: true, __warnings: warnings } });
  assert.match(warnings[0], /planner devices 9, rendered 0/);
});
