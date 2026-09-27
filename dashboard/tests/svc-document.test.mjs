// Service-call document model (node --test): canonical status, per-device rows + cause badges, the
// factual summary, document type, cost comparison (never a manufactured range) and empty regions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDiagnosis, emptyFinding, emptyOption, devicesFromCameras, deviceRows, autoSummary, documentModel, sanitizeDiagnosis, proposalScopeLines } from "../lib/svc-model.js";
import { SVC_STATUSES, SVC_STATUS_ALIAS, svcStatusLabel, svcIsOpen, svcStepIndex, svcAutoAdvance } from "../lib/svc-status.js";

const cams = Array.from({ length: 8 }, (_, i) => ({ tag: `C${i + 1}`, label: `C${i + 1} — Pos ${i + 1}` }));
function gnzCase() {
  const doc = emptyDiagnosis();
  doc.systems = ["cctv"];
  doc.devices = devicesFromCameras(cams, { nvrCount: 0 });
  const pull = emptyFinding("cctv", ["cam:C1", "cam:C2", "cam:C3"]);
  pull.symptoms = ["No video"]; pull.rootCauses = ["cable"]; pull.finding = "Cables pulled from the pole bundle."; pull.outcome = "needs_replace";
  const sensor = emptyFinding("cctv", ["cam:C4"]);
  sensor.symptoms = ["No video"]; sensor.rootCauses = ["camera_hw"]; sensor.outcome = "needs_replace";
  const power = emptyFinding("cctv", ["cam:C6"]);
  power.symptoms = ["No power"]; power.rootCauses = ["power"]; power.outcome = "needs_repair";
  const restored = emptyFinding("cctv", ["cam:C5"]);
  restored.symptoms = ["Intermittent"]; restored.rootCauses = ["termination"]; restored.work = ["reterminated"]; restored.outcome = "repaired";
  doc.findings = [pull, sensor, power, restored];
  doc.deviceState = { "cam:C8": { status: "OK", fields: { cable: "Separate route", power: "Output OK", video: "Normal" } }, "cam:C1": { status: "", fields: { cable: "Visible pull damage", power: "No output", video: "No signal" } } };
  return doc;
}
const call = { svc_id: "SVC0032", stage: "findings_ready", issue: "Delivery truck caught the exterior cable bundle.", customer: "GNZ Auto Group", contact_name: "G. Reynoso" };

test("status: 13 canonical states, legacy keys alias, open/closed, roll-up, forward-only auto-advance", () => {
  assert.equal(SVC_STATUSES.length, 13);
  assert.equal(svcStatusLabel("submitted"), "Draft");
  assert.equal(svcStatusLabel("onsite"), "On Site");
  assert.equal(SVC_STATUS_ALIAS.resolved, "completed");
  assert.equal(svcIsOpen("quoted"), true);
  assert.equal(svcIsOpen("closed"), false);
  assert.equal(svcIsOpen("warranty"), false);
  assert.equal(svcStepIndex("sent"), 1);
  assert.equal(svcStepIndex("canceled"), 2);
  assert.equal(svcAutoAdvance("draft", "findings_ready"), "findings_ready");
  assert.equal(svcAutoAdvance("sent", "findings_ready"), null, "never backwards");
  assert.equal(svcAutoAdvance("completed", "sent"), null, "never out of a closed state");
  assert.equal(svcAutoAdvance("submitted", "diagnosing"), "diagnosing", "legacy key advances too");
});

test("per-device rows: status from outcome or explicit state, cause badge from the finding, unaffected/restored badges", () => {
  const rows = deviceRows(gnzCase());
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by["cam:C1"].status, "NEEDS_REPLACEMENT"); assert.equal(by["cam:C1"].cause, "CABLE"); assert.equal(by["cam:C1"].fields.cable, "Visible pull damage");
  assert.equal(by["cam:C4"].cause, "CAMERA");
  assert.equal(by["cam:C6"].status, "NEEDS_REPAIR"); assert.equal(by["cam:C6"].cause, "POWER");
  assert.equal(by["cam:C5"].status, "RESTORED"); assert.equal(by["cam:C5"].cause, "CABLE", "the finding's cause still shows for a restored device");
  assert.equal(by["cam:C8"].status, "OK"); assert.equal(by["cam:C8"].cause, "UNAFFECTED");
  assert.equal(by["cam:C7"].status, "NOT_TESTED"); assert.equal(by["cam:C7"].cause, null, "nothing invented for an untested device");
});

test("summary only states facts from the rows", () => {
  assert.equal(autoSummary(gnzCase()), "5 of 8 non-operational · 3 cable · 1 camera fault · 1 power fault · 1 restored on-site · 1 unaffected");
  assert.equal(autoSummary(emptyDiagnosis()), "");
});

test("document type + regions: diagnostic without money has one page; options/proposal make a proposal with page two", () => {
  const doc = gnzCase();
  let m = documentModel({ call, doc });
  assert.equal(m.type, "Service Diagnostic");
  assert.equal(m.badge, "CCTV Diagnostic");
  assert.equal(m.draft, false);
  assert.deepEqual(m.pages[0].map((r) => r.key), ["INCIDENT", "EQUIPMENT_FINDINGS", "SUMMARY", "ROOT_CAUSE", "WORK_PERFORMED"]);
  assert.deepEqual(m.pages[1].map((r) => r.key), ["ACCEPTANCE"]);
  const table = m.pages[0][1];
  assert.deepEqual(table.columns.map(([k]) => k), ["cable", "power", "video"]);
  assert.equal(table.rows.length, 8);

  // Draft state: no acceptance region, draft watermark
  m = documentModel({ call: { ...call, stage: "diagnosing" }, doc });
  assert.equal(m.draft, true);
  assert.equal(m.pages.length, 1);

  // Repair (range) vs Replace (linked proposal) → Service Call Proposal, comparison + recommendation + scope
  const repair = { ...emptyOption("repair"), title: "Partial repair", costSource: "range", low: 4800, high: 5400, warranty: "None", reliability: "Low" };
  const replace = { ...emptyOption("replace"), title: "Full replacement", costSource: "proposal", warranty: "Full", reliability: "High", recommended: true };
  doc.options = [repair, replace];
  const proposal = { number: "PROP-0032-v1", total: 5925.68, scope: ["8-Channel NVR", "8× Camera"], fingerprint: "abc" };
  m = documentModel({ call, doc, proposal });
  assert.equal(m.type, "Service Call Proposal");
  assert.equal(m.refProposal, "PROP-0032-v1");
  const p2 = Object.fromEntries(m.pages[1].map((r) => [r.key, r]));
  assert.deepEqual(m.pages[1].map((r) => r.key), ["REPAIR_OPTIONS", "COST_COMPARISON", "RECOMMENDATION", "SCOPE", "ACCEPTANCE"]);
  assert.equal(p2.COST_COMPARISON.rows[0].cost, "$4,800.00 – $5,400.00");
  assert.equal(p2.COST_COMPARISON.rows[1].cost, "$5,925.68");
  assert.equal(p2.RECOMMENDATION.text, "Full replacement");
  assert.equal(p2.RECOMMENDATION.proposal.number, "PROP-0032-v1");
  assert.match(p2.ACCEPTANCE.text, /under proposal PROP-0032-v1/);

  // A range with one bound missing is never shown as a price
  doc.options[0].high = null;
  m = documentModel({ call, doc, proposal });
  assert.equal(Object.fromEntries(m.pages[1].map((r) => [r.key, r])).COST_COMPARISON.rows[0].cost, "—");
});

test("warranty visit → Warranty Service Report, no charges; narrative overrides win over generated text", () => {
  const doc = gnzCase();
  doc.billing = "warranty";
  doc.narrative.rootCause = "Mechanical pull damaged three Cat6 runs.";
  const m = documentModel({ call, doc, invoice: { items: [{ desc: "Diagnostic", qty: 1, price: 150 }] } });
  assert.equal(m.type, "Warranty Service Report");
  const regions = Object.fromEntries(m.pages.flat().map((r) => [r.key, r]));
  assert.equal(regions.ROOT_CAUSE.text, "Mechanical pull damaged three Cat6 runs.");
  assert.equal(regions.CHARGES.text, "Warranty visit — no charge.");
  assert.ok(!regions.COST_COMPARISON);
});

test("sanitize keeps device state only for known devices and at most one recommended option; scope lines from a payload", () => {
  const doc = sanitizeDiagnosis({ devices: [{ id: "cam:1", label: "A", kind: "camera" }], deviceState: { "cam:1": { status: "FAILED", fields: { cable: "cut", bogus$: "x" } }, "cam:9": { status: "OK" } },
    options: [{ title: "R", type: "repair", recommended: true, costSource: "range", low: 10, high: "20" }, { title: "S", type: "replace", recommended: true, costSource: "bad" }] });
  assert.deepEqual(Object.keys(doc.deviceState), ["cam:1"]);
  assert.deepEqual(doc.deviceState["cam:1"], { status: "FAILED", fields: { cable: "cut" } });
  assert.deepEqual(doc.options.map((o) => o.recommended), [true, false]);
  assert.equal(doc.options[0].high, 20);
  assert.equal(doc.options[1].costSource, "none");
  assert.deepEqual(proposalScopeLines({ options: [{ id: "A", services: [{ items: [{ name: "Camera", qty: 8 }, { name: "NVR", qty: 1 }, { name: "Waived", qty: 1, waived: true }] }] }] }), ["8× Camera", "NVR"]);
});
