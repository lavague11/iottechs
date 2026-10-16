// System Planner fullscreen (Phase 2): the planner itself goes fullscreen (floor context + rail + tools
// stay) via the Fullscreen API — NO body-portal, so the iframes never reparent/reload. Graceful fallback
// to the survey widget's own portal fullscreen when the API is unavailable.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

test("planner owns fullscreen via the Fullscreen API (no reparent), with a focus-event fallback", () => {
  assert.ok(sp.includes("const [fsOn, setFsOn]"), "fsOn state");
  assert.ok(/el\.requestFullscreen \|\| el\.webkitRequestFullscreen/.test(sp), "requests fullscreen on the .syp element");
  assert.ok(sp.includes('new CustomEvent("iotSurveyFocus"'), "falls back to the widget's focus event when the API is blocked");
  assert.ok(sp.includes('document.addEventListener("fullscreenchange"'), "syncs fsOn from fullscreenchange");
  // must NOT reach for a body portal (that would remount/reload the iframes)
  assert.ok(!sp.includes("createPortal"), "no createPortal in the planner shell (would reload the iframes)");
});

test("the root carries the fullscreen class + a ⛶ toggle sits in the rail", () => {
  assert.ok(sp.includes('className={`syp${fsOn ? " syp--fs" : ""}`}'), "root gets .syp--fs when fullscreen");
  assert.ok(sp.includes('onClick={fsOn ? exitFs : enterFs}'), "a single ⛶/exit toggle");
  assert.ok(/\.syp:fullscreen/.test(sp), "fullscreen layout CSS present");
});

test("the in-canvas ⛶ is dropped in planner mode (one fullscreen entry)", () => {
  assert.ok(widget.includes("body.planner #fullBtn{display:none!important}"), "widget hides its own fullscreen button under body.planner");
});
