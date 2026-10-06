// Phase 3c — migrate legacy polygon boundary/zones → cells, retire the polygon editor on cell-grid floors.
// Drift guard: the draw tool's INLINE rasteriser must match lib/zone-migrate.js. Plus source guards on
// the survey ↔ draw wiring and the editor retirement.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { polygonToCells } from "../lib/zone-migrate.js";

const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

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

test("drift: the draw tool's inline rasteriser produces the SAME cells as lib/zone-migrate.js", () => {
  const FNS = ["pointInPoly", "polyPctToPlanPx", "rasterPolyToHalfCells"].map((n) => extractFn(draw, n)).join("\n");
  const inline = new Function(`var HALF=13; ${FNS} return rasterPolyToHalfCells;`)();
  const VB = { x0: 5, y0: -7, vw: 180, vh: 220 };
  const polys = [
    [[0, 0], [60, 0], [60, 40], [0, 40]],
    [[12, 18], [88, 22], [70, 90], [20, 75]],   // irregular quad
  ];
  for (const p of polys) {
    const a = inline(p, VB).slice().sort();
    const b = polygonToCells(p, VB, 13).slice().sort();
    assert.deepEqual(a, b, "inline rasteriser drifted from the lib");
  }
});

test("survey hands the polygons over and flags migration (reversible)", () => {
  assert.ok(survey.includes('type:"iotZonePolys", fid:fid, boundary:(fl&&fl.boundary)||null, zones:(fl&&fl.zones)||[]'), "survey posts the legacy polygons");
  assert.ok(survey.includes('m.type!=="iotZonesMigrated"'), "survey handles the migrated signal");
  assert.ok(survey.includes("fl.zonesMigrated=true"), "sets the per-floor flag");
  assert.ok(survey.includes("zonesMigrated:!!f.zonesMigrated"), "flag rides restore");
});

test("survey retires the polygon render + editor once a floor is migrated / has a cell grid", () => {
  assert.ok(extractFn(survey, "renderBoundary").includes("_mf.zonesMigrated"), "migrated floor skips the polygon render");
  assert.ok(extractFn(survey, "updateRegionUI").includes("!hybridCapable(floors[curFloor])"), "the Regions editor is hidden on cell-grid floors");
});

test("draw tool: Import-zones action rasterises into one class per cell (boundary=site base, zones override)", () => {
  assert.ok(draw.includes('id="mImportZones"'), "Import zones menu item");
  assert.ok(draw.includes('m.type!=="iotZonePolys"'), "receives the polygons");
  const fn = extractFn(draw, "importZonePolys");
  assert.ok(fn.includes('paint(_zonePolys.boundary.pts, "site")'), "boundary → site base layer");
  assert.ok(fn.includes("owner[k]=type"), "later zones override (one class per cell)");
  assert.ok(fn.includes('type:"iotZonesMigrated"'), "signals the survey on success");
});
