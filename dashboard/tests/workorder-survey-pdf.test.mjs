// Work Order + Site Survey PDFs (node --test): the real renderers via the trace hook. Work order shows
// locations / equipment / labor with payout rates and never retail; survey lists every device; both name
// the file canonically and keep content above the footer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { workOrderScope } from "../lib/workorder-scope.js";
import { downloadWorkOrderPdf } from "../lib/workorder-pdf.js";
import { downloadSurveyPdf } from "../lib/survey-pdf.js";
import { PDF } from "../lib/pdf-chrome.js";
import { readFileSync } from "node:fs";

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
  // LABOR became TASKS in the tech-role overhaul: this sheet goes in a van and gets ticked, so the
  // work is a checklist with a box per row, not a price list.
  for (const s of ["EQUIPMENT LOCATIONS", "EQUIPMENT", "TASKS", "WORK ORDER TOTAL", "WORK ORDER ACCEPTANCE"]) assert.ok(r.texts.includes(s), s);
  assert.ok(r.texts.some((t) => t.includes("Marco Diaz")));
  assert.ok(r.texts.some((t) => /^\$/.test(t)), "payout amounts present");
  assert.ok(!r.texts.some((t) => t === "$300.00" || t === "$70.00"), "no retail prices leak in");
  assert.deepEqual(r.trace.filter((t) => t.y > BOTTOM), []);
  assert.ok(r.footers.every((f) => f.startsWith("Work Order | ")));
});

// ──────────────────────────────────────────── the technician's one document (tech-role overhaul)

const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const floors = [
  { name: "Floor 1", img: PNG1, counts: { canonical: 2, rendered: 2 }, devices: [{ code: "C1", label: "Front Entrance", kind: "Camera" }, { code: "C2", label: "Parking Lot", kind: "Camera" }] },
  { name: "Floor 2", img: PNG1, counts: { canonical: 1, rendered: 1 }, devices: [{ code: "C3", label: "Back Door", kind: "Camera" }] },
];

test("the work order PDF carries the job info a tech needs to get through the door", () => {
  const r = render((m) => downloadWorkOrderPdf(wo(), { fileBase: base, customerName: "Buck N Up Store", customerAddress: "155 Maher Ave, Clifton, NJ",
    siteContact: "Maribel Santos", customerPhone: "(917) 727-0081", techName: "Marco Diaz", installDate: "Oct 2, 2026",
    __trace: m.__trace, __footers: m.__footers, __return: true }));
  // infoStrip joins its pairs into one line, so match the line rather than a standalone cell.
  const strip = r.texts.find((t) => t.includes("Technician:")) || "";
  for (const t of ["Site contact:", "Phone:", "Technician:", "Scheduled:"]) assert.ok(strip.includes(t), t);
  assert.ok(strip.includes("Maribel Santos"), "the person to call on site");
  assert.ok(strip.includes("727-0081"), "and their number");
  // The site contact is omitted when it is just the customer again — no line that says nothing.
  const same = render((m) => downloadWorkOrderPdf(wo(), { fileBase: base, customerName: "Maribel Santos", siteContact: "Maribel Santos", __trace: m.__trace, __return: true }));
  assert.ok(!same.texts.some((t) => t.includes("Site contact:")), "no redundant row");
});

test("the work order PDF carries the SITE SURVEY — one landscape sheet per floor", () => {
  const r = render((m) => downloadWorkOrderPdf(wo(), { fileBase: base, customerName: "Maribel Santos", customerAddress: "155 Maher Ave",
    surveyImages: floors, __trace: m.__trace, __footers: m.__footers, __return: true }));
  assert.equal(r.pages, 3, "the work order page + one sheet per floor");
  assert.ok(r.texts.includes("SITE SURVEY"));
  assert.ok(r.texts.includes("Floor 1") && r.texts.includes("Floor 2"));
  for (const code of ["C1", "C2", "C3"]) assert.ok(r.texts.includes(code), code);
  assert.ok(r.texts.some((t) => t.startsWith("Front Entrance")), "placements are named, not just coded");
  // Nothing is painted under a footer on any page, portrait or landscape.
  assert.deepEqual(r.trace.filter((t) => t.y > BOTTOM), []);
  // No survey supplied → no survey pages and no empty header over nothing.
  const none = render((m) => downloadWorkOrderPdf(wo(), { fileBase: base, __trace: m.__trace, __return: true }));
  assert.equal(none.pages, 1);
  assert.ok(!none.texts.includes("SITE SURVEY"));
});

test("cable routes and aim cones are drawn INTO the floor raster, which is why the PDF carries them", () => {
  // The PDF places an image; the routes and cones are painted by the one planner renderer, so this
  // asserts the source rather than re-deriving geometry here. If the renderer ever stopped drawing
  // them, the technician's sheet would quietly lose them with every other surface.
  const src = readFileSync(new URL("../lib/survey2-export.js", import.meta.url), "utf8");
  assert.match(src, /drawExportRoutes\(ctx, f, W, H\);/, "the export draws the wiring runs");
  assert.match(src, /scene\.cones\.forEach/, "and the aim cones");
  // The runs come from the one route model, not a second copy of the geometry.
  assert.match(src, /from "\.\/survey-routes\.js"/);
  // and the proposal appendix + the work order use the SAME sheet renderer
  const wopdf = readFileSync(new URL("../lib/workorder-pdf.js", import.meta.url), "utf8");
  assert.match(wopdf, /c\.surveyFloor\(f, \{/, "work order uses createBrandDoc's surveyFloor");
  const prop = readFileSync(new URL("../lib/proposal-pdf.js", import.meta.url), "utf8");
  assert.match(prop, /surveySheetBody\(doc, f, \{/, "and the proposal uses the same body");
});

test("the tech's PDF shows THEIR budget, or no money at all — never the customer's", () => {
  // Paid per job: their budget, their expenses, what is left. The customer's price is not an input —
  // the proposal reaching this renderer is already sanitized to techPrice.
  const paid = render((m) => downloadWorkOrderPdf(wo(), { fileBase: base, customerName: "X",
    budget: { show: true, budget: 234, spent: 40, remaining: 194 }, __trace: m.__trace, __return: true }));
  assert.ok(paid.texts.includes("YOUR JOB BUDGET"));
  for (const t of ["BUDGET", "EXPENSES", "REMAINING"]) assert.ok(paid.texts.includes(t), t);
  assert.ok(paid.texts.includes("$234.00") && paid.texts.includes("$194.00"));
  assert.ok(!paid.texts.includes("WORK ORDER TOTAL"), "the office's total is replaced, not stacked beneath");
  assert.ok(!paid.texts.some((t) => t === "$300.00" || t === "$70.00"), "no retail anywhere");

  // Hourly / salaried / payouts hidden: no money on the sheet at all, and the rate columns go with it.
  const none = render((m) => downloadWorkOrderPdf(wo(), { fileBase: base, customerName: "X", hidePayout: true, __trace: m.__trace, __return: true }));
  assert.ok(!none.texts.includes("YOUR JOB BUDGET"));
  assert.ok(!none.texts.includes("WORK ORDER TOTAL"));
  assert.ok(!none.texts.includes("Rate") && !none.texts.includes("Total"), "the money columns are dropped, not dashed");
  assert.ok(!none.texts.some((t) => /^\$/.test(t)), "not one dollar figure");
  // The work is still all there — it is a work order, not a receipt.
  for (const s of ["EQUIPMENT LOCATIONS", "EQUIPMENT", "TASKS", "WORK ORDER ACCEPTANCE"]) assert.ok(none.texts.includes(s), s);
  assert.ok(none.texts.includes("Task") && none.texts.includes("Qty"));
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
