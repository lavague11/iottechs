// Site Survey — WIRING ROUTES model (lib/survey-routes.js). The run shape, its validation on restore,
// the run summary and the unwired-device warning. Pure; no DOM.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CABLES, CABLE_KEYS, RUN_TYPES, ROUTE_MAX, ROUTE_PTS_MAX, BUNDLE_COLOR, OUTLINE,
  cableName, cableColor, validPts, validRoutes, validHead,
  routeCounts, routeTotal, runSummary, unwiredDevices,
} from "../lib/survey-routes.js";
import { parseSurveyFloors } from "../lib/survey2-model.js";
import { readFileSync } from "node:fs";

const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

test("the widget's cable table never drifts from lib/survey-routes.js", () => {
  // The widget is static HTML and keeps its own copy to draw with. If a colour or a key diverges, the
  // planner and the PDF render the same run in two different colours and nothing errors — so pin them.
  const m = widget.match(/var ROUTE_CABLES=(\[\[.*?\]\]);/);
  assert.ok(m, "the widget still declares ROUTE_CABLES");
  assert.deepEqual(JSON.parse(m[1]), CABLES.map((c) => [c.key, c.name, c.color]));
  assert.ok(widget.includes(`var ROUTE_OUTLINE="${OUTLINE}"`), "the dark outline matches");
  assert.ok(widget.includes(`ROUTE_BUNDLE="${BUNDLE_COLOR}"`), "the mixed-bundle grey matches");
});

const run = (o = {}) => ({ id: "r1", dev: "c1", cable: "cat6", run: "home", pts: [[10, 10], [50, 50]], ...o });

test("the four cable types are the spec's four, each with its own colour", () => {
  assert.deepEqual(CABLE_KEYS, ["cat6", "speaker", "hdmi", "power"]);
  assert.deepEqual(CABLES.map((c) => c.name), ["Cat6", "Speaker wire", "HDMI", "Power"]);
  const colors = CABLES.map((c) => c.color);
  assert.equal(new Set(colors).size, 4, "no two cables share a colour");
  assert.ok(!colors.includes(BUNDLE_COLOR), "the mixed-bundle grey is not one of the cable colours");
  colors.forEach((c) => assert.match(c, /^#[0-9A-F]{6}$/i));
  assert.equal(cableName("speaker"), "Speaker wire");
  assert.equal(cableColor("hdmi"), CABLES[2].color);
  // An unknown key must resolve to something drawable rather than undefined — a run with a corrupt
  // cable still has to render, it just renders as the default.
  assert.equal(cableName("nonsense"), "Cat6");
});

test("a run needs at least two points; points are clamped to the image and capped", () => {
  assert.equal(validPts([[0, 0]]), null, "one point is not a run");
  assert.equal(validPts("nope"), null);
  assert.equal(validPts([[0, 0], ["x", 2]]), null, "a non-numeric point invalidates the run");
  assert.deepEqual(validPts([[-5, 120], [50, 50]]), [[0, 100], [50, 50]], "clamped into 0..100");
  assert.deepEqual(validPts([{ x: 1, y: 2 }, { x: 3, y: 4 }]), [[1, 2], [3, 4]], "{x,y} accepted, pairs stored");
  const many = Array.from({ length: ROUTE_PTS_MAX + 20 }, (_, i) => [i % 100, 1]);
  assert.equal(validPts(many).length, ROUTE_PTS_MAX);
});

test("validRoutes drops junk, allow-lists cable + run type, forces unique ids and caps the list", () => {
  const out = validRoutes([
    run(),
    null, "junk", { id: "x" },                              // dropped: not a run
    run({ id: "r2", cable: "laser", run: "sideways" }),      // coerced to the defaults
    run({ id: "r1", dev: 7 }),                               // duplicate id + non-string dev
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[1].cable, "cat6", "an unknown cable falls back rather than being stored");
  assert.equal(out[1].run, "home");
  assert.equal(new Set(out.map((r) => r.id)).size, 3, "ids are made unique");
  assert.equal(out[2].dev, "", "a non-string dev becomes empty, never NaN");
  assert.ok(RUN_TYPES.includes(out[0].run));
  const many = Array.from({ length: ROUTE_MAX + 50 }, (_, i) => run({ id: `r${i}` }));
  assert.equal(validRoutes(many).length, ROUTE_MAX);
  assert.deepEqual(validRoutes(undefined), [], "a floor with no routes is an empty list, never a throw");
});

test("the head-end is a clamped point or null — never a half-read object", () => {
  assert.deepEqual(validHead({ x: 10, y: 20 }), { x: 10, y: 20 });
  assert.deepEqual(validHead({ x: -3, y: 400 }), { x: 0, y: 100 });
  assert.equal(validHead({ x: 10 }), null, "a point missing an axis is not a point");
  assert.equal(validHead(null), null);
});

test("the run summary counts runs per cable, in declared order, omitting types with none", () => {
  const floors = [
    { routes: [run({ id: "a" }), run({ id: "b" }), run({ id: "c", cable: "speaker" })] },
    { routes: [run({ id: "d", cable: "power" })] },
  ];
  assert.deepEqual(routeCounts(floors), { cat6: 2, speaker: 1, power: 1 });
  assert.equal(routeTotal(floors), 4);
  assert.equal(runSummary(floors), "Cat6: 2 runs · Speaker wire: 1 run · Power: 1 run",
    "declared cable order, singular for one, HDMI omitted entirely rather than printed as 0");
  assert.equal(runSummary([]), "", "nothing drawn yet renders nothing, not an empty shell");
});

test("unwired devices are reported by cid; annotations are never counted as unwired", () => {
  const floor = {
    devices: [
      { k: "cam", cid: "c1" }, { k: "cam", cid: "c2" },
      { k: "important", cid: "n1" },           // a note on the plan, not equipment
    ],
    routes: [run({ dev: "c1" })],
  };
  assert.deepEqual(unwiredDevices(floor), ["c2"]);
  // Wiring the last camera clears the warning; the annotation never appeared in it.
  floor.routes.push(run({ id: "r2", dev: "c2" }));
  assert.deepEqual(unwiredDevices(floor), []);
});

test("routes and the head-end survive parseSurveyFloors — the allow-list every renderer reads through", () => {
  // The regression this guards: parseSurveyFloors maps a FIXED set of floor fields, so a field that is
  // not named there is dropped before the customer layout, the PDF or the work order ever see it.
  const blob = JSON.stringify({ floors: [{
    name: "Floor 1", bg: "data:image/png;base64,AAA", devices: [{ k: "cam", cid: "c1", x: 1, y: 2 }],
    head: { x: 80, y: 90 },
    routes: [run({ dev: "c1", cable: "hdmi", run: "daisy" }), { id: "bad", pts: [[1, 1]] }],
  }] });
  const [f] = parseSurveyFloors(blob);
  assert.equal(f.routes.length, 1, "the one-point run was dropped on the way through");
  assert.equal(f.routes[0].cable, "hdmi");
  assert.equal(f.routes[0].run, "daisy");
  assert.deepEqual(f.head, { x: 80, y: 90 });
  // A floor saved before this feature existed reads as no routes rather than undefined.
  const [old] = parseSurveyFloors(JSON.stringify({ floors: [{ name: "F", bg: "data:x", devices: [] }] }));
  assert.deepEqual(old.routes, []);
  assert.equal(old.head, null);
});
