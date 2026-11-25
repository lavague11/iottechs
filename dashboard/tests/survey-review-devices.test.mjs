// THE REVIEW STEP COUNTS EVERY DEVICE, NOT JUST CAMERAS.
//
// Found on a live job (ASC0043, "Evoke Wellness"): the last screen before the survey goes out for
// approval listed a floor literally named "Speaker" as "0 cameras". submitRows filtered
// `d.k === "cam"`, so speakers, alarm contacts, POS gear and network kit were all invisible there —
// a floor of ten speakers read as empty on the one screen whose job is to say what was surveyed.
//
// The rest of the survey has had one device model for exactly this reason (lib/survey2-model.js: the
// planner, the customer's layout and the PDF all render every kind). This was the last camera-only
// surface.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { submitRows, submitGaps, deviceSummary, submitTotals } from "../lib/survey-rail.js";
import { SURVEY_GROUPS, ANNOTATION_KINDS } from "../lib/survey2-model.js";

const dev = (k, extra = {}) => ({ k, cid: `${k}-${Math.random().toString(36).slice(2, 7)}`, ...extra });

test("a floor of speakers is counted, and named as speakers", () => {
  const roster = [{ name: "Speaker", devices: [dev("spk"), dev("spk"), dev("spk")] }];
  const floors = [{ name: "Speaker", bg: "data:image/png;base64,x" }];
  const [row] = submitRows(floors, roster);
  assert.equal(row.devCount, 3, "three devices on the floor");
  assert.equal(row.camCount, 0, "none of them a camera — which was the only thing being reported");
  assert.deepEqual(row.byKind, { spk: 3 });
  assert.equal(deviceSummary(row.byKind), "3 speakers");
  // …and a speaker without a photo is not a gap. It is a speaker.
  assert.equal(row.missing, 0);
  assert.deepEqual(submitGaps([row]), []);
});

test("a mixed floor reads in declared group order, cameras first", () => {
  const roster = [{ name: "Floor 1", devices: [dev("spk"), dev("cam", { photo: "p" }), dev("spk"), dev("door"), dev("cam", { photo: "p" })] }];
  const [row] = submitRows([{ bg: "x" }], roster);
  assert.equal(row.devCount, 5);
  assert.equal(deviceSummary(row.byKind), "2 cameras · 2 speakers · 1 door / window",
    "SURVEY_GROUPS order: cctv → sound → toast → alarm → misc");
});

test("one of a kind is singular", () => {
  assert.equal(deviceSummary({ cam: 1 }), "1 camera");
  assert.equal(deviceSummary({ spk: 1 }), "1 speaker");
  assert.equal(deviceSummary({}), "", "nothing placed says nothing, not '0 cameras'");
});

test("annotations are notes on the plan, not equipment", () => {
  // Same rule surveyCounts and unwiredDevices already follow.
  const roster = [{ name: "Floor 1", devices: [dev("important"), dev("outlet"), dev("hazard"), dev("spk")] }];
  const [row] = submitRows([{ bg: "x" }], roster);
  assert.equal(row.devCount, 1, "only the speaker");
  assert.deepEqual(row.byKind, { spk: 1 });
  for (const k of ANNOTATION_KINDS) assert.ok(!(k in row.byKind), `${k} is not equipment`);
});

test("an unplaced device is not on the floor", () => {
  const roster = [{ name: "Floor 1", devices: [dev("spk"), dev("spk", { placed: false }), dev("cam", { placed: false })] }];
  const [row] = submitRows([{ bg: "x" }], roster);
  assert.equal(row.devCount, 1);
  assert.equal(row.camCount, 0);
});

test("the photo gap stays camera-specific", () => {
  const roster = [{ name: "Floor 1", devices: [dev("cam"), dev("cam", { photo: "p" }), dev("spk"), dev("motion")] }];
  const [row] = submitRows([{ bg: "x" }], roster);
  assert.equal(row.missing, 1, "one camera with no photo");
  assert.equal(row.devCount, 4);
  const gaps = submitGaps([row]);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].label, /1 camera need/);
  assert.equal(gaps[0].step, "views");
});

test("totals add every kind across every floor, in the same words", () => {
  const rows = submitRows([{ bg: "x" }, { bg: "y" }], [
    { name: "Cameras", devices: [dev("cam"), dev("cam"), dev("cam")] },
    { name: "Speaker", devices: [dev("spk"), dev("spk"), dev("nvr")] },
  ]);
  const t = submitTotals(rows);
  assert.equal(t.devices, 6);
  assert.equal(t.cameras, 3);
  assert.equal(t.missing, 3, "no photos on any camera");
  assert.equal(t.label, "3 cameras · 1 nvr · 2 speakers");
  // The exact failure the owner saw: the second floor is no longer "0 cameras".
  assert.equal(deviceSummary(rows[1].byKind), "1 nvr · 2 speakers");
});

test("a kind the model does not know is still counted, never silently dropped", () => {
  const [row] = submitRows([{ bg: "x" }], [{ name: "F", devices: [dev("spk"), dev("gizmo")] }]);
  assert.equal(row.devCount, 2);
  assert.match(deviceSummary(row.byKind), /1 gizmo/);
});

test("the summary card renders the breakdown, not a camera count", () => {
  const src = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
  assert.match(src, /\{deviceSummary\(f\.byKind\) \|\| "Nothing placed"\}/, "per floor");
  assert.match(src, /submitTotals\(list\)/, "and the total line");
  assert.ok(!/\{f\.camCount\} camera\{f\.camCount === 1 \? "" : "s"\}/.test(src), "the camera-only line is gone");
});

test("every kind the model declares can be summarised", () => {
  // If a group gains a kind, it gets a name here automatically — nothing to remember.
  for (const g of SURVEY_GROUPS) {
    for (const it of g.items) {
      if (ANNOTATION_KINDS.has(it.k)) continue;
      const s = deviceSummary({ [it.k]: 2 });
      assert.ok(s && s.startsWith("2 "), `${it.k} → ${s}`);
      assert.ok(!/undefined/.test(s), `${it.k} has a name`);
    }
  }
});

test("the Review thumbnails are the RENDERED plan, not the bare background", () => {
  // The other half of the same complaint: these cards showed `f.bg`, the raw plan image, so the last
  // screen before approval displayed empty floor plans whatever had been placed on them — no
  // cameras, no speakers, no cable runs. They now come from lib/survey2-export, the ONE renderer the
  // customer's layout and the PDF already use, so a device that shows there shows here.
  const src = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
  assert.match(src, /await import\("\.\.\/\.\.\/\.\.\/lib\/survey2-export"\)/, "the one renderer, lazily");
  assert.match(src, /exportSurvey2Images\(sv, \{ maxWidth: 420 \}\)/, "at thumbnail width, not the PDF's 2400");
  assert.match(src, /paneMode !== "review"/, "built only while the Review step is open");
  // Matched by NAME: the exporter drops a floor whose image fails to load, so the two lists can be
  // different lengths and an index lookup would hang one floor's plan on another.
  assert.match(src, /byName\.get\(String\(f\.name \|\| ""\)\) \|\| f\.bg \|\| null/, "name lookup, bg fallback");
  assert.ok(!/<img src=\{f\.bg\} alt="" \/>/.test(src), "the bare-background thumbnail is gone");
});
