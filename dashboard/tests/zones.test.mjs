// Phase 5.2 — site ZONES (site-survey-merged.html): many named, typed polygons per floor, drawn with the 5.1 boundary editor.
// Same technique as boundary.test.mjs: the widget is single-file ES5 with no exports, so we extract the real helpers with a
// brace matcher and run them against stubbed globals. Plate-% space: a vertex is [x,y] in 0..100.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

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

const FN_NAMES = ["bdSnap", "bdBtns", "bdCommit", "bdPush", "bdGo", "bdUndo", "bdRedo", "bdClose", "bdDelSel", "boundaryToPath", "bdLoad", "rgLoad",
  "zTypeKey", "zTypeLabel", "zLabel", "zEsc", "zNewId", "zValidPts", "zValidZones", "zPointIn", "zonePick", "zoneCentroid", "rgZones", "rgZone",
  "rgSetKind", "rgSelectZone", "rgNewDraft", "rgAddZone", "rgRetype", "rgApply", "rgDelZone", "closeZonePop", "renderZones"];
const FNS = FN_NAMES.map((n) => extractFn(survey, n)).join("\n");
const CONSTS = survey.slice(survey.indexOf("var ZONE_TYPES="), survey.indexOf("function zTypeKey("));

function sandbox() {
  const els = {};
  const mk = () => ({ disabled: false, style: {}, textContent: "", innerHTML: "", classList: { toggle() {}, contains: () => false, add() {}, remove() {} } });
  const doc = { getElementById: (id) => els[id] || (els[id] = mk()) };
  const st = { save: 0, paint: 0, ui: 0, frozen: false };
  const factory = new Function("document", "queueSave", "renderBoundary", "updateRegionUI", "frozen",
    `var regionMode=true,bdPts=[],bdClosed=false,bdDrag=-1,bdSel=-1,bdHist=[],bdHi=-1,bdDownPt=null,rgTarget={kind:"boundary"},zpOpen=false;
     var floors=[{}],curFloor=0,zScale=1;
     ${CONSTS}
     ${FNS}
     return {
       get bdPts(){return bdPts;}, set bdPts(v){bdPts=v;}, get bdClosed(){return bdClosed;}, set bdClosed(v){bdClosed=v;},
       get bdSel(){return bdSel;}, set bdSel(v){bdSel=v;}, get bdHist(){return bdHist;}, get rgTarget(){return rgTarget;}, set zpOpen(v){zpOpen=v;}, get zpOpen(){return zpOpen;},
       get floors(){return floors;}, set floors(v){floors=v;}, ZONE_TYPES:ZONE_TYPES, ZONE_KEYS:ZONE_KEYS, ZONE_COLORS:ZONE_COLORS, ZONE_MAX:ZONE_MAX, ZONE_PTS_MAX:ZONE_PTS_MAX,
       bdPush:bdPush, bdUndo:bdUndo, bdClose:bdClose, bdDelSel:bdDelSel, bdLoad:bdLoad, bdCommit:bdCommit,
       zValidZones:zValidZones, zValidPts:zValidPts, zPointIn:zPointIn, zonePick:zonePick, zoneCentroid:zoneCentroid, zEsc:zEsc,
       rgSetKind:rgSetKind, rgSelectZone:rgSelectZone, rgNewDraft:rgNewDraft, rgAddZone:rgAddZone, rgRetype:rgRetype, rgApply:rgApply, rgDelZone:rgDelZone, rgZone:rgZone, rgZones:rgZones,
       closeZonePop:closeZonePop, renderZones:renderZones
     };`);
  const env = factory(doc, () => { st.save++; }, () => { st.paint++; }, () => { st.ui++; }, () => st.frozen);
  env.$ = (id) => doc.getElementById(id); env.st = st;
  env.bdLoad();
  return env;
}
const add = (e, x, y) => { e.bdPts.push({ x, y }); e.bdPush(); };
// draw a closed square zone draft at (x0,y0)-(x1,y1) in zone mode, then type it
function draw(e, x0, y0, x1, y1, type, label) {
  if (e.rgTarget.kind !== "zone" || e.rgTarget.id != null) e.rgSetKind("zone");
  add(e, x0, y0); add(e, x1, y0); add(e, x1, y1); add(e, x0, y1); e.bdClose();
  return e.rgApply(type, label);
}

// ---------- type -> colour map ----------
test("zone types: the owner's 9, each with a distinct colour; custom has a fallback", () => {
  const e = sandbox();
  assert.deepEqual(e.ZONE_TYPES.map((t) => t[1]), ["Street", "Driveway", "Parking", "Front Yard", "Rear Yard", "Side Yard", "Alley", "Loading", "Entrance"]);
  for (const k of e.ZONE_KEYS) assert.match(e.ZONE_COLORS[k], /^\d{1,3},\d{1,3},\d{1,3}$/, k + " has an rgb colour");
  assert.equal(new Set(e.ZONE_KEYS.map((k) => e.ZONE_COLORS[k])).size, 9, "colours are distinct");
  assert.ok(e.ZONE_COLORS.custom, "custom fallback colour");
});

// ---------- validation ----------
test("zValidZones: type allow-list (junk -> custom), label <=40, id string, junk rows dropped", () => {
  const e = sandbox(), sq = [[0, 0], [10, 0], [10, 10]];
  const out = e.zValidZones([
    { id: "a", label: "Main St", type: "street", pts: sq },
    { id: "b", label: "x".repeat(80), type: "<script>", pts: sq },
    { id: 7, label: "", type: "parking", pts: sq },          // non-string id -> regenerated; empty label -> type label
    { id: "d", type: "alley", pts: [[0, 0], [1, 1]] },        // <3 pts -> dropped
    null, "junk", { id: "e" },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].type, "street"); assert.equal(out[1].type, "custom"); assert.equal(out[1].label.length, 40);
  assert.equal(typeof out[2].id, "string"); assert.ok(out[2].id.length > 0); assert.equal(out[2].label, "Parking");
  assert.equal(e.zValidZones("nope").length, 0); assert.equal(e.zValidZones(null).length, 0);
});

test("zValidZones: clamps pts to [0,100], drops non-finite coords, caps 60 pts, dedupes ids, caps 40 zones", () => {
  const e = sandbox();
  const out = e.zValidZones([{ id: "a", type: "street", pts: [[-5, 120], [50, "x"], [NaN, 1], [10, 10], [20, 20], [30, 5]] }]);
  assert.deepEqual(out[0].pts, [[0, 100], [10, 10], [20, 20], [30, 5]]);
  const many = Array.from({ length: 100 }, (_, i) => [i % 100, (i * 7) % 100]);
  assert.equal(e.zValidZones([{ id: "a", type: "street", pts: many }])[0].pts.length, 60);
  const dup = e.zValidZones([{ id: "a", type: "street", pts: many }, { id: "a", type: "alley", pts: many }]);
  assert.notEqual(dup[0].id, dup[1].id, "duplicate ids are re-minted");
  const lots = Array.from({ length: 60 }, (_, i) => ({ id: "z" + i, type: "street", pts: [[0, 0], [5, 0], [5, 5]] }));
  assert.equal(e.zValidZones(lots).length, 40);
});

// ---------- add / close / retype / delete via the extracted helpers ----------
test("zone mode: draw -> close -> type creates a zone (history restarts, boundary untouched)", () => {
  const e = sandbox();
  e.floors[0].boundary = { pts: [[1, 1], [9, 1], [9, 9]] };
  const z = draw(e, 10, 10, 40, 40, "parking");
  assert.ok(z && typeof z.id === "string");
  assert.equal(z.type, "parking"); assert.equal(z.label, "Parking", "label defaults to the type"); assert.equal(z.pts.length, 4);
  assert.deepEqual(e.floors[0].zones, [z]);
  assert.deepEqual(e.floors[0].boundary, { pts: [[1, 1], [9, 1], [9, 9]] }, "boundary is not modified while editing a zone");
  assert.deepEqual(e.rgTarget, { kind: "zone", id: z.id });
  assert.equal(e.bdHist.length, 1, "history restarts on the new zone");
  assert.ok(e.st.save > 0);
});

test("a typed zone label can be set at creation; an unknown type becomes custom", () => {
  const e = sandbox();
  assert.equal(draw(e, 0, 0, 10, 10, "street", "  Oak Ave  ").label, "Oak Ave");
  assert.equal(draw(e, 20, 20, 30, 30, "not-a-type").type, "custom");
});

test("an un-closed or un-typed draft is never written to floor.zones", () => {
  const e = sandbox(); e.rgSetKind("zone");
  add(e, 0, 0); add(e, 10, 0); add(e, 10, 10);                      // open draft
  assert.equal(e.rgAddZone("street"), null, "not closed yet");
  e.bdClose();
  assert.equal(e.rgZones(false).length, 0, "closed but still un-typed -> no zone row");
  assert.equal(e.rgZone("x"), null);
});

test("dragging/editing a selected zone writes back into ITS row (not the boundary)", () => {
  const e = sandbox(); const z = draw(e, 10, 10, 40, 40, "driveway");
  e.bdPts[2] = { x: 60, y: 60 }; e.bdPush();
  assert.deepEqual(e.floors[0].zones[0].pts[2], [60, 60]);
  assert.equal(e.floors[0].boundary == null, true, "boundary stays untouched");
  e.bdUndo(); assert.deepEqual(e.floors[0].zones[0].pts[2], [40, 40], "undo acts on the active zone");
});

test("rgSelectZone loads a zone closed; rgSetKind(boundary) returns to the boundary; boundary behaviour unchanged", () => {
  const e = sandbox(); const a = draw(e, 10, 10, 30, 30, "street"); draw(e, 50, 50, 70, 70, "alley");
  e.rgSelectZone(a.id);
  assert.equal(e.bdClosed, true); assert.equal(e.bdPts.length, 4); assert.deepEqual(e.rgTarget, { kind: "zone", id: a.id });
  e.rgSetKind("boundary");
  assert.deepEqual(e.rgTarget, { kind: "boundary" }); assert.equal(e.bdPts.length, 0, "no boundary yet -> empty");
  add(e, 5, 5); add(e, 50, 5); add(e, 50, 50); e.bdClose();
  assert.equal(e.floors[0].boundary.pts.length, 3, "boundary drawing still commits floor.boundary");
  assert.equal(e.floors[0].zones.length, 2, "zones untouched");
  e.rgSelectZone("nope"); assert.deepEqual(e.rgTarget, { kind: "boundary" }, "unknown id is ignored");
});

test("retype: a default label follows the new type; a custom label is kept; rename-only keeps the type", () => {
  const e = sandbox(); const a = draw(e, 0, 0, 10, 10, "street");
  e.rgRetype("loading", ""); assert.equal(a.type, "loading"); assert.equal(a.label, "Loading");
  e.rgRetype(null, "Dock 3"); assert.equal(a.type, "loading"); assert.equal(a.label, "Dock 3");
  e.rgRetype("entrance", ""); assert.equal(a.type, "entrance"); assert.equal(a.label, "Dock 3", "custom label survives a retype");
  e.rgRetype("bogus", ""); assert.equal(a.type, "custom");
});

test("rgApply on a closed draft with no type picked -> custom zone named from the input", () => {
  const e = sandbox(); e.rgSetKind("zone"); add(e, 0, 0); add(e, 10, 0); add(e, 10, 10); e.bdClose();
  const z = e.rgApply(null, "Garden"); assert.equal(z.type, "custom"); assert.equal(z.label, "Garden");
});

test("delete a zone removes only that row and returns to an empty draft", () => {
  const e = sandbox(); const a = draw(e, 0, 0, 10, 10, "street"), b = draw(e, 20, 20, 30, 30, "alley");
  e.rgSelectZone(a.id); assert.equal(e.rgDelZone(), true);
  assert.deepEqual(e.floors[0].zones.map((z) => z.id), [b.id]);
  assert.deepEqual(e.rgTarget, { kind: "zone", id: null }); assert.equal(e.bdPts.length, 0);
  assert.equal(e.rgDelZone(), false, "nothing selected -> no-op");
});

test("a closed polygon (zone OR boundary) keeps >=3 vertices: deleting at 3 points is refused", () => {
  const e = sandbox(); e.rgSetKind("zone"); add(e, 0, 0); add(e, 10, 0); add(e, 10, 10); e.bdClose(); e.rgApply("street");
  e.bdSel = 1; e.bdDelSel(); assert.equal(e.floors[0].zones[0].pts.length, 3); assert.equal(e.bdSel, -1);
  const b = sandbox(); add(b, 0, 0); add(b, 10, 0); add(b, 10, 10); b.bdClose(); b.bdSel = 1; b.bdDelSel();
  assert.equal(b.bdPts.length, 3, "a closed 3-gon boundary refuses deletion too"); assert.equal(b.bdClosed, true);
});

test("zone cap: ZONE_MAX zones, then rgAddZone refuses", () => {
  const e = sandbox();
  e.floors[0].zones = Array.from({ length: e.ZONE_MAX }, (_, i) => ({ id: "z" + i, label: "Z", type: "street", pts: [[0, 0], [5, 0], [5, 5]] }));
  e.rgSetKind("zone"); add(e, 0, 0); add(e, 10, 0); add(e, 10, 10); e.bdClose();
  assert.equal(e.rgAddZone("street"), null); assert.equal(e.floors[0].zones.length, e.ZONE_MAX);
});

test("closeZonePop(cancel) on a NEW zone un-closes the loop; on a typed zone it does nothing", () => {
  const e = sandbox(); e.rgSetKind("zone"); add(e, 0, 0); add(e, 10, 0); add(e, 10, 10); e.bdClose(); e.zpOpen = true;
  e.closeZonePop(true); assert.equal(e.bdClosed, false, "cancel -> polygon re-opened (undo of the close)"); assert.equal(e.zpOpen, false);
  e.bdClose(); const z = e.rgApply("street"); e.zpOpen = true; e.closeZonePop(true);
  assert.equal(e.bdClosed, true); assert.equal(e.floors[0].zones.length, 1); assert.equal(z.type, "street");
});

test("frozen(): zone creation, retype and delete are refused", () => {
  const e = sandbox(); const z = draw(e, 0, 0, 10, 10, "street");
  e.st.frozen = true;
  assert.equal(e.rgRetype("alley", "x"), null); assert.equal(z.type, "street");
  assert.equal(e.rgDelZone(), false); assert.equal(e.floors[0].zones.length, 1);
  e.rgSelectZone(z.id); e.rgSetKind("boundary");   // no-ops while frozen
  assert.deepEqual(e.rgTarget, { kind: "zone", id: z.id });
  e.st.frozen = false; e.rgNewDraft(); e.rgSetKind("zone"); add(e, 0, 0); add(e, 9, 0); add(e, 9, 9); e.bdClose(); e.st.frozen = true;
  assert.equal(e.rgAddZone("alley"), null, "cannot type a draft while frozen");
});

// ---------- pure helpers ----------
test("zPointIn / zonePick: topmost zone under the point, skipId honoured", () => {
  const e = sandbox();
  const zs = [{ id: "a", pts: [[0, 0], [50, 0], [50, 50], [0, 50]] }, { id: "b", pts: [[25, 25], [75, 25], [75, 75], [25, 75]] }];
  assert.equal(e.zonePick(zs, 10, 10).id, "a"); assert.equal(e.zonePick(zs, 30, 30).id, "b", "last-drawn wins on overlap");
  assert.equal(e.zonePick(zs, 30, 30, "b").id, "a", "skipId"); assert.equal(e.zonePick(zs, 90, 90), null);
  assert.equal(e.zPointIn([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 8, 2), true, "accepts {x,y} too");
});

test("zoneCentroid: square -> centre; degenerate -> vertex mean; works for {x,y} and [x,y]", () => {
  const e = sandbox();
  const c = e.zoneCentroid([[0, 0], [10, 0], [10, 10], [0, 10]]); assert.ok(Math.abs(c.x - 5) < 1e-9 && Math.abs(c.y - 5) < 1e-9);
  const d = e.zoneCentroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]); assert.ok(Math.abs(d.x - 10) < 1e-9 && d.y === 0);
  const t = e.zoneCentroid([[0, 0], [30, 0], [0, 30]]); assert.ok(Math.abs(t.x - 10) < 1e-9 && Math.abs(t.y - 10) < 1e-9);
});

// ---------- rendering ----------
test("renderZones: one translucent polygon + one centroid chip per zone; label HTML-escaped; fill uses the type colour", () => {
  const e = sandbox(); const z = draw(e, 0, 0, 20, 20, "parking", "A<b>&\"");
  e.rgSetKind("boundary"); e.renderZones();
  const svg = e.$("zoneLayer").innerHTML, tags = e.$("zoneTags").innerHTML;
  assert.equal((svg.match(/<polygon/g) || []).length, 1);
  assert.ok(svg.includes("rgba(" + e.ZONE_COLORS.parking + ",0.18)"), "unselected fill alpha .18 in the type colour");
  assert.ok(svg.includes('points="0,0 20,0 20,20 0,20"'));
  assert.ok(tags.includes("left:10%;top:10%") && tags.includes("A&lt;b&gt;&amp;&quot;") && !tags.includes("<b>"), "centroid chip, escaped");
  e.rgSelectZone(z.id); e.renderZones(); assert.ok(e.$("zoneLayer").innerHTML.includes(",0.3)"), "selected zone draws stronger");
});

test("renderZones renders with no zones as empty (no shells) and reads the live working copy while a zone is dragged", () => {
  const e = sandbox(); e.renderZones(); assert.equal(e.$("zoneLayer").innerHTML, ""); assert.equal(e.$("zoneTags").innerHTML, "");
  const z = draw(e, 0, 0, 20, 20, "street"); e.bdPts[2] = { x: 40, y: 40 }; e.renderZones();
  assert.ok(e.$("zoneLayer").innerHTML.includes("40,40"), "active zone follows bdPts mid-drag");
});

// ---------- source wiring ----------
test("renderBoundary (called by renderView + fitScene) redraws the zones; zones render for everyone, editing is staff-only", () => {
  assert.ok(extractFn(survey, "renderBoundary").includes("renderZones()"), "zones redraw wherever the boundary does");
  assert.ok(extractFn(survey, "renderView").includes("renderBoundary()"), "renderView -> renderBoundary -> renderZones");
  assert.ok(extractFn(survey, "fitScene").includes("renderBoundary()"), "fitScene -> renderBoundary -> renderZones");
  assert.ok(!extractFn(survey, "renderZones").includes("frozen()"), "zones draw for frozen/customer views too");
  assert.ok(/#zoneLayer\{[^}]*pointer-events:none/.test(survey), "zone layer is display-only");
  for (const fn of ["rgSetKind", "rgSelectZone", "rgAddZone", "rgRetype", "rgDelZone"]) assert.ok(extractFn(survey, fn).includes("frozen()"), fn + " is gated on frozen()");
  assert.ok(/body\.ro #rgBar,body\.frozen #rgBar\{display:none/.test(survey), "sub-selector hidden for customer / submitted");
});

test("the editor is routed by target, not duplicated: one pointer IIFE, one bdCommit that branches on rgTarget", () => {
  assert.equal(survey.split('rl.addEventListener("pointerdown"').length - 1, 1, "single pointerdown handler on #regionLayer");
  assert.ok(extractFn(survey, "bdCommit").includes('rgTarget.kind==="zone"'), "bdCommit writes to the zone row for a zone target");
  assert.ok(survey.includes('if(hit<0 && rgTarget.kind==="zone" && rgZoneTap(e.clientX,e.clientY)) return;'), "zone tap routing precedes the add-vertex path");
  assert.ok(survey.includes('if(bdSel>=0){ bdSel=-1; renderBoundary(); }'), "boundary empty-tap still deselects first (no stray vertex)");
  assert.ok(survey.includes('if(rgTarget.kind==="zone" && rgTarget.id==null) openZonePop();'), "closing a NEW zone opens the type picker");
});

test("zones are carried through restore, create and duplicate (deep copies) — OFF snapFloor and OFF the approval fingerprint", () => {
  assert.ok(survey.includes("zones:zValidZones(f.zones)"), "restore validates + carries zones");
  assert.ok(survey.includes("zones:(wp&&from.zones)?JSON.parse(JSON.stringify(from.zones)):[]"), "createFloor deep-copies when carrying the plan");
  assert.ok(survey.includes("zones:src.zones?JSON.parse(JSON.stringify(src.zones)):[]"), "duplicateFloor deep-copies");
  assert.ok(!extractFn(survey, "snapFloor").includes("zones"), "snapFloor must not touch zones (written by the zone helpers)");
  const td = readFileSync(new URL("../lib/tool-data.js", import.meta.url), "utf8");
  assert.ok(!/survey2Meaning[\s\S]{0,1800}zones/.test(td), "zones are planning overlay, not part of the approved meaning");
});

test("area chrome: sub-selector (Boundary | Area) in Regions only, type picker lists the 9 types, icon-only bin has an aria-label", () => {
  assert.ok(survey.includes('id="rgKind"') && survey.includes('data-k="boundary">Boundary<') && survey.includes('data-k="zone">Area<'), "the exterior-region tab reads Area (zone stays internal)");
  assert.ok(/id="zoneDel"[^>]*aria-label="Delete area"/.test(survey));
  assert.ok(/id="zonePop"[^>]*role="dialog"/.test(survey));
  assert.ok(extractFn(survey, "updateRegionUI").includes("regionMode&&!frozen()"), "rgBar shows only while editing");
  assert.ok(extractFn(survey, "setRegionMode").includes('rgTarget={kind:"boundary"}'), "leaving Regions returns to the boundary target");
});
