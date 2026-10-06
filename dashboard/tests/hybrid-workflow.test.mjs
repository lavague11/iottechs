import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Phase H1 — "Create Hybrid Floor Plan": an ADDITIVE workflow verb on an aerial floor. It derives a NEW
// "<name> · Hybrid" floor off the current one via the EXISTING createFloor engine, then jumps into the
// satellite Level step on the derived floor. The source floor must never be mutated. The widget is static
// HTML (no imports), so the DOM/handler guards are source-reads; the deep-copy independence is proven by
// replicating createFloor's copy logic (the contract these source-reads lock in place).
const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
const has = (s, msg) => assert.ok(survey.includes(s), msg || `missing: ${s}`);

test("the Create Hybrid action exists as a single aerial-floor button (icon + the one deliberate longer label)", () => {
  has('<button id="hybridBtn"', "hybrid button element");
  has("Create Hybrid Floor Plan", "workflow label");
  // inline SVG icon, no emoji
  const i = survey.indexOf('<button id="hybridBtn"');
  const btn = survey.slice(i, survey.indexOf("</button>", i));
  assert.ok(btn.includes("<svg"), "icon is inline SVG");
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(btn), "no emoji in the label/icon");
  // read-only / submitted hide it via CSS too (belt-and-braces with canCreateHybrid's !frozen())
  has("body.ro #hybridBtn, body.frozen #hybridBtn{display:none!important}", "locked states hide the button");
});

test("gating: aerial floor AND not already hybrid-capable AND not frozen", () => {
  has("function floorHasAerial(f){ return !!(f && (f.bgSource===\"satellite\" || f.aerial || (f.ctx && f.ctx.src)));", "floorHasAerial reads the floor record");
  has("function canCreateHybrid(f){ return !!(f && floorHasAerial(f) && !hybridCapable(f) && !frozen()); }", "canCreateHybrid composes the three gates");
  // display tracks the live current floor + a real background
  has("b.style.display=(bgHasImage && canCreateHybrid(floors[curFloor])) ? \"inline-flex\" : \"none\"", "updateHybridBtn gates on bgHasImage + canCreateHybrid");
  // re-evaluated on step/floor change and on submit/unsubmit (frozen flips)
  has("updateHybridBtn();   // Phase H1: the aerial-floor workflow verb tracks the current floor + step", "goStep re-gates the button");
  const setStatus = survey.slice(survey.indexOf("function setStatus("), survey.indexOf("function setStatus(") + 900);
  assert.ok(setStatus.includes("updateHybridBtn()"), "setStatus re-gates on frozen change");
});

test("click reuses createFloor(src,true), renames to '<name> · Hybrid', and flushes", () => {
  const h = survey.slice(survey.indexOf('getElementById("hybridBtn").addEventListener'), survey.indexOf('getElementById("hybridBtn").addEventListener') + 1400);
  assert.ok(h.includes("if(frozen()) return;"), "guards frozen");
  assert.ok(h.includes("if(!canCreateHybrid(src)) return;"), "guards the gate again at click time");
  assert.ok(h.includes("snapFloor();"), "snaps the source's live edits onto its record before copying");
  assert.ok(h.includes("createFloor(src, true);"), "reuses the EXISTING createFloor engine with items");
  assert.ok(h.includes('nf.name=(src.name||"Floor")+" · Hybrid"'), "renames the derived floor to '· Hybrid' (custom name)");
  assert.ok(h.includes("renderFloorTabs(); flushNow();"), "re-renders the selector and persists the rename now");
  assert.ok(h.includes("enterBg(); postAerialRestore(true);"), "opens the satellite tool and restores the inherited leveled aerial");
  // the mandatory: it must NOT clone geometry by hand — createFloor owns the deep copy
  assert.ok(!/JSON\.parse\(JSON\.stringify/.test(h), "the handler must not hand-roll a second copy path");
});

test("createFloor records lineage and mints fresh ids (reused, not duplicated)", () => {
  has("derivedFromFloorId:(from&&from.id)?from.id:null", "createFloor sets derivedFromFloorId from the source id");
  has("devices:(from&&withItems)?cloneDevices(from.devices):[]", "createFloor carries items via cloneDevices (fresh cids)");
  has("flushNow();   // discrete action", "createFloor flushes on create");
});

// ---- deep-copy independence: replicate createFloor's copy logic and prove the source is untouched ----
// This mirrors the field-for-field copy in createFloor(from,true): every nested object is JSON-cloned, the
// derived floor gets a fresh id + name, derivedFromFloorId = source id, and devices are cloned with fresh cids.
function cloneDevices(devs, used) {
  const out = JSON.parse(JSON.stringify(devs || []));
  used = used || {};
  out.forEach((d) => { if (!d.cid) return; let id; do { id = "c" + Math.random().toString(36).slice(2, 9); } while (used[id]); used[id] = 1; d.cid = id; });
  return out;
}
function createFloorFrom(from, withItems, id) {
  return {
    id, name: "Floor N", bg: from ? from.bg : null, bgSource: from ? from.bgSource : null,
    scale: from && from.scale ? JSON.parse(JSON.stringify(from.scale)) : null,
    aerial: from && from.aerial ? JSON.parse(JSON.stringify(from.aerial)) : null,
    plan: from && from.plan ? JSON.parse(JSON.stringify(from.plan)) : null, outlineDraft: null,
    ctx: from && from.ctx ? JSON.parse(JSON.stringify(from.ctx)) : null,
    planSvg: from && typeof from.planSvg === "string" ? from.planSvg : null, bgCtx: !!(from && from.bgCtx),
    view: from && typeof from.view === "string" ? from.view : null,
    sides: from && from.sides ? JSON.parse(JSON.stringify(from.sides)) : null,
    boundary: from && from.boundary ? JSON.parse(JSON.stringify(from.boundary)) : null,
    zones: from && from.zones ? JSON.parse(JSON.stringify(from.zones)) : [],
    derivedFromFloorId: from && from.id ? from.id : null,
    devices: from && withItems ? cloneDevices(from.devices, {}) : [], started: !!(from && from.bg),
  };
}

test("derived hybrid floor is independent: mutating it never touches the source", () => {
  const source = {
    id: "f_src", name: "Property", bg: "data:image/jpeg;base64,AAAA", bgSource: "satellite", started: true,
    aerial: { northDeg: -12, rotationDeg: -12, center: { lat: 1, lng: 2 }, zoom: 20 },
    scale: { ftW: 120, ftH: 90 },
    ctx: { src: "data:image/jpeg;base64,BBBB", rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, ftW: 120, ftH: 90 },
    boundary: { pts: [[0, 0], [1, 0], [1, 1]] }, zones: [{ name: "Lot", pts: [[0, 0]] }],
    plan: null, planSvg: null, bgCtx: false, view: null, sides: { top: { label: "Front" } },
    devices: [{ k: "cam", x: 34, y: 49, aim: 150, cid: "cSRC01" }, { k: "cam", x: 47, y: 71, cid: "cSRC02" }],
  };
  const snapshot = JSON.parse(JSON.stringify(source));

  const nf = createFloorFrom(source, true, "f_hyb");
  nf.name = (source.name || "Floor") + " · Hybrid";

  // lineage + naming
  assert.equal(nf.derivedFromFloorId, source.id, "derivedFromFloorId = source id");
  assert.equal(nf.name, "Property · Hybrid", "named '<name> · Hybrid'");
  assert.notEqual(nf.id, source.id, "fresh floor id");

  // inherited aerial / ctx carried (enhanced-aerial inheritance rides on this copy)
  assert.deepEqual(nf.aerial, source.aerial, "inherits the leveled aerial");
  assert.ok(nf.ctx && nf.ctx.src === source.ctx.src, "inherits the aerial ctx (enhanced image carries here)");

  // fresh device cids, not shared
  assert.notEqual(nf.devices[0].cid, "cSRC01", "device cid is regenerated");
  assert.notEqual(nf.devices[1].cid, "cSRC02", "device cid is regenerated");

  // MUTATE the derived floor hard — plan built, aerial re-leveled, devices moved/added, boundary/zones/ctx edited
  nf.plan = { v: 1, cells: ["0,0", "1,0"], rooms: [{ name: "Garage" }], metersPerPx: 0.02 };
  nf.planSvg = "data:image/svg+xml;base64,Zm9v"; nf.bgCtx = true; nf.view = "hybrid";
  nf.aerial.northDeg = 90; nf.aerial.center.lat = 999;
  nf.ctx.rect.x = 0.5; nf.ctx.ftW = 1;
  nf.boundary.pts.push([9, 9]); nf.zones.push({ name: "Hybrid zone" }); nf.sides.top.label = "Rear";
  nf.devices[0].x = 1; nf.devices.push({ k: "spk", x: 5, y: 5, cid: "cNEW" });

  // the source is byte-for-byte what it was before deriving
  assert.deepEqual(source, snapshot, "source floor is completely unmutated after editing the derived floor");
});

test("hybridCapable still requires ctx.src + planSvg + bgCtx (unchanged — the derived floor reaches it via the same ctx flow)", () => {
  has("function hybridCapable(f){ return !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx); }", "hybridCapable contract unchanged");
  // a freshly derived aerial floor (ctx inherited, but no planSvg/bgCtx yet) is NOT hybrid-capable → the button shows there
  const capable = (f) => !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx);
  assert.equal(capable({ ctx: { src: "x" } }), false, "aerial-only (no Structure) is not hybrid-capable");
  assert.equal(capable({ ctx: { src: "x" }, planSvg: "y", bgCtx: true }), true, "a built Structure plan is hybrid-capable");
});
