// Service-call diagnostic model (node --test): estimate suggestions from the rate card, warranty from
// the project record, time on site, the customer-facing report, and boundary sanitizing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDiagnosis, emptyFinding, devicesFromCameras, suggestEstimate, warrantyStatus, timeOnSite, reportSections, needsFollowUp, sanitizeDiagnosis, stableJson, SVC_SYMPTOMS, SVC_SYSTEMS } from "../lib/svc-model.js";
import { SVC_RATES } from "../lib/spec.js";

const cams = [{ tag: "IC1", label: "IC1 — Front Door" }, { tag: "IC2", label: "IC2 — Lobby" }, { tag: "IC3", label: "IC3 — Bay" }, { tag: "IC4", label: "IC4 — Lot" }];

function poeSwitchCase() {
  const doc = emptyDiagnosis();
  doc.systems = ["cctv"];
  doc.devices = devicesFromCameras(cams);
  const f = emptyFinding("cctv", ["cam:IC1", "cam:IC2", "cam:IC3", "cam:IC4"]);
  f.symptoms = ["Offline"];
  f.tests = [{ key: "cam_direct", result: "PASS", note: "" }, { key: "verify_poe", result: "FAIL", note: "no power on ports 3–6" }, { key: "hdd_health", result: "NOT TESTED", note: "" }];
  f.rootCauses = ["poe_switch"];
  f.finding = "All four cameras operate normally on a known-good PoE source; the existing switch supplies no power on the affected ports.";
  f.recommendation = "Replace 8-port PoE switch.";
  f.outcome = "needs_replace";
  doc.findings = [f];
  return doc;
}

test("every system has a symptom list ending in Other/Unknown", () => {
  for (const s of SVC_SYSTEMS) {
    const list = SVC_SYMPTOMS[s.key];
    assert.ok(Array.isArray(list) && list.length, s.key);
    assert.ok(/Other|Unknown/.test(list[list.length - 1]), s.key);
  }
});

test("bulk diagnosis: one PoE-switch finding over four cameras → base lines + a priced-later switch line", () => {
  const lines = suggestEstimate(poeSwitchCase(), SVC_RATES);
  const by = Object.fromEntries(lines.map((l) => [l.desc, l]));
  assert.equal(by["Diagnostic"].price, 150);
  assert.equal(by["Roll out"].price, 50);
  assert.equal(by["PoE switch replacement"].qty, 1);
  assert.equal(by["PoE switch replacement"].needsPrice, true, "not on the rate card → office prices it, never invented");
  assert.ok(!by["Camera replacement"], "no camera hardware line for a switch fault");
});

test("device-scoped causes take the device count as quantity; ISP yields the visit only; warranty yields nothing", () => {
  const doc = poeSwitchCase();
  doc.findings[0].rootCauses = ["cable"];
  let by = Object.fromEntries(suggestEstimate(doc, SVC_RATES).map((l) => [l.desc, l]));
  assert.equal(by["Cable rerun"].qty, 4);
  assert.equal(by["Cable rerun"].price, 150);
  doc.findings[0].rootCauses = ["isp"];
  assert.deepEqual(suggestEstimate(doc, SVC_RATES).map((l) => l.desc), ["Diagnostic", "Roll out"]);
  doc.billing = "warranty";
  assert.deepEqual(suggestEstimate(doc, SVC_RATES), []);
});

test("warranty comes from the project record, not text", () => {
  const now = new Date("2026-09-27T00:00:00");
  assert.equal(warrantyStatus({ completed_at: "2026-06-01", warranty_months: 6 }, now).status, "in");
  assert.equal(warrantyStatus({ completed_at: "2025-06-01", warranty_months: 12 }, now).status, "out");
  assert.equal(warrantyStatus({ install_date: "2026-09-01", warranty_months: 6 }, now).until, "2027-03-01");
  assert.equal(warrantyStatus({ warranty_months: 6 }, now).status, "unknown");
  assert.equal(warrantyStatus(null, now).status, "unknown");
});

test("time on site is computed, never typed", () => {
  assert.deepEqual(timeOnSite("09:15", "11:40"), { minutes: 145, label: "2h 25m" });
  assert.equal(timeOnSite("23:30", "00:15").minutes, 45);
  assert.equal(timeOnSite("2026-09-27T09:00", "2026-09-27T09:50").label, "50m");
  assert.equal(timeOnSite("", "10:00").minutes, null);
});

test("report: tests, findings, root cause, outcome and recommendations from the one document; internal notes never leak", () => {
  const doc = poeSwitchCase();
  doc.internalNotes = "customer was rude, SECRET";
  doc.recommendations = "Add a UPS to the rack.";
  const S = reportSections({ issue: "Cameras 3–6 offline." }, doc);
  const get = (t) => S.find((s) => s.title === t)?.lines || [];
  assert.deepEqual(get("Reported issue"), ["Cameras 3–6 offline."]);
  assert.match(get("Affected equipment")[0], /IC1 — Front Door, IC2 — Lobby, IC3 — Bay, IC4 — Lot/);
  assert.deepEqual(get("Diagnostic tests"), ["Camera direct-connect — PASS", "Verify PoE — FAIL (no power on ports 3–6)"]);
  assert.deepEqual(get("Root cause"), ["PoE switch"]);
  assert.deepEqual(get("Outcome"), ["IC1 — Front Door, IC2 — Lobby, IC3 — Bay, IC4 — Lot — Needs replacement"]);
  assert.deepEqual(get("Recommendations"), ["Add a UPS to the rack.", "Replace 8-port PoE switch."]);
  assert.ok(!JSON.stringify(S).includes("SECRET"));
  assert.equal(needsFollowUp(doc), true);
});

test("sanitize keeps only known devices/symptoms/causes and caps text", () => {
  const doc = sanitizeDiagnosis({
    callType: "Camera Repair", systems: ["cctv", "bogus"], devices: [{ id: "cam:1", label: "Cam", kind: "camera" }],
    findings: [{ system: "cctv", deviceIds: ["cam:1", "cam:9"], symptoms: ["Offline", "Made up"], tests: [{ key: "ping", result: "WHAT" }, { key: "nope" }], rootCauses: ["cable", "gremlins"], outcome: "repaired", work: ["reboot", "x"], finding: "y".repeat(2000) }],
    billing: "diagnostic", internalNotes: "n",
  });
  assert.deepEqual(doc.systems, ["cctv"]);
  const f = doc.findings[0];
  assert.deepEqual(f.deviceIds, ["cam:1"]);
  assert.deepEqual(f.symptoms, ["Offline"]);
  assert.deepEqual(f.tests, [{ key: "ping", result: "NOT TESTED", note: "" }]);
  assert.deepEqual(f.rootCauses, ["cable"]);
  assert.deepEqual(f.work, ["reboot"]);
  assert.equal(f.finding.length, 800);
  assert.equal(doc.billing, "diagnostic");
  assert.equal(stableJson({ b: 1, a: [2, { d: 1, c: 2 }] }), stableJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
});
