// Phase 1 floor-lifecycle + aerial-transform contract for the merged Site Survey widget.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");

// Slice from a marker to the next marker (or end) so assertions stay inside one function.
function region(start, end) {
  const a = html.indexOf(start);
  assert.ok(a >= 0, `missing: ${start}`);
  const b = end ? html.indexOf(end, a + start.length) : -1;
  return html.slice(a, b > a ? b : undefined);
}

// Guards: Duplicate vanishing from the floor menu, or inserting at the end / losing the "Copy of" name.
test("Duplicate exists in the floor menu and inserts right after the source with a 'Copy of' name", () => {
  assert.ok(html.includes('textContent="Duplicate"'), "floor sheet needs a Duplicate button");
  const dup = region("function duplicateFloor(", "function addFloor(");
  assert.ok(dup.includes('"Copy of "'), "duplicate names the copy 'Copy of …'");
  assert.ok(dup.includes("splice(i+1,0,"), "duplicate inserts right after the source");
});

// Guards: cloned devices reusing source cids (proposal line items key on them), and new floors dropping scale/aerial/plan.
test("createFloor and duplicateFloor share cloneDevices (fresh cids) and deep-copy scale/aerial/plan", () => {
  assert.ok(html.includes("function cloneDevices("), "cloneDevices helper exists");
  const create = region("function createFloor(", "function duplicateFloor(");
  const dup = region("function duplicateFloor(", "function addFloor(");
  assert.ok(create.includes("cloneDevices("), "createFloor clones via cloneDevices");
  assert.ok(dup.includes("cloneDevices("), "duplicateFloor clones via cloneDevices");
  for (const k of ["scale", "aerial"]) {   // background metadata always travels with the aerial
    assert.ok(create.includes(`${k}:(from&&from.${k})?JSON.parse(JSON.stringify(`), `createFloor deep-copies ${k}`);
  }
  assert.ok(create.includes("plan:(wp&&from.plan)?JSON.parse(JSON.stringify("), "the drawn plan deep-copies only when carrying the plan");
  assert.ok(html.includes("scale:(from&&from.scale)") && html.includes("aerial:(from&&from.aerial)"));
});

// Three carry levels: Background only (just the aerial), Background + floor plan, Background + items.
test("start-from levels: only the plan-carrying levels keep the drawn plan; items land on Setup", () => {
  assert.ok(html.includes("goStep((f.started && wp) ? 1 : 0)"), "plan carried → Setup; background-only / blank → Background tab");
  const create = region("function createFloor(", "function duplicateFloor(");
  assert.ok(create.includes("var wp=!!(from && (withPlan || withItems))"), "items imply the plan; background-only carries neither");
  for (const k of ["plan", "boundary", "zones", "sides"]) {   // the drawn plan + its regions are gated on wp
    assert.ok(create.includes(`${k}:(wp&&from.${k})`), `${k} is carried only when carrying the plan`);
  }
  assert.ok(create.includes("devices:(from&&withItems)?cloneDevices(from.devices):[]"), "devices only on +items");
  // the sheet offers the middle option between +items and background-only
  assert.ok(html.includes('id="flBgPlan"') && html.includes("Background + floor plan"), "a Background + floor plan option exists");
  assert.ok(html.includes('pickFloor("bgplan")') && html.includes('createFloor(mode==="none"?null:prev, mode==="bgplan"||mode==="bgitems", mode==="bgitems")'), "bgplan carries the plan without devices");
});

// Guards: the capture transform being dropped anywhere between the satellite result and a reload.
test("the capture transform is carried through applyBackground → finishBackground → snap/load/restore", () => {
  assert.ok(html.includes("function applyBackground(dataUrl, skipSave, vector, scale, aerial)"), "applyBackground takes aerial");
  assert.ok(html.includes("curFloorAerial=pendingBgAerial"), "finishBackground adopts pendingBgAerial");
  assert.ok(html.includes("f.aerial=curFloorAerial"), "snapFloor stores aerial");
  assert.ok(html.includes("curFloorAerial=f.aerial"), "loadFloor restores aerial");
  assert.ok(html.includes("aerial:f.aerial||null"), "restore() keeps aerial");
});

// Guards: Use Outline (Trace Building) losing the transform, so Edit background can't re-level later.
test("Use Outline stores the capture transform on the floor", () => {
  const h = region('ev.data.type!=="satellite-capture-result"', "applyBackground(ev.data.dataUrl");
  assert.ok(h.includes("floors[curFloor].aerial="), "outline branch must set floors[curFloor].aerial");
});

// Guards: Edit background reopening the satellite tool north-up instead of as it was captured.
test("Edit background re-levels the satellite via iotAerialRestore", () => {
  assert.ok(html.includes('{type:"iotAerialRestore"'), "survey must post iotAerialRestore to the bg-tool iframe");
});

// Guards: a duplicated/imported floor sharing references or cids with its source (edits bleeding across floors).
test("clone is independent: deep-equal except cids, fresh unique cids, null cid stays null", () => {
  const floors = [
    { devices: [{ cid: "ca1", name: "Front", cells: [1, 2], kind: "cam" }, { cid: null, name: "Pole" }] },
    { devices: [{ cid: "cb1", name: "Back" }] },
  ];
  const src = { scale: { ftW: 40, ftH: 30 }, devices: floors[0].devices };
  const cloneDevices = (devs) => {
    const out = JSON.parse(JSON.stringify(devs || []));
    const used = new Set();
    floors.forEach((f) => f.devices.forEach((d) => d.cid && used.add(d.cid)));
    out.forEach((d) => {
      if (!d.cid) return;
      let id;
      do { id = "c" + Math.random().toString(36).slice(2, 9); } while (used.has(id));
      used.add(id);
      d.cid = id;
    });
    return out;
  };
  const before = JSON.stringify(src);
  const clone = { scale: JSON.parse(JSON.stringify(src.scale)), devices: cloneDevices(src.devices) };

  const strip = (devs) => devs.map(({ cid, ...r }) => r);
  assert.deepEqual(strip(clone.devices), strip(src.devices), "equal apart from cids");
  assert.equal(clone.devices[1].cid, null, "null cid stays null");

  const all = new Set(floors.flatMap((f) => f.devices.map((d) => d.cid)).filter(Boolean));
  assert.notEqual(clone.devices[0].cid, "ca1");
  assert.ok(!all.has(clone.devices[0].cid), "fresh cid not used on any floor");
  const two = cloneDevices(src.devices);
  floors.push({ devices: clone.devices });
  const three = cloneDevices(src.devices);
  assert.notEqual(two[0].cid, three[0].cid, "later clones stay unique across floors");
  assert.notEqual(clone.devices[0].cid, three[0].cid);

  clone.devices[0].cells.push(99);
  clone.devices[0].name = "Changed";
  clone.scale.ftW = 1;
  assert.equal(JSON.stringify(src), before, "mutating the clone leaves the source untouched");
});
