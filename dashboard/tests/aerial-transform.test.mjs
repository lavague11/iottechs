import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, "..", "public", "widgets", "satellite-capture.html"), "utf8");

test("capture records north as norm(viewRot) with the convention comment", () => {
  assert.ok(html.includes("northDeg: norm(viewRot)"), "capture must record northDeg: norm(viewRot)");
  assert.ok(html.includes("// north is this many degrees CLOCKWISE from screen-up (raw map is north-up; the view is CSS-rotated by viewRot)"),
    "convention comment must stay next to northDeg");
});

test("both capture results post the aerial transform", () => {
  const n = html.split("aerial: capAerial").length - 1;
  assert.ok(n >= 2, `expected aerial: capAerial in usePreview and trUse, found ${n}`);
  assert.ok(/function usePreview\(\)[\s\S]*?aerial: capAerial/.test(html), "usePreview posts aerial");
  assert.ok(/function trUse\(\)[\s\S]*?aerial: capAerial/.test(html), "trUse posts aerial");
});

test("restore entry point exists", () => {
  assert.ok(html.includes("function applyAerial("), "applyAerial defined");
  assert.ok(html.includes("iotAerialRestore"), "iotAerialRestore handler present");
  assert.ok(html.includes("pendingAerial"), "restore before maps load is stashed");
});

test("convention: north is degrees clockwise from screen-up (= the level rotation)", () => {
  const norm = (d) => ((d + 180) % 360 + 360) % 360 - 180;
  assert.equal(norm(13), 13);     // levelled 13° clockwise → north is 13° clockwise from up
  assert.equal(norm(-13), -13);   // levelled -13° → north is 13° counter-clockwise
  assert.equal(norm(193), -167);
});
