// Runs that share a stretch of ceiling are ONE bundle, and the drawing has to say so — otherwise
// four coincident strokes read as a single cable and the work is under-reported.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bundleSegments, bundles, segMidpoint, bundleColor, routeAt, BUNDLE_TOL, BUNDLE_COLOR, cableColor } from "../lib/survey-routes.js";

const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const run = (id, cable, pts) => ({ id, dev: "d" + id, cable, run: "home", pts });

test("two runs down the same corridor bundle on the shared stretch only", () => {
  // Both drop into the corridor at (50,50) and run together to the head-end at (50,90).
  const routes = [
    run("r1", "cat6", [[10, 10], [50, 50], [50, 90]]),
    run("r2", "cat6", [[90, 10], [50, 50], [50, 90]]),
  ];
  const b = bundles(routes);
  assert.equal(b.length, 1, "one shared stretch");
  assert.equal(b[0].count, 2);
  assert.deepEqual(b[0].runs.map((r) => r.id).sort(), ["r1", "r2"]);
  assert.deepEqual(segMidpoint(b[0]), [50, 70], "the badge sits at the middle of the shared run");
  // The approach legs are each a single run and are NOT bundled.
  const all = bundleSegments(routes);
  assert.equal(all.length, 3, "two approaches + one shared stretch");
  assert.equal(all.filter((s) => s.count === 1).length, 2);
});

test("direction does not matter — a run traced back crosses the same ceiling", () => {
  const routes = [
    run("r1", "cat6", [[20, 20], [80, 80]]),
    run("r2", "cat6", [[80, 80], [20, 20]]),   // same stretch, drawn the other way
  ];
  assert.equal(bundles(routes).length, 1, "A→B and B→A are one stretch");
  assert.equal(bundles(routes)[0].count, 2);
});

test("drawing slop within the tolerance still counts as the same stretch", () => {
  const off = BUNDLE_TOL / 3;                       // a tap a fraction of the tolerance away
  const routes = [
    run("r1", "cat6", [[30, 30], [70, 70]]),
    run("r2", "cat6", [[30 + off, 30 + off], [70 - off, 70 - off]]),
  ];
  assert.equal(bundles(routes).length, 1, "a finger's width of slop does not split a bundle");
  // …but a genuinely different path does not get merged.
  const apart = [run("r1", "cat6", [[30, 30], [70, 70]]), run("r2", "cat6", [[30, 55], [70, 95]])];
  assert.equal(bundles(apart).length, 0);
});

test("a mixed bundle draws neutral; a single-type bundle keeps its cable colour", () => {
  const mixed = [run("r1", "cat6", [[0, 0], [50, 50]]), run("r2", "speaker", [[0, 0], [50, 50]])];
  const m = bundles(mixed)[0];
  assert.equal(m.mixed, true);
  assert.deepEqual(m.cables.sort(), ["cat6", "speaker"]);
  assert.equal(bundleColor(m), BUNDLE_COLOR, "no member's colour may stand for the whole bundle");
  const same = [run("r1", "hdmi", [[0, 0], [50, 50]]), run("r2", "hdmi", [[0, 0], [50, 50]])];
  const s = bundles(same)[0];
  assert.equal(s.mixed, false);
  assert.equal(bundleColor(s), cableColor("hdmi"));
});

test("four runs sharing one stretch report four, not two pairs", () => {
  const routes = ["a", "b", "c", "d"].map((id, i) => run(id, "cat6", [[i * 10, 0], [50, 50], [50, 90]]));
  const b = bundles(routes);
  const shared = b.find((s) => segMidpoint(s)[1] === 70);
  assert.equal(shared.count, 4, "the badge says 4");
  assert.equal(shared.runs.length, 4);
});

test("the same run cannot bundle with itself, and degenerate input is ignored", () => {
  // A run that doubles back over its own segment is still one cable on that stretch.
  const doubled = [run("r1", "cat6", [[10, 10], [50, 50], [10, 10]])];
  assert.deepEqual(bundles(doubled), [], "one run is never a bundle");
  // Zero-length segments contribute nothing.
  assert.deepEqual(bundleSegments([run("r1", "cat6", [[20, 20], [20, 20]])]), []);
  assert.deepEqual(bundleSegments(null), []);
  assert.deepEqual(bundleSegments([{ id: "x", pts: [[1, 1]] }]), [], "a one-point run has no segment");
});

test("routeAt finds the run under a tap — nearest wins, and the whole run is identified", () => {
  const routes = [
    run("r1", "cat6", [[10, 10], [10, 80]]),      // a vertical line at x=10
    run("r2", "speaker", [[40, 10], [40, 80]]),   // another at x=40
  ];
  // Right on the line.
  assert.equal(routeAt(routes, 10, 45)?.id, "r1");
  // Within tolerance beside it.
  assert.equal(routeAt(routes, 11.2, 45)?.id, "r1");
  // Clear of both.
  assert.equal(routeAt(routes, 25, 45), null, "a tap between runs hits nothing");
  // Past the end of the segment — not an infinite line.
  assert.equal(routeAt(routes, 10, 95), null, "beyond the run's end is a miss");
  // Overlapping runs: the nearer one wins rather than whichever is first.
  const over = [run("a", "cat6", [[0, 20], [100, 20]]), run("b", "hdmi", [[0, 23], [100, 23]])];
  assert.equal(routeAt(over, 50, 20.2)?.id, "a");
  assert.equal(routeAt(over, 50, 22.8)?.id, "b");
  // It reports the run, not a segment — deleting is always the whole cable.
  const hit = routeAt(routes, 10, 45);
  assert.deepEqual([hit.id, hit.cable, hit.run], ["r1", "cat6", "home"]);
});

test("the widget's hit test mirrors routeAt, and deleting removes the WHOLE run", () => {
  assert.match(widget, /var RT_HIT_TOL=1\.6;/, "same tolerance as routeAt's default");
  const del = widget.slice(widget.indexOf("function rtDeleteRun("), widget.indexOf("function rtUndoPoint("));
  assert.ok(/f\.routes\.filter\(function\(r\)\{ return !r \|\| r\.id!==id; \}\)/.test(del),
    "filters by run id — never a partial segment");
  assert.ok(/rtHistPush\(\)/.test(del), "and pushes history, so undo covers the delete instead of a confirm dialog");
  // A tap on a marker still belongs to the marker: the run test runs only when nothing else is under it.
  assert.ok(widget.includes("if(!dev && !head){"), "devices and the head-end win the tap");
});

test("the widget renders bundles from the shared model, not its own copy", () => {
  assert.ok(widget.includes("function rtBundles("), "the widget has a bundle pass");
  assert.match(widget, /var RT_BUNDLE_TOL=0\.9/, `tolerance mirrors BUNDLE_TOL=${BUNDLE_TOL}`);
  const fn = widget.slice(widget.indexOf("var RT_BUNDLE_TOL"), widget.indexOf("function renderRoutes("));
  assert.ok(/ka<=kb/.test(fn), "undirected segment key, so A→B and B→A collide");
  assert.ok(/function rtClusterer\(\)/.test(fn) && /Math\.abs\(c\[0\]-p\[0\]\)<=RT_BUNDLE_TOL/.test(fn),
    "endpoints are clustered, not grid-rounded — the same decision the lib makes");
});
