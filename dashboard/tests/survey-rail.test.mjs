// Section A — Site Survey step order. Pure rules (lib/survey-rail.js) + the widget's mirror of the
// structure check, so the rail cannot skip, Background cannot bounce, and Layout's Next follows the floor.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stepAfter, stepBefore, railFromEcho, floorHasStructure, layoutNextOk } from "../lib/survey-rail.js";
import { RAIL_STEPS } from "../lib/survey-state.js";

const widget = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const shell = readFileSync(new URL("../app/project/[accessId]/system-planner.jsx", import.meta.url), "utf8");

test("the declared order is Background, Layout, Placement, Route, Camera Angles, Approval", () => {
  // Route (the wiring diagram) sits after Placement: runs start at placed devices, and drawing them
  // before the angle cones exist keeps the plan readable while cable paths are traced.
  assert.deepEqual(RAIL_STEPS, ["background", "layout", "cameras", "route", "views", "review"]);
});

test("the widget's mirrored RAIL_STEPS never drifts from lib/survey-state.js", () => {
  // The widget keeps its own copy to validate the `railStep` command under bare JS. If the two lists
  // disagree, normRail() silently drops the new step and the survey reopens on the wrong one — no
  // error anywhere. Pin them equal.
  const m = widget.match(/var RAIL_STEPS=(\[[^\]]*\])/);
  assert.ok(m, "the widget still declares RAIL_STEPS");
  assert.deepEqual(JSON.parse(m[1]), RAIL_STEPS, "widget RAIL_STEPS == lib RAIL_STEPS");
});

test("Next advances exactly one step from every position; Back is the inverse; ends are null", () => {
  RAIL_STEPS.forEach((s, i) => {
    assert.equal(stepAfter(s), RAIL_STEPS[i + 1] || null, `after ${s}`);
    assert.equal(stepBefore(s), RAIL_STEPS[i - 1] || null, `before ${s}`);
    if (RAIL_STEPS[i + 1]) assert.equal(stepBefore(stepAfter(s)), s, `back undoes next at ${s}`);
  });
  assert.equal(stepAfter("background"), "layout", "Background -> Layout, never Placement");
  assert.equal(stepAfter("nonsense"), null);
});

test("the nav menu lists every step in order and lands exactly on the tile clicked", () => {
  const items = [...shell.slice(shell.indexOf("const NAV_ITEMS")).matchAll(/\{ key: "(\w+)"/g)].map((m) => m[1]).slice(0, RAIL_STEPS.length);
  assert.deepEqual(items, RAIL_STEPS, "menu order == rail order (Placement is not Camera Angles)");
  // `jump: true` — Survey Navigation is the one place chronological order does not apply, and is
  // therefore exempt from the one-step-per-press lock that Next/Back now carry.
  assert.ok(shell.includes("goRail(it.key, { jump: true })"), "a tile navigates to its own key, as a jump");
});

test("a dock echo never skips a step", () => {
  // Background must not be bounced to Layout by a no-dock echo (clicking Background "did nothing")
  assert.equal(railFromEcho("background", null).step, "background");
  // a stale Setup-canvas echo (from the editor we just closed) while Background is requested is ignored
  assert.equal(railFromEcho("background", "cameras", "background", 1).step, "background");
  // ...and the arrival of the Background step (echo step 0) clears the request
  assert.equal(railFromEcho("background", null, "background", 0).pending, null);
  // the widget moved ITSELF to Setup (a background commit): the rail goes to Layout, never Placement, and asks once
  assert.deepEqual(railFromEcho("background", "cameras", null, 1), { step: "layout", reissue: true, pending: "layout-asked" });
  // Layout requested, editor not up: stay, re-ask ONCE; a second Setup echo means it cannot open -> follow the canvas
  assert.deepEqual(railFromEcho("layout", "cameras", "layout"), { step: "layout", reissue: true, pending: "layout-asked" });
  assert.deepEqual(railFromEcho("layout", "cameras", "layout-asked"), { step: "cameras", reissue: false, pending: null });
  // draw editor up -> Layout, request cleared; then Done (cameras dock) -> Placement
  const up = railFromEcho("layout", "draw", "layout");
  assert.deepEqual([up.step, up.pending], ["layout", null]);
  assert.equal(railFromEcho("layout", "cameras", up.pending).step, "cameras");
  // Placement stays Placement; Route/Views/Review are never yanked. Route matters most here: it draws
  // over the SAME Setup canvas, so the iframe echoes dock "cameras" the whole time Route is open and
  // without the guard that echo would drag the user back to Placement mid-run.
  assert.equal(railFromEcho("cameras", "cameras").step, "cameras");
  assert.equal(railFromEcho("route", "cameras").step, "route");
  assert.equal(railFromEcho("views", "cameras").step, "views");
  assert.equal(railFromEcho("review", "draw").step, "review");
  // the satellite editor is Background
  assert.equal(railFromEcho("background", "satellite").step, "background");
  for (const cur of RAIL_STEPS) assert.equal(railFromEcho(cur, null).step, cur, "no dock never moves the rail");
});

test("the shell trusts the iframe's hasPlan only once it has LOADED (and not failed)", () => {
  assert.ok(shell.includes("if (m.loaded && !m.loadFailed) setSynced(true);"));
  assert.ok(!/\n\s*setSynced\(true\);/.test(shell), "no unconditional setSynced");
});

test("a saved Background step resumes on Background, view-only; a floor switch on Background stays there", () => {
  assert.ok(!shell.includes('want === "background" ? "layout"'), "no Background -> Layout remap on resume");
  assert.ok(shell.includes("goRail(want, { view: true })"));
  assert.ok(widget.includes('if(m.focus==="view" && typeof m.step==="number"){ goStep(m.step); return; }'), "view focus shows the step, opens no editor");
  assert.ok(shell.includes('if (railRef.current === "background") { pendingRef.current = "background"; surveyCmd({ cmd: "step", step: 0, focus: "view" }); }'));
});

test("chronological: one press is one step, and nothing re-adopts behind the user", () => {
  // "I clicked Placement and it went to Route." The footer CTA re-labels itself in place the instant the
  // rail moves — Layout's "Placement" becomes Placement's "Route" at the same coordinates — so a second
  // activation during that re-render advances twice. A short lock makes one press mean one step.
  assert.match(shell, /if \(now - navLockT\.current < 450\) return;/, "Next/Back move one step per press");
  assert.match(shell, /const goRail = \(step, \{ view = false, jump = false \} = \{\}\) => \{/, "jumps are a distinct kind of move");
  assert.match(shell, /if \(!jump && !view\) \{/, "…and the lock applies only to Next/Back");
  // Survey Navigation and the Approval gap links jump freely — that is what they are for.
  assert.ok(shell.includes("goRail(it.key, { jump: true })"), "Survey Navigation is exempt");
  assert.ok(shell.includes("goRail(g.step, { jump: true })"), "the Approval gap links are exempt");
  // The resume must not re-apply the saved step over a step the user chose. A per-mount ref resets on
  // remount; this one is module-scope and keyed by project.
  assert.match(shell, /^const _navTouched = new Set\(\);$/m, "module-scope, so it survives a remount");
  assert.match(shell, /if \(sv == null \|\| stepAdopted\.current \|\| navTouched\.current \|\| _navTouched\.has\(accessId\)\) return;/,
    "the resume checks it");
  assert.ok(shell.includes("_navTouched.add(accessId);"), "and every navigation records it");
});

test("Layout does NOT gate Placement — a drawn floor can never be told to draw first", () => {
  // The gate used to hold Next behind "Draw the structure first" until the floor reported a structure.
  // Two signals feed that (the iframe's live echo and the saved floor) and when they disagree the user
  // is looking at their own outline while the button refuses to move. Gate on the earliest valid
  // signal and show state instead of blocking — the ✓ still reports whether a structure exists.
  assert.match(shell, /if \(railStep === "layout"\) return \{ ok: true, hint: "" \};/,
    "Layout's Next is unconditional");
  assert.ok(!shell.includes('hint: "Draw the structure first"'), "the blocking hint is gone");
  assert.ok(!/import \{[^}]*layoutNextOk/.test(shell), "and the gate helper is no longer imported");
  // The Layout step still TRACKS a structure — information, not a blocker.
  assert.ok(shell.includes("done: sig.hasPlan || surveySubmitted"), "the Layout tick still follows the floor");
});

test("floorHasStructure still answers 'is there a structure' for the tick and the widget mirror", () => {
  const empty = { plan: { cells: [], rooms: [] } };
  const drawn = { plan: { cells: ["0,0", "1,0"], rooms: [] } };
  assert.equal(floorHasStructure(null), false);
  assert.equal(floorHasStructure({}), false);
  assert.equal(floorHasStructure(empty), false, "an erased plan is not a structure");
  assert.equal(floorHasStructure(drawn), true);
  assert.equal(floorHasStructure({ plan: { cells: [], rooms: [{ label: "A", cells: ["0,0"] }] } }), true);
  assert.equal(floorHasStructure({ ctx: { src: "x" }, planSvg: "<svg/>", bgCtx: true }), true, "legacy hybrid floor with no plan object");
  const hyb = { ctx: { src: "x" }, planSvg: "<svg/>", bgCtx: true };
  assert.equal(floorHasStructure({ ...hyb, plan: { cells: [], rooms: [] } }), false, "hybrid floor erased to nothing: Next disables again");
  assert.equal(floorHasStructure({ ...hyb, plan: { cells: ["0,0"], rooms: [] } }), true);
  // before the iframe has reported, the SAVED floor decides
  assert.equal(layoutNextOk({ live: false, liveHasPlan: false, savedFloor: empty }), false);
  assert.equal(layoutNextOk({ live: false, liveHasPlan: false, savedFloor: drawn }), true);
  // after it has reported, its current signal wins both ways (drawn now / erased now)
  assert.equal(layoutNextOk({ live: true, liveHasPlan: true, savedFloor: empty }), true);
  assert.equal(layoutNextOk({ live: true, liveHasPlan: false, savedFloor: drawn }), false);
});

test("the widget's structure check is the same function, and a drawn plan re-emits to the host", () => {
  const src = widget.match(/function hybridCapable\(f\)\{[^\n]*\}\n[\s\S]*?(function floorHasStructure\(f\)\{[^\n]*\})/);
  assert.ok(src, "widget defines floorHasStructure");
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(src[0].replace(/^\s*\/\/.*$/gm, ""), ctx);
  const H = { ctx: { src: "x" }, planSvg: "s", bgCtx: true };
  const cases = [null, {}, { plan: { cells: [], rooms: [] } }, { plan: { cells: ["0,0"], rooms: [] } },
    { plan: { cells: [], rooms: [{}] } }, H, { plan: "junk" }, { plan: [] }, { plan: { cells: "x", rooms: [{}] } },
    { ...H, planSvg: null }, { ...H, bgCtx: false }, { ...H, ctx: { src: "" } }, { ...H, ctx: "str" }, { ...H, ctx: null },
    { ...H, plan: { cells: [], rooms: [] } }, { ...H, plan: { cells: ["0,0"], rooms: [] } }, { ...H, plan: [] }];
  for (const c of cases) assert.equal(ctx.floorHasStructure(c), floorHasStructure(c), JSON.stringify(c));
  assert.ok(widget.includes("hasPlan:floorHasStructure(lf)"), "the echo reports the real structure");
  assert.ok(/fl\.plan=m\.plan;[^\n]*emitSurveyStep\(\);/.test(widget), "saving a drawn plan tells the host at once");
});

test("Background from the editor-open state is not treated as an advance", () => {
  assert.ok(widget.includes('if(bgToolOpen==="satellite" && m.step===0){ emitSurveyStep(); return; }'), "Background with the bg editor open never commits it, and still reports (so the host's request clears)");
});

// Run the widget's REAL contextualEdit against stubs.
function runContextualEdit(floor, { frozenNow = false } = {}) {
  const src = widget.slice(widget.indexOf("function contextualEdit(step){"), widget.indexOf("function goStep(idx){"));
  const calls = [];
  const fnSrc = (n) => widget.match(new RegExp(`function ${n}\\([^)]*\\)\\{[^\\n]*\\}\\n`))[0];
  const ctx = {
    RO: false, frozen: () => frozenNow, bgToolOpen: null, bgHasImage: true, curFloor: 0, floors: [floor],
    layoutOpening: false, layoutOpeningT: null, setTimeout: () => 1, clearTimeout: () => {},
    enterDraw: () => calls.push("enterDraw"),
    document: { getElementById: (id) => ({ click: () => calls.push(id) }) },
    floorHasAerial: (f) => !!(f && (f.bgSource === "satellite" || f.aerial || (f.ctx && f.ctx.src))),
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc("hybridCapable") + fnSrc("floorHasStructure") + "function canBuild(f){ return !!(f && floorHasAerial(f) && !hybridCapable(f) && !frozen()); }" + src, ctx);
  return { calls, run: () => ctx.contextualEdit(1) };
}

test("Layout is never a dead end: every editable floor with a background opens the draw tool or the build", () => {
  const library = { bg: "/api/media/x", plan: { cells: [], rooms: [] } };   // empty plan, no aerial/ctx (the old no-op)
  let t = runContextualEdit(library); t.run();
  assert.deepEqual(t.calls, ["enterDraw"], "empty-plan library floor opens the editor");
  t = runContextualEdit({ bg: "/api/media/x" }); t.run();
  assert.deepEqual(t.calls, ["enterDraw"], "no plan at all, no aerial: editor over the floor image");
  t = runContextualEdit({ bg: "x", bgSource: "satellite" }); t.run();
  assert.deepEqual(t.calls, ["buildPlanBtn"], "aerial without a plan starts the build");
  t = runContextualEdit({ bg: "x", plan: { cells: ["0,0"], rooms: [] } }); t.run();
  assert.deepEqual(t.calls, ["enterDraw"]);
  t = runContextualEdit(library, { frozenNow: true }); t.run();
  assert.deepEqual(t.calls, [], "a submitted/locked survey opens nothing");
});

test("opening Layout repeatedly in one window starts ONE build (in-flight guard)", () => {
  const t = runContextualEdit({ bg: "x", bgSource: "satellite" });
  t.run(); t.run(); t.run();
  assert.deepEqual(t.calls, ["buildPlanBtn"], "the host re-ask and the widget's own timer cannot both build");
  assert.ok(/function openBgTool\(src, source\)\{\s*layoutOpening=false;/.test(widget), "the guard clears when the tool actually opens");
});

test("a Background request can never latch: Placement -> Edit background -> click Background -> aerial Back", () => {
  let cur = "cameras", pending = null;
  const echo = (dock, step) => { const r = railFromEcho(cur, dock, pending, step); cur = r.step; pending = r.pending; return r; };
  echo("satellite", 1);                       // Edit background on Placement: the rail follows the dock
  assert.equal(cur, "background");
  cur = "background"; pending = "background"; // click Background: goRail sets the request
  echo("satellite", 1);                       // the widget now REPORTS on the early return (dock satellite) -> request cleared
  assert.equal(pending, null, "the widget's report clears the request");
  const back = echo("cameras", 1);            // Back inside the aerial dock lands on the Setup canvas
  assert.equal(back.step, "layout", "no longer absorbed: the rail follows the widget (Layout, never a stuck Background over Placement)");
  assert.equal(back.reissue, true);
  assert.ok(widget.indexOf("emitSurveyStep(); return; }") > 0);
});
