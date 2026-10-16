import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Phase 1 persistence contract: floor geometry is keyed by a stable floor id and travels survey <-> draw tool
// over postMessage. Both widgets are static HTML (no imports), so these are source-reading guards.
const draw = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

const has = (src, s, msg) => assert.ok(src.includes(s), msg || `missing: ${s}`);

test("draw tool reads the floor id and starts in a loading state", () => {
  // guards: draw tool drawing before the host plan arrives (clobbering it) or losing the fid
  has(draw, 'FID=_qs.get("fid")||""');
  has(draw, 'var planState="loading"');
});

test("both widgets speak the same three plan messages", () => {
  // guards: message-type drift between the survey host and the draw tool
  for (const t of ["iotPlanReady", "iotPlanLoad", "iotPlanSave"]) {
    has(draw, `"${t}"`, `draw tool missing "${t}"`);
    has(survey, `"${t}"`, `survey missing "${t}"`);
  }
});

test("draw tool recovery copy is keyed by floor id, and plan loads are matched by fid", () => {
  // guards: geometry keyed by array index (breaks on floor reorder/delete) and plan loads landing on the wrong floor
  has(draw, '"iot_struct_"+PID+"_"+FID');
  has(draw, "m.fid!==FID");
  has(draw, "function initWithPlan(");
  has(draw, "function flushPlan(");
});

test("survey carries floor id + plan through restore() and backfills ids", () => {
  // guards: restore() dropping id/plan, or old saves staying id-less
  has(survey, "id:f.id||null");
  has(survey, "plan:f.plan||null");
  const i = survey.indexOf("id:f.id||null");
  assert.ok(survey.slice(i).includes("ensureFloorIds();"), "ensureFloorIds(); must run after the restore map");
  has(survey, "function newFloorId(");
  has(survey, "function ensureFloorIds(");
  has(survey, "id:newFloorId()", "createFloor must mint an id");
});

test('survey opens the draw tool with &fid= and answers iotPlanReady with the floor\'s plan', () => {
  // guards: draw tool opened without a floor id / host never replying with the plan
  has(survey, '"&fid="');
  has(survey, 'satFrame.contentWindow.postMessage({type:"iotPlanLoad"');
});

test("iotPlanSave is stored on the floor matched by id and queued for save", () => {
  // guards: saves landing on curFloor (wrong floor) or never reaching the server
  const start = survey.indexOf('m.type!=="iotPlanReady"');
  assert.ok(start > -1, "plan message listener not found");
  const end = survey.indexOf("});", start);
  const handler = survey.slice(start, end + 3);
  assert.ok(handler.includes(".id==="), "handler must match the floor by .id===");
  assert.ok(handler.includes("queueSave()"), "handler must call queueSave()");
  assert.ok(handler.includes("fl.plan=m.plan"), "handler must store the plan on the matched floor");
  assert.ok(!handler.includes("floors[curFloor].plan"), "plan is stored on the id-matched floor, never floors[curFloor]");
  // curFloor may appear ONLY in a display-refresh guard (if(fl===floors[curFloor]) → re-render) — never to choose the storage target
  assert.ok(!/curFloor/.test(handler) || /fl===floors\[curFloor\]/.test(handler), "curFloor only gates the live refresh, not the store");
});

test("floor id rule: f_ + 8 base-36 chars, backfill only when missing, no collisions", () => {
  // guards: the id rule (mirrors newFloorId/ensureFloorIds in the survey widget) silently changing shape
  const gen = (floors) => { let id; do { id = "f_" + Math.random().toString(36).slice(2, 10); } while (floors.some((f) => f && f.id === id)); return id; };
  const ensure = (floors) => floors.forEach((f) => { if (f && !f.id) f.id = gen(floors); });

  assert.match(gen([]), /^f_[a-z0-9]{8}$/);

  const floors = [{ id: "keep_me" }, { id: null }, {}];
  ensure(floors);
  assert.equal(floors[0].id, "keep_me");
  assert.match(floors[1].id, /^f_[a-z0-9]{8}$/);
  assert.match(floors[2].id, /^f_[a-z0-9]{8}$/);

  const many = [];
  for (let i = 0; i < 1000; i++) many.push({ id: null });
  ensure(many);
  assert.equal(new Set(many.map((f) => f.id)).size, 1000);
});

test("approval fingerprint: Structure changes it, bookkeeping (id/aerial/legacyIdx/outlineDraft/ctx) never does", async () => {
  const { toolFingerprint } = await import("../lib/tool-data.js");
  const base = { floors: [{ id: "f_a", name: "Floor 1", bg: "data:image/png;base64,AAAA", started: true, devices: [{ k: "cam", x: 10, y: 20, aim: 0, fov: 90, range: 40 }],
    plan: { v: 1, cells: ["0,0", "1,0"], rooms: [], metersPerPx: 0.02 } }] };
  const fp = (d) => toolFingerprint("survey2", JSON.stringify(d));
  const vary = (patch) => fp({ floors: [{ ...base.floors[0], ...patch }] });
  assert.equal(vary({}), fp(base));
  assert.equal(vary({ id: "f_zzz", legacyIdx: 3 }), fp(base), "id/legacyIdx are bookkeeping");
  assert.equal(vary({ aerial: { northDeg: -13, rotationDeg: -13 } }), fp(base), "capture transform is bookkeeping");
  assert.equal(vary({ outlineDraft: { pts: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], closed: false } }), fp(base), "an unfinished outline is view-state");
  assert.equal(vary({ ctx: { src: "data:image/jpeg;base64,BBBB", rect: { x: 0, y: 0, w: 1, h: 1 } } }), fp(base), "context crop is derived from the capture");
  assert.notEqual(vary({ plan: { ...base.floors[0].plan, cells: ["0,0", "1,0", "2,0"] } }), fp(base), "Structure IS meaning");
});

test("the #bgWiz Back strip is retired — BOTH tools carry Back in their own dock", () => {
  // The redundant slim "‹ Background" strip is gone for both the SATELLITE/Aerial tool and the Structure
  // (draw) tool: each carries Back in its own dock (satellite #tBack / draw #tBack → iotCaptureCancel), the
  // host answers iotCaptureCancel → exitBg(false), clearing bgToolOpen so a refresh stays out. One dock, never
  // two stacked rows.
  const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
  const sat = readFileSync(new URL("../public/widgets/satellite-capture.html", import.meta.url), "utf8");
  const open = survey.slice(survey.indexOf("function openBgTool("), survey.indexOf("function enterBg("));
  assert.ok(open.includes('bgWiz.style.display="none";'), "the Back strip is hidden for every tool");
  assert.ok(!/source==="draw" \? "none" : "";/.test(open), "no per-tool strip toggle remains (strip fully retired)");
  const exit = survey.slice(survey.indexOf("function exitBg("), survey.indexOf("function exitBg(") + 600);
  assert.ok(exit.includes('bgWiz.style.display="none";'), "exitBg keeps the Back strip hidden");
  // the satellite tool owns a Back control in its dock that cancels back to the floor
  assert.ok(sat.includes('id="tBack"'), "satellite tool has a dock Back button");
  assert.ok(/\$\("tBack"\)\.addEventListener\("click", function\(\)\{ try\{ parent\.postMessage\(\{type:"iotCaptureCancel"\}/.test(sat), "satellite Back posts iotCaptureCancel");
  // the host answers iotCaptureCancel → exitBg(false) (covers both the satellite dock Back and the outline cancel)
  assert.ok(/ev\.data\.type!=="iotCaptureCancel"[^]*?exitBg\(false\)/.test(survey), "host: iotCaptureCancel → exitBg(false)");
});

test("derived floors record lineage (derivedFromFloorId) and discrete actions flush to the server now", () => {
  const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
  // Lineage: both createFloor(from) and duplicateFloor set derivedFromFloorId to the source id (bookkeeping — carried by the restore spread, off the fingerprint).
  assert.ok(survey.includes("derivedFromFloorId:(from&&from.id)?from.id:null"), "createFloor records lineage");
  assert.ok(survey.includes("derivedFromFloorId:src.id||null"), "duplicateFloor records lineage");
  // Immediate server flush for discrete actions (not just the 5s poll). flushNow now pushes the FRESH
  // in-memory serialization (never a re-read of localStorage, which could be stale after a quota failure).
  assert.ok(/function flushNow\(\)\{ var json;/.test(survey), "flushNow serializes the fresh survey");
  assert.ok(survey.includes("pushServer(json);"), "flushNow pushes the fresh blob to the server");
  assert.ok(survey.includes('tool:"survey2",data:json'), "the server push carries the survey2 blob");
  // Done/background set: snapshot the floor, then upload the committed bg to a URL (records the version
  // + swaps the active bg to the URL so the saved blob never holds a multi-MB inline image), flush now.
  const fin = survey.slice(survey.indexOf("function finishBackground"), survey.indexOf("function saveToLibrary"));
  assert.ok(fin.includes("snapFloor();"), "Done snapshots the floor");
  assert.ok(fin.includes("uploadBackground(_bg, function(url)") && fin.includes("_cf.bg=url"), "Done uploads the committed bg to /api/media");
  assert.ok(fin.includes('recordBgVersion(_cf, url, "enhanced")'), "Done records the bg version from the uploaded URL");
  assert.ok(fin.includes("flushNow(); renderFloorTabs();"), "Done flushes to the server now");
});
