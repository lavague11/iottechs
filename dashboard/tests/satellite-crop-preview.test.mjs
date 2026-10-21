// Satellite editor: Crop works on the ENHANCED preview in place — it no longer reverts to the old
// background and forces a re-enhance (owner bug report).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sat = readFileSync(new URL("../public/widgets/satellite-capture.html", import.meta.url), "utf8");

test("Crop on the enhanced preview crops in place (no backToLive, no re-enhance)", () => {
  const h = sat.slice(sat.indexOf('$("tCrop").addEventListener'), sat.indexOf("function cropPreview("));
  // the Crop handler must NOT revert to the live map when a preview is showing
  assert.ok(!/backToLive\(\)/.test(h), "Crop no longer calls backToLive() (that discarded the enhancement)");
  assert.ok(/var inPreview=preview\.classList\.contains\("show"\)/.test(h), "it branches on whether a preview is showing");
  assert.ok(h.includes("if(inPreview) cropPreview();") && h.includes("else ensureCaptured();"), "preview → crop in place; live map → stitch + cut");
});

test("cropPreview crops capCanvas, keeps the enhancement, and shrinks scale + aerial rect proportionally", () => {
  const fn = sat.slice(sat.indexOf("function cropPreview(){"), sat.indexOf("function commitUI("));
  assert.ok(fn.includes("var ir=trImgRect();"), "maps the drawn box through the displayed-image rect");
  assert.ok(fn.includes("cut.getContext(\"2d\").drawImage(capCanvas,") && fn.includes("capCanvas=cut;") && fn.includes('$("prevImg").src=cut.toDataURL'), "cuts capCanvas → new capCanvas + preview image");
  assert.ok(/capMetersW\*=fw; if\(capMetersH>0\) capMetersH\*=fh;/.test(fn), "real-world size shrinks with the crop (Use posts the right scale)");
  assert.ok(fn.includes("capAerial.rect={ x:R.x+fx*R.w, y:R.y+fy*R.h, w:R.w*fw, h:R.h*fh }"), "the aerial rect shrinks proportionally");
  assert.ok(!/enhancedOnce\s*=/.test(fn), "it never clears enhancedOnce — the image stays the enhanced one");
});

test("the crop layer lifts above the preview so the box is drawable over the enhanced image", () => {
  assert.ok(/#draw\.over\{z-index:9\}/.test(sat), "#draw.over raises the crop layer above #preview (z8)");
  assert.ok(sat.includes('if(inPreview) $("draw").classList.add("over");'), "preview-crop adds .over");
  assert.ok(/function exitCrop\(\)\{[^}]*classList\.remove\("over"\)/.test(sat), "exitCrop clears it");
});
