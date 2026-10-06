// Clickable rooms: a live interactive hit-layer over the vector plan in the survey's Plan/Hybrid views.
// Click selects the canonical Room object (floor.plan.rooms); the plan visual stays planSvg (no re-render,
// no raster). Source guards on the real widget (live behavior verified in the browser).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
function fn(name) {
  const start = survey.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  let i = survey.indexOf("{", survey.indexOf(")", start)), depth = 0, q = null;
  for (let j = i; j < survey.length; j++) { const c = survey[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{") depth++; else if (c === "}" && --depth === 0) return survey.slice(start, j + 1); }
  throw new Error("unbalanced " + name);
}

test("room hit-layer element + styles exist, below devices and interactive", () => {
  assert.ok(survey.includes('<svg id="roomLayer"'), "roomLayer svg in #scene");
  assert.ok(/#roomLayer\{[^}]*z-index:4[^}]*pointer-events:none/.test(survey), "layer itself passes clicks through");
  assert.ok(/#roomLayer path\{[^}]*pointer-events:all/.test(survey), "each room path captures clicks");
  assert.ok(survey.includes("#roomLayer path.sel{"), "selected-room highlight style");
  assert.ok(/\.devNode\{[^}]*z-index:5/.test(survey), "devices (z5) stay above the room layer (z4)");
});

test("renderRooms draws one point-in-path hit target per canonical room, aligned to the plan viewBox", () => {
  const r = fn("renderRooms");
  assert.ok(r.includes("f.plan&&Array.isArray(f.plan.rooms)"), "reads canonical rooms");
  assert.ok(r.includes("hybridCapable(f)?planViewBox(f.planSvg):null") && r.includes('rl.setAttribute("viewBox"'), "SVG viewBox = the plan's viewBox (1:1 with planSvg)");
  assert.ok(r.includes('roomCellsPath(r.cells)') && r.includes('data-ri="'), "a path per room from its cell-union, keyed by index");
  assert.ok(r.includes('(view==="plan"||view==="hybrid")'), "shown in Plan/Hybrid only");
});

test("rooms are selectable only when idle (not placing / aiming / region-editing / frozen)", () => {
  assert.ok(fn("roomsIdle").includes("!frozen() && !armedK && !regionMode && !angleMode"), "idle gate");
  // the modes that change idle all refresh the layer
  assert.ok(fn("arm").includes("renderRooms()"), "arming a device refreshes rooms");
  assert.ok(fn("setAngleMode").includes("renderRooms()"), "angle mode refreshes rooms");
});

test("clicking a room selects the Room object; Edit opens the structure editor (no stale baked labels)", () => {
  assert.ok(survey.includes('e.target.closest("path")') && survey.includes("selectRoom(isFinite(i)?i:-1)"), "click → selectRoom by path index");
  assert.ok(fn("selectRoom").includes("if(selId!=null) select(null)"), "selecting a room clears the device selection");
  assert.ok(fn("roomTagShow").includes("enterDraw()"), "Edit routes rename/merge/type to the structure editor");
});

test("renderRooms is wired into the view + plate refreshes", () => {
  assert.ok(fn("renderView").includes("renderRooms()"), "view switch refreshes the room layer");
  assert.ok(fn("fitScene").includes("renderRooms()"), "plate resize refreshes the room layer");
});
