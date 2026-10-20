// Floor-plan (Structure) editor zoom/pan — pinch + wheel + buttons, composed on the fit-to-fill view so
// nothing exported changes (cells/ctxVB/planSvg stay in world space).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const h = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");

test("user zoom/pan composes on the fit-to-fill base (one transform drives render + hit-test + overlays)", () => {
  assert.ok(/function baseView\(\)\{/.test(h), "fit-to-fill base factored out");
  assert.ok(/var _uz=1, _utx=0, _uty=0, MAXZ=6;/.test(h), "user zoom/pan state + max");
  assert.ok(/_vk=b\.vk\*_uz; _vx=b\.vx\*_uz\+_utx; _vy=b\.vy\*_uz\+_uty;/.test(h), "computeView folds user zoom/pan into _vk/_vx/_vy");
  assert.ok(/if\(_uz<=1\)\{ _uz=1; _utx=0; _uty=0; \} else clampPan\(\);/.test(h), "fit view snaps pan to centred; zoomed view is pan-clamped");
  // rel() (pointer→world) is UNCHANGED — it already divides by the composed _vk/_vx/_vy, so cells land right at any zoom
  assert.ok(h.includes("function rel(e){ var r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left-_vx)/_vk, y:(e.clientY-r.top-_vy)/_vk}; }"), "pointer mapping goes through the composed view");
});

test("zoom keeps the point under the cursor/pinch-centre fixed", () => {
  assert.ok(/function setZoomAbout\(fx, fy, newUz\)\{[\s\S]*wx=\(fx-_vx\)\/_vk, wy=\(fy-_vy\)\/_vk/.test(h), "world point under focal captured");
  assert.ok(/_utx=fx - wx\*b\.vk\*_uz - b\.vx\*_uz; _uty=fy - wy\*b\.vk\*_uz - b\.vy\*_uz;/.test(h), "pan re-solved so focal stays put");
});

test("pinch-to-zoom + two-finger pan on touch, without breaking one-finger drawing", () => {
  assert.ok(/var _ptrs=new Map\(\), _pinching=false/.test(h), "tracks active touch pointers");
  assert.ok(/if\(_ptrs\.size>=2\)\{\s*\/\/ a second finger[\s\S]*dragging=false;[\s\S]*beginPinch\(\); redraw\(\); return;/.test(h), "a 2nd finger aborts the in-progress draw and starts a pinch");
  assert.ok(/function updatePinch\(\)\{[\s\S]*setZoomAbout\([\s\S]*_utx \+= \(g\.mx-_pp\.mx\); _uty \+= \(g\.my-_pp\.my\);/.test(h), "distance zooms, midpoint drag pans");
  assert.ok(/if\(wasPinch\)\{ if\(_ptrs\.size<2\) endPinch\(\); return; \}/.test(h), "lifting a pinch finger never commits a draw");
  assert.ok(h.includes('cv.addEventListener("pointercancel"'), "pointercancel cleans up the pinch");
});

test("desktop wheel zoom + discoverable zoom buttons", () => {
  assert.ok(/cv\.addEventListener\("wheel", function\(e\)\{[\s\S]*zoomAbout\(e\.clientX-r\.left, e\.clientY-r\.top, _uz\*f\);/.test(h), "wheel zooms about the cursor");
  assert.ok(/\$\("zoomIn"\)\.addEventListener\("click"[\s\S]*_uz\*1\.5/.test(h), "zoom-in button");
  assert.ok(/\$\("zoomOut"\)\.addEventListener\("click"[\s\S]*_uz\/1\.5/.test(h), "zoom-out button");
  assert.ok(/\$\("zoomFit"\)\.addEventListener\("click", resetZoom\)/.test(h), "reset/fit button");
  assert.ok(/id="zoomIn"/.test(h) && /id="zoomOut"/.test(h) && /id="zoomFit"/.test(h), "the three controls exist");
  assert.ok(/#cv\{[^}]*touch-action:none/.test(h), "#cv keeps touch-action:none so multi-touch reaches the canvas");
});
