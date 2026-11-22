// A RELOAD MUST NOT CHANGE THE SURVEY. Load → save → reload, three times, and the devices, names,
// ids, kinds and structure have to come back identical.
//
// Two real defects this pins, both found while investigating ASC0055:
//   · `tag` (IC7, IC8 …) was not persisted. reAdd re-minted it every load from a count of same-group
//     devices on EARLIER floors, so eight cameras saved as IC7–IC14 reopened as IC43–IC52 the moment
//     an earlier floor changed. Nothing was lost — but the id a human points at moved under them.
//   · reAdd RETURNED on an unrecognised kind, dropping the device from the live array. The next save
//     serialises that array, so a device dropped on load was deleted on the next write.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const survey = readFileSync(new URL("../public/widgets/site-survey-merged.html", import.meta.url), "utf8");
function extractFn(name) {
  const start = survey.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing " + name);
  let i = survey.indexOf("{", survey.indexOf(")", start)), depth = 0, q = null;
  for (let j = i; j < survey.length; j++) { const c = survey[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{") depth++; else if (c === "}" && --depth === 0) return survey.slice(start, j + 1); }
  throw new Error("unbalanced " + name);
}
const GROUPS_SRC = survey.slice(survey.indexOf("var GROUPS="), survey.indexOf("function iconOf("));

// The load half of loadFloor (rebuild the live array from a floor) and the save half (stripDevs),
// executed for real — no DOM, so the parts that touch the canvas are stubbed.
function harness(floors, curFloor) {
  return new Function("S", `
    ${GROUPS_SRC}
    var floors=S.floors, curFloor=S.curFloor, devices=[], devSeq=0, RANGE=40;
    function mountDevice(){}
    ${extractFn("floorsBefore")}
    ${extractFn("reAdd")}
    ${extractFn("stripDevs")}
    function loadFloorDevices(i){ curFloor=i; devices=[]; devSeq=0; (floors[i].devices||[]).forEach(reAdd); }
    return { load:loadFloorDevices, save:stripDevs, live:function(){ return devices; } };
  `)({ floors, curFloor });
}

const dev = (k, name, cid, tag) => ({ k, x: 10, y: 10, aim: 0, aimed: false, fov: 30, range: 40,
  name, tag, locName: "", placementType: "", locSeq: 0, locKey: "", photo: null, photoName: null, cid, placed: true });

test("load → save → reload ×3 returns an IDENTICAL survey", () => {
  const floors = [
    { name: "Floor 1", devices: [dev("cam", "Camera 1", "a1"), dev("cam", "Camera 2", "a2"), dev("nvr", "NVR 1", null), dev("spk", "Speaker 1", null)] },
    { name: "Floor 2", devices: [
      dev("cam", "Camera 7", "b1"), dev("cam", "Camera 8", "b2"), dev("cam", "Camera 9", "b3"), dev("cam", "Camera 10", "b4"),
      dev("cam", "Camera 11", "b5"), dev("cam", "Camera 12", "b6"), dev("cam", "Camera 13", "b7"), dev("cam", "Cash", "b8")] },
  ];
  const api = harness(floors, 1);
  const passes = [];
  for (let i = 0; i < 4; i++) {
    api.load(1);
    const saved = api.save();
    floors[1].devices = saved;              // what the next load would read
    passes.push(JSON.stringify(saved));
  }
  assert.equal(new Set(passes).size, 1, "every reload produced the same bytes");
  const back = JSON.parse(passes[3]);
  assert.equal(back.length, 8, "all eight devices survived three reloads");
  assert.deepEqual(back.map((d) => d.name), ["Camera 7", "Camera 8", "Camera 9", "Camera 10", "Camera 11", "Camera 12", "Camera 13", "Cash"]);
  assert.deepEqual(back.map((d) => d.k), Array(8).fill("cam"), "no kind drifted to nvr or anything else");
  assert.deepEqual(back.map((d) => d.cid), ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
});

test("the IC number is PERSISTED, so it survives a change on an earlier floor", () => {
  const floors = [
    { name: "Floor 1", devices: [dev("cam", "Camera 1", "a1"), dev("cam", "Camera 2", "a2")] },
    { name: "Floor 2", devices: [dev("cam", "Camera 7", "b1"), dev("cam", "Camera 8", "b2")] },
  ];
  const api = harness(floors, 1);
  api.load(1);
  floors[1].devices = api.save();
  const tags = floors[1].devices.map((d) => d.tag);
  assert.ok(tags.every((t) => /^IC\d+$/.test(t)), `tags were minted and stored: ${tags}`);

  // Now a batch of cameras appears on Floor 1 — the exact thing that used to renumber Floor 2.
  for (let i = 0; i < 36; i++) floors[0].devices.push(dev("cam", "Extra " + i, "x" + i));
  api.load(1);
  const after = api.save().map((d) => d.tag);
  assert.deepEqual(after, tags, "Floor 2's ids did not move when Floor 1 grew by 36 devices");
});

test("a device with an unrecognised kind is KEPT, not silently deleted on load", () => {
  const floors = [{ name: "Floor 1", devices: [
    dev("cam", "Camera 1", "a1"),
    dev("doorbell", "Doorbell", "a2"),        // a kind this build does not know
    dev("cam", "Camera 2", "a3")] }];
  const api = harness(floors, 0);
  api.load(0);
  const saved = api.save();
  assert.equal(saved.length, 3, "the unknown kind did not vanish");
  assert.equal(saved[1].k, "doorbell", "and it kept its own kind rather than being rewritten");
  assert.equal(saved[1].name, "Doorbell", "and its name");
  // …and it still survives the next round trip, so it cannot be deleted by a later save.
  floors[0].devices = saved;
  api.load(0);
  assert.equal(api.save().length, 3);
});

test("persisting the tag does not reach the approval fingerprint", () => {
  const td = readFileSync(new URL("../lib/tool-data.js", import.meta.url), "utf8");
  const meaning = td.slice(td.indexOf("function survey2Meaning"), td.indexOf("export function survey2HasData"));
  assert.ok(!/tag/.test(meaning), "survey2Meaning does not read tag");
  assert.match(meaning, /devices: \(f\?\.devices \|\| \[\]\)\.map\(v => \(\{ k: v\.k, x: [^}]*n: v\.name \|\| "" \}\)\)/,
    "the hashed device fields are still exactly k/x/y/aim/fov/range/name");
});

test("a duplicated floor re-mints its ids instead of carrying them over", () => {
  const clone = extractFn("cloneDevices");
  assert.ok(/delete d\.tag/.test(clone), "the copy drops the tag so it gets its own");
});
