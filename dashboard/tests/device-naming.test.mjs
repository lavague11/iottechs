// Phase 8.2 — deterministic device-NAME suggestions (site-survey-merged.html). The widget is single-file ES5 with no exports, so we
// extract the REAL pure helpers with a brace matcher and run them on synthetic floors (plate-% geometry; rooms via a planSvg viewBox).
// Suggestion-first: the name only changes on the Apply click — asserted by reading the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deviceContext } from "../lib/device-context.js";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "widget is missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start));
  let depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const NAMES = ["sugOk", "sugZones", "sugZoneName", "zcMapOf", "devCellKey", "sugZoneCellAt", "sugCoverCellZone",
  "sugReach", "sugWedge", "sugCoverage", "sugRoom", "sugSide", "sugBase", "sugQualify",
  "suggestDeviceNames", "suggestDeviceName", "zPointIn", "zLabel", "zTypeLabel", "defaultSides", "sidesOf"];
const FNS = NAMES.map((n) => extractFn(survey, n)).join("\n");
const ZT = survey.slice(survey.indexOf("var ZONE_TYPES="), survey.indexOf("var ZONE_KEYS="));
const CONSTS = `var SUG_MIN=0.15, SUG_GRID=40, SUG_REACH=14, SUG_HALF=13; var SIDE_KEYS=["top","right","bottom","left"]; ${ZT}`;
const api = new Function(`${CONSTS}\n${FNS}\nreturn { suggestDeviceNames, suggestDeviceName, sugCoverage, sugWedge, sugZones, zPointIn, zcMapOf, devCellKey, sugZoneCellAt, sugCoverCellZone };`)();
const { suggestDeviceNames, suggestDeviceName, sugCoverage, sugWedge, sugZones, zPointIn, zcMapOf, devCellKey, sugZoneCellAt, sugCoverCellZone } = api;

const CAT = { cam: { name: "Camera" }, spk: { name: "Speaker" }, nvr: { name: "NVR" }, motion: { name: "Motion" }, pos: { name: "POS Terminal" } };
const O = { cat: (k) => CAT[k] };
const cam = (x, y, aim, extra) => Object.assign({ k: "cam", cone: true, x, y, aim, fov: 90, range: 150 }, extra || {});
const spk = (x, y, extra) => Object.assign({ k: "spk", ring: true, cone: false, x, y, aim: 0, fov: 30, range: 150 }, extra || {});
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const DRIVE = { id: "z1", label: "Driveway", type: "driveway", pts: rect(0, 60, 100, 100) };
const PARK = { id: "z2", label: "Parking", type: "parking", pts: rect(0, 0, 100, 30) };
const BOUND = { pts: rect(20, 20, 80, 80) };
const ROOMFLOOR = { plan: { rooms: [{ cells: ["4,4"], label: "Lobby", semanticType: "lobby" }] } };
const VB4 = { x0: 0, y0: 0, vw: 260, vh: 260 };   // device (22.5,22.5)% → plan px (58.5,58.5) → half-cell 4,4

test("pointInPolygon (the widget's zPointIn): inside / outside / array + {x,y} vertices", () => {
  const sq = rect(10, 10, 50, 50);
  assert.equal(zPointIn(sq, 30, 30), true);
  assert.equal(zPointIn(sq, 60, 30), false);
  assert.equal(zPointIn(sq.map(([x, y]) => ({ x, y })), 30, 30), true);
});

test("camera aimed at a driveway zone → 'Driveway' (coverage beats mount/room)", () => {
  const c = cam(50, 65, 90);                                   // aims down into the lower zone
  const f = { zones: [DRIVE, PARK], boundary: BOUND };
  assert.equal(suggestDeviceName(c, f, [c], O), "Driveway");
  const c2 = cam(50, 65, 90);
  assert.equal(suggestDeviceName(c2, Object.assign({ plan: ROOMFLOOR.plan }, f), [c2], Object.assign({ vb: VB4 }, O)), "Driveway", "coverage still beats a room");
});

test("camera that covers nothing falls to its room, then the zone it stands in, then the mounted side", () => {
  const room = cam(22.5, 22.5, 0);
  assert.equal(suggestDeviceName(room, ROOMFLOOR, [room], Object.assign({ vb: VB4 }, O)), "Lobby");
  const inz = cam(50, 90, 90);                                  // standing in Driveway, aimed off the plate edge → wedge reaches nothing useful? still inside → zone
  assert.equal(suggestDeviceName(inz, { zones: [DRIVE] }, [inz], O), "Driveway");
  const side = cam(50, 22, 270);                                // on the structure's top edge, aimed away from any zone
  assert.equal(suggestDeviceName(side, { boundary: BOUND }, [side], O), "Front");
  const left = cam(21, 50, 180);
  assert.equal(suggestDeviceName(left, { boundary: BOUND }, [left], O), "Left");
});

test("mounted side honours floor.sides retags", () => {
  const c = cam(50, 22, 270);
  assert.equal(suggestDeviceName(c, { boundary: BOUND, sides: { top: { label: "Street", type: "street" } } }, [c], O), "Street");
});

test("two cameras on one zone → 'Driveway Left' / 'Driveway Right', independent of array order", () => {
  const f = { zones: [DRIVE] };
  const a = cam(20, 65, 90), b = cam(70, 65, 90);
  assert.deepEqual(suggestDeviceNames([a, b], f, O), ["Driveway Left", "Driveway Right"]);
  assert.deepEqual(suggestDeviceNames([b, a], f, O), ["Driveway Right", "Driveway Left"]);
  assert.deepEqual(suggestDeviceNames([a, b], f, O), suggestDeviceNames([a, b], f, O), "stable across calls");
});

test("dedup: vertical split → Front/Back; three → Left/Center/Right; four or too-close → numbered", () => {
  const f = { zones: [DRIVE] };
  const v1 = cam(50, 62, 90), v2 = cam(51, 74, 90);
  assert.deepEqual(suggestDeviceNames([v1, v2], f, O), ["Driveway Front", "Driveway Back"]);
  const three = [cam(10, 65, 90), cam(50, 65, 90), cam(90, 65, 90)];
  assert.deepEqual(suggestDeviceNames(three, f, O), ["Driveway Left", "Driveway Center", "Driveway Right"]);
  const four = [cam(10, 65, 90), cam(35, 65, 90), cam(60, 65, 90), cam(85, 65, 90)];
  assert.deepEqual(suggestDeviceNames(four, f, O), ["Driveway 1", "Driveway 2", "Driveway 3", "Driveway 4"]);
  const tie = [cam(50, 65, 90), cam(50.2, 65, 90)];
  assert.deepEqual(suggestDeviceNames(tie, f, O), ["Driveway 1", "Driveway 2"], "indistinguishable by side → numbers, never duplicates");
});

test("speaker in a room → '<Room> Speaker'; in a zone → '<Zone> Speaker'; else mounted side", () => {
  const s = spk(22.5, 22.5);
  assert.equal(suggestDeviceName(s, ROOMFLOOR, [s], Object.assign({ vb: VB4 }, O)), "Lobby Speaker");
  const patio = { id: "z9", label: "Patio", type: "custom", pts: rect(60, 60, 100, 100) };
  const p = spk(80, 80);
  assert.equal(suggestDeviceName(p, { zones: [patio] }, [p], O), "Patio Speaker");
  const near = spk(40, 80);                                     // outside the zone, but its ring (reach 14%+) doesn't touch ≥15% … ring at x 26–54 misses → side
  assert.equal(suggestDeviceName(near, { zones: [patio], boundary: BOUND }, [near], O), "Rear Speaker");
  const reach = spk(55, 80, { range: 150 });                    // ring reaches into the zone → covered
  assert.match(suggestDeviceName(reach, { zones: [patio] }, [reach], O), /^Patio Speaker$/);
});

test("other kinds: place + kind name; unnamed custom zone is skipped, not invented", () => {
  const n = { k: "nvr", cone: false, x: 22.5, y: 22.5, aim: 0, fov: 30, range: 150 };
  assert.equal(suggestDeviceName(n, ROOMFLOOR, [n], Object.assign({ vb: VB4 }, O)), "Lobby NVR");
  const anon = { id: "z3", label: "", type: "custom", pts: rect(0, 0, 100, 100) };
  const c = cam(50, 50, 0);
  assert.equal(suggestDeviceName(c, { zones: [anon] }, [c], O), "");
});

test("empty signal → '' (no zones/rooms/boundary, no coordinates, no transform for rooms)", () => {
  const c = cam(50, 50, 0);
  assert.equal(suggestDeviceName(c, {}, [c], O), "");
  assert.equal(suggestDeviceName(c, null, [c], O), "");
  assert.equal(suggestDeviceName({ k: "cam", cone: true }, { zones: [DRIVE] }, null, O), "", "no x/y");
  assert.equal(suggestDeviceName(cam(22.5, 22.5, 0), ROOMFLOOR, null, O), "", "rooms but no viewBox (unscaled/legacy) → degrade, no throw");
  assert.deepEqual(suggestDeviceNames([], {}, O), []);
  assert.doesNotThrow(() => suggestDeviceNames([cam(50, 50, 0)], { zones: [{ pts: "junk" }, null, { pts: [[0, 0]] }], plan: { rooms: [null, { cells: 5 }] }, boundary: { pts: [[1]] } }, Object.assign({ vb: VB4 }, O)));
});

test("scaled floors: reach comes from real feet; a short range stops short of a far zone", () => {
  const far = cam(50, 30, 90, { range: 10 });                   // 10 ft of a 100 ft plate = 10% → wedge ends at y≈40, zone starts at 60
  assert.equal(suggestDeviceName(far, { zones: [DRIVE], scale: null }, [far], Object.assign({ scale: { ftW: 100 } }, O)), "");
  const long = cam(50, 30, 90, { range: 60 });                  // 60% → reaches the driveway band
  assert.equal(suggestDeviceName(long, { zones: [DRIVE] }, [long], Object.assign({ scale: { ftW: 100 } }, O)), "Driveway");
});

test("parity with lib/device-context.js (8.1): same top coverage zone on a shared sample", () => {
  const floor = { zones: [DRIVE, PARK], scale: { ftW: 100 } };
  for (const dev of [cam(50, 65, 90, { range: 20 }), cam(50, 25, 270, { range: 20 }), cam(40, 50, 90, { range: 40 }), cam(70, 80, 0, { range: 30 })]) {
    const lib = deviceContext(dev, floor).coverage[0];
    const mine = sugCoverage(sugZones(floor), sugWedge(dev, dev.range / 100 * 100, 1)).filter((c) => c.overlap > 0)[0];
    assert.equal(mine && mine.zone.type, lib && lib.type);
    assert.ok(Math.abs((mine ? mine.overlap : 0) - (lib ? lib.overlap : 0)) < 0.02, "overlap within sampling tolerance");
  }
});

test("suggestion-first: a name changes ONLY on the Apply click — never in render / save / refresh paths", () => {
  const start = survey.indexOf("Phase 8.2 — deterministic device-NAME suggestions");
  const end = survey.indexOf("function makeCard(d){");
  assert.ok(start > 0 && end > start);
  const block = survey.slice(start, end);
  assert.doesNotMatch(block, /\.name\s*=[^=]/, "no assignment to any .name inside the suggestion engine / glue");
  assert.doesNotMatch(block, /\.name\s*\+=/);
  assert.equal((survey.match(/d\.name=cap\(sv\)/g) || []).length, 1, "exactly one apply site");
  const apply = survey.indexOf("d.name=cap(sv)");
  assert.match(survey.slice(survey.lastIndexOf('sga.addEventListener("click"', apply), apply), /frozen\(\)\) return;[\s\S]*sugShown\(d\)/, "apply is inside the Apply click, guarded by frozen()");
  const shown = extractFn(survey, "sugShown");
  assert.match(shown, /!frozen\(\)/, "staff-only: hidden when frozen/read-only");
  assert.match(shown, /toLowerCase\(\)!==/, "hidden when it equals the current name");
  for (const n of ["paintSug", "refreshSugs", "sugFor"]) assert.doesNotMatch(extractFn(survey, n), /\bd\.name\s*=/, n + " never writes a name");
  assert.match(extractFn(survey, "renderPanel"), /sugMap=null/);
  assert.doesNotMatch(extractFn(survey, "save"), /sug|suggest/i, "the save path never applies a suggestion");
  const mc = survey.indexOf("function makeCard(d){");
  const card = survey.slice(mc, survey.indexOf("if(showFov){", mc));
  assert.doesNotMatch(card, /suggestDeviceName/, "makeCard builds no suggestion itself");
  assert.equal((card.match(/sugShown\(/g) || []).length, 1, "the card only reads a suggestion inside the Apply click");
});

// Phase 4 (grid-first): device naming reads the ZONE CELLS (the same cells as the structure/rooms), with
// the polygon zones as the fallback. ctx viewBox: plate 0..100% → plan-px 0..260 (vb {x0:0,y0:0,vw:260,vh:260}); HALF=13 → 20 cells across.
const VBZ = { x0: 0, y0: 0, vw: 260, vh: 260 };
// driveway occupies the left columns (cells c 0..4, all rows); "site" fills the rest (must be ignored for names).
const dvyCells = [], siteCells = [];
for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) (c <= 4 ? dvyCells : siteCells).push(c + "," + r);
const ZCMAP = api.zcMapOf({ driveway: dvyCells, site: siteCells });

test("zcMapOf: flattens cells → type, dropping 'site' (property base, never a device name)", () => {
  assert.equal(ZCMAP["0,0"], "driveway");
  assert.equal(ZCMAP["10,10"], undefined, "a site cell is not in the name map");
});

test("a camera standing in a driveway cell → 'Driveway' (cell zones)", () => {
  const o = { vb: VBZ, zcMap: ZCMAP, scale: null, aspect: 1, sceneW: 0, cat: () => null };
  // device at x=10% → plan-px 26 → cell col 2 (driveway); y=50% → row 10
  assert.equal(api.sugZoneCellAt({ x: 10, y: 50 }, o), "Driveway");
  // device at x=80% → col ~12 (site) → no name
  assert.equal(api.sugZoneCellAt({ x: 80, y: 50 }, o), "");
});

test("a camera whose coverage falls over driveway cells → 'Driveway' (cell coverage)", () => {
  const o = { vb: VBZ, zcMap: ZCMAP, scale: null, aspect: 1, sceneW: 0, cat: () => null };
  // a ring device near the driveway with a reach that mostly covers driveway columns
  const name = api.sugCoverCellZone({ x: 8, y: 50, ring: true, fov: 360, range: 12 }, o);
  assert.equal(name, "Driveway");
});

test("cell zones are preferred but fall back to polygon zones when absent", () => {
  const polyFloor = { zones: [{ type: "parking", label: "", pts: [[0, 0], [40, 0], [40, 100], [0, 100]] }], plan: null };
  const o = { vb: null, zcMap: null, scale: null, aspect: 1, sceneW: 100, cat: () => null };
  // no zcMap → sugZoneCellAt is silent; suggestDeviceNames uses the polygon zone
  assert.equal(api.sugZoneCellAt({ x: 10, y: 50 }, o), "");
  const names = suggestDeviceNames([{ k: "cam", x: 10, y: 50, cone: false }], polyFloor, o);
  assert.equal(names[0], "Parking");
});

test("inline scripts still parse", () => {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g; let m, n = 0;
  while ((m = re.exec(survey))) { if (/\bsrc=/.test(m[1])) continue; assert.doesNotThrow(() => new Function(m[2])); n++; }
  assert.ok(n >= 1);
});
