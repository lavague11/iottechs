// System Planner fullscreen (Phase 2, rev 2): the planner itself goes fullscreen (floor context + rail +
// tools + footer stay) via a CSS OVERLAY — not the Fullscreen API, which is silently ignored in some
// embedders (the Claude preview pane) so the button did nothing. The overlay never reparents .syp, so the
// iframes never reload and stay editable; it neutralizes the transformed .dv-slide so position:fixed escapes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sp = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");
const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

test("planner fullscreen is a CSS overlay, not the Fullscreen API", () => {
  assert.ok(sp.includes("const [fsOn, setFsOn]"), "fsOn state");
  // the API (and its silently-ignored request / dead .catch fallback) is gone
  assert.ok(!/requestFullscreen/.test(sp), "no Fullscreen API request (it does nothing in the pane)");
  assert.ok(!sp.includes('addEventListener("fullscreenchange"'), "no fullscreenchange listener");
  assert.ok(!sp.includes('new CustomEvent("iotSurveyFocus"'), "no widget-only focus fallback");
  // enter/exit toggle fsOn and neutralize the transformed slide so the fixed overlay escapes it
  assert.ok(sp.includes('el.closest(".dv-slide")') && sp.includes('classList.add("syp-fs-host")'), "enterFs tags the slide host to neutralize its transform");
  assert.ok(sp.includes("setFsOn(true)") && sp.includes("setFsOn(false)"), "enter/exit drive fsOn directly");
  assert.ok(sp.includes('document.body.classList.add("syp-fs-lock")'), "background scroll is locked while fullscreen");
  assert.ok(/e\.key === "Escape"/.test(sp), "Esc exits fullscreen");
  // must NOT reach for a body portal (that would remount/reload the iframes)
  assert.ok(!sp.includes("createPortal"), "no createPortal in the planner shell (would reload the iframes)");
});

test("the root carries the fullscreen class + a ⛶ toggle; the overlay CSS escapes the transformed slide", () => {
  assert.ok(sp.includes('${fsOn ? " syp--fs" : ""}'), "root gets .syp--fs when fullscreen");
  assert.ok(sp.includes('onClick={fsOn ? exitFs : enterFs}'), "a single ⛶/exit toggle");
  assert.ok(/\.syp\.syp--fs\{position:fixed;inset:0/.test(sp), "overlay is a fixed, viewport-filling layer");
  assert.ok(/height:100dvh/.test(sp), "100dvh for mobile fullscreen");
  assert.ok(/\.dv-slide\.syp-fs-host\{transform:none!important/.test(sp), "the host slide's transform is neutralized so the overlay escapes it");
});

test("the in-canvas ⛶ is dropped in planner mode (one fullscreen entry)", () => {
  assert.ok(widget.includes("body.planner #fullBtn{display:none!important}"), "widget hides its own fullscreen button under body.planner");
});
