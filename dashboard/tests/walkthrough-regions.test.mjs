// Walkthrough site context (node --test): zones + estimated boundary render as a quiet static layer under the
// coverage/markers, in the same plate-% space, using the export's colour map. The component is JSX (not loadable
// in node), so this guards the source contract + the shared centroid helper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { polygonCentroid } from "../lib/device-context.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const wk = src("../app/project/[accessId]/system-walkthrough.jsx");
const exp = src("../lib/survey2-export.js");
const rgbMap = (t) => (/(?:ZONE_RGB|EXPORT_ZONE_RGB) = (\{[^}]+\})/.exec(t) || [])[1];

test("walkthrough zone colours match the PDF export's map (one palette)", () => {
  assert.ok(rgbMap(wk), "walkthrough defines ZONE_RGB");
  assert.equal(rgbMap(wk), rgbMap(exp));
});

test("site layer: plate-% viewBox, under coverage + markers, static, never a legal line", () => {
  assert.match(wk, /viewBox="0 0 100 100" preserveAspectRatio="none"/);
  const siteZ = /\.swk2-site\{[^}]*z-index:(\d)/.exec(wk), covZ = /\.swk2-cov\{[^}]*z-index:(\d)/.exec(wk), mkZ = /\.swk2-mk\{[^}]*z-index:(\d)/.exec(wk);
  assert.ok(+siteZ[1] < +covZ[1] && +covZ[1] <= +mkZ[1]);
  assert.ok(wk.indexOf('className="swk2-site"') < wk.indexOf('className="swk2-cov"'));   // DOM order: under too
  assert.match(wk, /\.swk2-site\{[^}]*pointer-events:none/);
  assert.doesNotMatch(wk.slice(wk.indexOf("siteRegions"), wk.indexOf("const Ico")), /parcel|legal|property line/i);
  assert.doesNotMatch(wk, /animation:[^;}]*swk2-?(site|zl)/);   // no animation on the polygons
});

test("polygonCentroid places a zone label at its polygon centre ([x,y] vertices)", () => {
  const c = polygonCentroid([[10, 10], [30, 10], [30, 30], [10, 30]]);
  assert.ok(Math.abs(c.x - 20) < 1e-6 && Math.abs(c.y - 20) < 1e-6);
});
