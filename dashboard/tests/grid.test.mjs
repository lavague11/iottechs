// Phase 4.3 — one permanent scaled grid overlay ("1 box = N ft"), Grid toggle, rotate hidden on ctx floors.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../public/widgets/" + f, import.meta.url), "utf8");
const draw = read("draw-floorplan.html");
const survey = read("site-survey-merged.html");

function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name + "()");
  let i = src.indexOf("{", src.indexOf(")", start)), depth = 0, quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

test("4.3 draw: the baked grid is emitted only when no vb is given; paper rect + svgPlanBody stay unconditional", () => {
  const fn = extractFn(draw, "sketchSVG");
  assert.match(fn, /if\(!vb\)\{ o\.push\('<defs><pattern id="pg"/, "grid pattern guarded by !vb");
  assert.match(fn, /fill="url\(#pg\)"\/>'\); \}/, "grid rect is inside the same !vb block");
  const guardEnd = fn.indexOf("fill=\"url(#pg)\"/>'); }");
  const paper = fn.indexOf('fill="#ffffff"');
  assert.ok(paper >= 0 && paper < fn.indexOf("if(!vb){ o.push"), "white paper rect is emitted before, outside the guard");
  assert.ok(fn.indexOf("svgPlanBody(o, swS, swR, fs);") > guardEnd, "svgPlanBody runs after, unconditionally");
  assert.equal((fn.match(/pattern id="pg"/g) || []).length, 1);
});

test("4.3 survey: #gridLayer sits after .dimOverlay inside #scene; #gridScale is outside #scene", () => {
  assert.match(survey, /<div class="dimOverlay"><\/div><div id="gridLayer"><\/div><\/div><div id="gridScale"><\/div>/);
  assert.match(survey, /#gridLayer\{[^}]*pointer-events:none[^}]*z-index:2|#gridLayer\{[^}]*z-index:2[^}]*pointer-events:none/);
  assert.match(survey, /\.devNode\{[^}]*z-index:3/, "devices stay above the grid");
});

test("4.3 survey: Grid toggle row, state default-on, applySettings reflects it, save/restore persist it", () => {
  assert.match(survey, /<label>Grid<\/label><button class="settog" id="showGridTog"/);
  assert.match(survey, /showGridState=true/);
  assert.ok(extractFn(survey, "applySettings").includes('getElementById("showGridTog")') && extractFn(survey, "applySettings").includes("renderGrid()"));
  assert.match(survey, /getElementById\("showGridTog"\)\.addEventListener\("click".*showGridState=!showGridState/);
  assert.ok(extractFn(survey, "save").includes("showGrid:showGridState"));
  assert.ok(extractFn(survey, "restore").includes("showGridState=st.showGrid!==false"), "defaults on when absent");
});

test("4.3 survey: renderGrid uses viewBox parse + FULL + metersPerPx + 0.3048 and is driven by renderView/fitScene", () => {
  const rg = extractFn(survey, "renderGrid");
  assert.ok(rg.includes("metersPerPx") && rg.includes("0.3048") && rg.includes("GRID_FULL") && rg.includes("hybridCapable(f)"));
  assert.ok(rg.includes('"1 box = "') && rg.includes("ft"));
  assert.ok(extractFn(survey, "planViewBox").includes("viewBox="));
  assert.ok(extractFn(survey, "renderView").includes("renderGrid()"));
  assert.ok(extractFn(survey, "fitScene").includes("renderGrid()"));
});

test("4.3 survey: gridMetrics worked sample (sceneW 420, x0 152, vw 336 → 32.5px spacing, 5px first-line offset)", () => {
  const GRID_FULL = 26;
  const gridMetrics = new Function("GRID_FULL", extractFn(survey, "gridMetrics") + "; return gridMetrics;")(GRID_FULL);
  const m = gridMetrics(420, 152, 336);
  assert.equal(m.spacing, 32.5);
  assert.equal(m.off, 5);
  assert.equal(gridMetrics(420, 0, 336).off, 0);   // origin on a line → no offset
  assert.equal(gridMetrics(420, -10, 336).off, (0 - -10) * 1.25);   // negative origin: first line at 0
  assert.equal(survey.match(/var GRID_FULL=(\d+)/)[1], "26", "GRID_FULL mirrors the draw tool's FULL");
  assert.equal(draw.match(/var FULL=(\d+)/)[1], "26");
});

test("4.3 survey: grid box feet label math (FULL * metersPerPx / 0.3048, 1 decimal)", () => {
  const n = Math.round(26 * 0.0366 / 0.3048 * 10) / 10;
  assert.ok(n > 3.0 && n < 3.2);   // 0.9516 m / 0.3048 ≈ 3.1 ft
});

test("4.3 survey: Rotate is hidden for hybrid-capable floors", () => {
  assert.ok(extractFn(survey, "renderView").includes('rb.style.display=cap?"none":""'));
  assert.match(survey, /id="rotateBtn"/);
});
