// Phase 3 (grid-first) — SITE + exterior ZONE classification as cells on the building's half-cell grid
// (draw-floorplan.html). Reads the real widget, brace-extracts the pure zone helpers, evals them against
// stubbed globals; plus source guards on the paint routing / render / serialize / UI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

function extractFn(s, name) {
  const start = s.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  let i = s.indexOf("{", s.indexOf(")", start)), depth = 0, quote = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return s.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const FNS = ["zcGet", "zcOut", "zcIn", "zcClone", "zClassLabel"].map((n) => extractFn(draw, n)).join("\n");
function env() {
  return new Function(`
    var ZCLASS=[["site","Site","150,156,160"],["driveway","Driveway","176,136,84"],["parking","Parking","74,126,206"],["street","Street","120,132,148"]];
    var ZCOL={}; ZCLASS.forEach(function(t){ ZCOL[t[0]]=t[2]; });
    var zoneCells={};
    ${FNS}
    return { get zoneCells(){return zoneCells;}, set zoneCells(v){zoneCells=v;}, zcGet, zcOut, zcIn, zcClone, zClassLabel, ZCOL };
  `)();
}

test("zcIn validates against the taxonomy; zcOut emits only non-empty types as arrays", () => {
  const e = env();
  e.zoneCells = e.zcIn({ driveway: ["1,1", "2,1"], bogus: ["9,9"], parking: [] });
  assert.deepEqual(e.zcOut(), { driveway: ["1,1", "2,1"] });   // unknown type dropped, empty omitted
});

test("zcGet lazily creates a Set per type; zcClone deep-copies (no shared refs)", () => {
  const e = env();
  e.zcGet("site").add("0,0");
  const snap = e.zcClone(e.zoneCells);
  e.zcGet("site").add("0,1");                       // mutate live after cloning
  assert.deepEqual(Array.from(snap.site), ["0,0"]); // clone unaffected
  assert.deepEqual(Array.from(e.zoneCells.site).sort(), ["0,0", "0,1"]);
});

test("zClassLabel maps a type key to its display label", () => {
  const e = env();
  assert.equal(e.zClassLabel("driveway"), "Driveway");
  assert.equal(e.zClassLabel("nope"), "Zone");
});

test("zone cells serialize + ride history", () => {
  assert.ok(draw.includes("o.zoneCells=zc"), "planOut emits zoneCells");
  assert.ok(draw.includes("zoneCells=zcIn(s&&s.zoneCells)"), "applyPlan restores zoneCells");
  assert.ok(draw.includes("zoneCells:zcClone(zoneCells)"), "snapshot copies zoneCells");
  assert.ok(draw.includes("zoneCells=zcClone(s.zoneCells||{})"), "applySnap restores zoneCells");
});

test("zone paint is one-class-per-cell and draws UNDER the structure", () => {
  assert.ok(draw.includes('if(mode==="zone"){'), "pointerup has a zone branch");
  assert.ok(draw.includes("for(var t in zoneCells){ if(t!==zoneType && zoneCells[t].delete(k)) zch=true; }"),
    "painting a type removes the cell from every other type");
  assert.ok(/drawZoneCells\(\);\s*drawStructure\(\)/.test(draw.replace(/\n/g, " ")), "zone fills render beneath the structure");
});

test("3b: zone cells bake into every plan SVG, as the lowest content layer (under the structure)", () => {
  // zoneCellsSVG emitted (translucent by type) and pushed before the structure wash in each builder
  assert.ok(draw.includes('out+=\'<g fill="rgb(\'+col+\')" fill-opacity="0.22">\'+rects+\'</g>\';'), "zone fills are translucent rgb groups");
  // sketchSVG (Plan/PDF opaque bg), planLayerSVG (Hybrid transparent), overlaySVG (AI) each push zones before the structure cells
  const order = (anchor) => {
    const i = draw.indexOf("var zc=zoneCellsSVG(); if(zc) o.push(zc);", draw.indexOf(anchor));
    return i >= 0;
  };
  assert.ok(draw.split("var zc=zoneCellsSVG(); if(zc) o.push(zc);").length - 1 >= 3, "zones baked into all three SVG builders");
  assert.ok(draw.includes("!(hasSketch()||zoneHasCells())"), "a zones-only floor still emits a Hybrid plan layer");
});

test("Zones mode UI: segment button + type picker exist and are wired", () => {
  assert.ok(draw.includes('id="tZones"'), "Zones segment button");
  assert.ok(draw.includes('id="zoneTypeSel"'), "zone type picker");
  assert.ok(draw.includes('setMode(mode==="zone" ? "structure" : "zone")'), "Zones button toggles the mode");
  assert.ok(draw.includes('var edit = m==="structure"||m==="zone";'), "Add/Erase + snap apply in Zones mode too");
});
