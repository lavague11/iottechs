// Device LOCATION model: identity (name/tag) ≠ location (locName "Dining 1") ≠ placement (inside/outside).
// Deterministic, geometry-only. Extract the pure resolver rmDevCtx and run it on a synthetic plan; plus
// source guards for the stable-sequence reconciler, the canvas label, persistence, and the camera-suggestion swap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
function extractFn(name) {
  const start = survey.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing " + name);
  let i = survey.indexOf("{", survey.indexOf(")", start)), depth = 0, q = null;
  for (let j = i; j < survey.length; j++) { const c = survey[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{") depth++; else if (c === "}" && --depth === 0) return survey.slice(start, j + 1); }
  throw new Error("unbalanced " + name);
}
const ZT = survey.slice(survey.indexOf("var ZONE_TYPES="), survey.indexOf("var ZONE_KEYS="));
const api = new Function(`var SUG_HALF=13; ${ZT}
  ${extractFn("sugOk")}\n${extractFn("zTypeLabel")}
  ${extractFn("rmStructHas")}\n${extractFn("rmPlacement")}
  ${extractFn("rmDevCtx")}
  return { rmDevCtx, zTypeLabel, rmPlacement };`)();

const VB = { x0: 0, y0: 0, vw: 400, vh: 400 };   // plate 0..100% → plan-px 0..400; HALF=13
const cell = (c, r) => ({ x: (c * 13 + 6.5) / 400 * 100, y: (r * 13 + 6.5) / 400 * 100 });   // a device centred in cell (c,r)
const range = (c0, c1, r0, r1) => { const a = []; for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) a.push(c + "," + r); return a; };
const DINING = range(1, 4, 1, 3), KITCHEN = range(6, 8, 1, 3);
const PLAN = { rooms: [{ cells: DINING, label: "Dining" }, { cells: KITCHEN, label: "Kitchen" }], cells: DINING.concat(KITCHEN), zoneCells: { driveway: range(1, 4, 10, 12), site: range(0, 20, 0, 20) } };
const o = { vb: VB }, f = { plan: PLAN };

test("a camera inside a room → inside + the room's display name as the base", () => {
  const r = api.rmDevCtx(cell(2, 2), f, o);
  assert.equal(r.placementType, "inside");
  assert.equal(r.roomIdx, 0);
  assert.equal(r.base, "Dining");
  assert.equal(api.rmDevCtx(cell(7, 2), f, o).base, "Kitchen");
});

test("a camera in an exterior zone → outside + the zone name (site/interior/exterior are not names)", () => {
  const r = api.rmDevCtx(cell(2, 11), f, o);
  assert.equal(r.placementType, "outside");
  assert.equal(r.roomIdx, -1);
  assert.equal(r.base, "Driveway");
});

test("a camera over a NAMED area → outside + the area's free name (wins over the legacy typed zone)", () => {
  const withArea = { ...PLAN, areas: [{ cells: range(6, 9, 10, 12), label: "Backyard", semanticType: "rear-yard" }] };
  const r = api.rmDevCtx(cell(7, 11), { plan: withArea }, o);
  assert.equal(r.placementType, "outside");
  assert.equal(r.base, "Backyard", "the free area name is the location base → 'Backyard 1'");
  // a named area on the same cells as a typed zone wins (free name beats the type)
  const override = { ...PLAN, areas: [{ cells: range(1, 4, 10, 12), label: "Front Drive", semanticType: "driveway" }] };
  assert.equal(api.rmDevCtx(cell(2, 11), { plan: override }, o).base, "Front Drive", "a named area beats the legacy zone type");
});

test("an outside-wall camera is NAMED for the room behind it, and placed OUTDOOR", () => {
  // Naming and placement are different questions and one variable used to answer both. The naming
  // tolerance is unchanged — you still get "Dining 1" for a camera on the wall — while the placement
  // reads outdoor, which is what decides whether the housing has to be outdoor-rated.
  const r = api.rmDevCtx(cell(5, 2), f, o);   // col 5 is between Dining (≤4) and Kitchen (≥6); neighbour of both
  assert.ok(r.roomIdx === 0 || r.roomIdx === 1, "picks an adjacent room, not nothing");
  assert.ok(r.base === "Dining" || r.base === "Kitchen", "still named from the adjacent room");
  assert.equal(r.placementType, "outside", "…but the placement is outdoor");
});

test("the two placement states, straight from the widget's own rule", () => {
  const inRoom = { cells: range(1, 4, 1, 3) };
  assert.equal(api.rmPlacement(inRoom, "2,2"), "inside");
  assert.equal(api.rmPlacement(inRoom, "5,2"), "outside", "one cell off the footprint is outdoor");
  assert.equal(api.rmPlacement(inRoom, "40,40"), "outside");
  assert.equal(api.rmPlacement({ cells: [] }, "2,2"), "outside", "nothing drawn → outdoor");
  assert.equal(api.rmPlacement({}, "2,2"), "outside");
  assert.equal(api.rmPlacement({ rooms: [{ cells: ["7,7"] }] }, "7,7"), "inside", "rooms count as structure");
});

test("a camera with no plan / off every structure → no base, outside", () => {
  assert.deepEqual(api.rmDevCtx(cell(2, 2), {}, o), { placementType: "", roomIdx: -1, base: "" });
  const far = api.rmDevCtx({ x: 99, y: 2 }, f, o);   // far right, not in a room/building/zone
  assert.equal(far.base, "");
});

test("identity is never written; the reconciler writes only location fields with a STABLE sequence", () => {
  const rc = extractFn("reconcileLocations");
  assert.ok(!/\bd\.name\s*=/.test(rc), "reconcileLocations never changes the device's identity name");
  assert.ok(rc.includes("d.locName=nName") && rc.includes("d.placementType=npt") && rc.includes("d.locSeq=nSeq"), "writes the location fields");
  assert.ok(rc.includes("d.locKey===k && +d.locSeq>0){ nSeq=+d.locSeq;") && rc.includes("nSeq=(max[k]||0)+1"), "keeps its number in place, else takes the next one (no reshuffle)");
  assert.ok(survey.includes('ct.base+" "+nSeq') && !survey.includes('ct.base+" Camera "'), "location name is '<Room/Zone> <n>' (no 'Camera' word)");
  // EVERY placeholder gets a room/area location — not cameras only.
  assert.ok(rc.includes("devices.map(function(d){ return rmDevCtx(d,f,o); })"), "location context is computed for every device kind");
  assert.ok(!rc.includes('if(d.k!=="cam") return;'), "the cameras-only gate on location naming is gone");
});

test("the map label prefers the location name; identity is the fallback", () => {
  assert.ok(survey.includes("function devLabel(d){ return d ? cap(d.locName||(d.name&&d.name.trim())||d.tag) : \"\"; }"),
    "ONE resolver: location name first, identity name/tag as the fallback");
  assert.ok(survey.includes("lab.textContent=devLabel(d);"), "the aim grip reads it");
  assert.ok(survey.includes('t.querySelector(".dt-name").textContent=devLabel(d);'), "and so does the bottom-left readout");
  assert.ok(survey.includes('function sugShown(d){ if(d && d.k==="cam") return ""'), "camera suggestion row yields to the auto location name");
  assert.ok(survey.includes('locName:d.locName||"",placementType:d.placementType||""'), "location + placement persist");
  assert.ok(survey.includes('locName:d.locName||"", placementType:d.placementType||"", cone:'), "the roster push to the page carries location + placement");
});

// THE NAME READS IN ONE PLACE.
//
// Found on a live plan (ASC0062): every device on the floor wore its own dark banner — "Dining Room 8",
// "Dining Room 4", "Room 6" — stacked over each other and over the layout they were labelling. Eight
// devices meant eight banners covering the plan. The name now lives in a single chip in the bottom-left
// corner naming whatever is hovered or selected, and the only label still drawn on a marker is the aim
// grip for the camera actually being aimed, where it is a control you drag rather than a caption.
test("the device name is a bottom-left readout, not a banner on every marker", () => {
  // The only reveal left for the on-marker label: angle mode AND selected — the grip you drag to aim.
  assert.match(survey, /\.devNode\.aim\.sel \.icLabel\{opacity:1\}/, "the grip survives");
  assert.ok(!/\.devNode:hover \.icLabel/.test(survey), "hover no longer paints a banner");
  assert.ok(!/\.devNode\.sel \.icLabel\{/.test(survey), "nor does plain selection");
  assert.ok(!/\.devNode\.aim \.icLabel\{opacity:1\}/.test(survey),
    "and angle mode no longer paints one on EVERY camera at once — the screenshot that started this");
  // aiming still has a second path that never needed the label (tap the plan where it should point),
  // so the grip is a convenience, not the only way through.
  assert.match(survey, /d\.aim=Math\.round\(Math\.atan2\(e\.clientY-cy, e\.clientX-cx\)\*180\/Math\.PI\)/,
    "tap-to-aim is still there");
});

test("the readout: one chip, hover peeks, selection sticks, and it heals itself", () => {
  assert.match(survey, /<div id="devTag" aria-live="polite">/, "it exists and announces itself");
  assert.match(survey, /#devTag\{position:absolute;left:14px;bottom:56px;/, "bottom-LEFT, on the existing ladder");
  assert.match(survey, /body\.devtag #gridScale\{bottom:92px\}/, "and it lifts the rest of that ladder over itself");
  // Hover is a peek; letting go falls back to the selected device rather than going blank.
  assert.match(survey, /var d=devTagHover\|\|byIdDev\(selId\)\|\|null, on=!!d;/, "hover first, then selection");
  assert.match(survey, /devTagPeek\(d\);.*showViewPop\(d, el, false\)/, "mouseenter peeks");
  assert.match(survey, /devTagPeek\(null\);.*hideViewPop\(\)/, "mouseleave releases the peek");
  assert.match(survey, /selectPanelCard\(id\); paintDevTag\(\);/, "selection repaints it");
  // A hovered device can vanish without a mouseleave — erased, or the floor changed under the pointer.
  assert.match(survey, /if\(devTagHover && devices\.indexOf\(devTagHover\)<0\) devTagHover=null;/,
    "it never names a device that is no longer on this floor");
  assert.match(survey, /devices=\[\]; devSeq=0; selId=null; paintDevTag\(\);/, "cleared on a floor change");
});
