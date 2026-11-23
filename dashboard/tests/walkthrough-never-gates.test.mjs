// The install checklist NEVER BLOCKS AN INSTALL.
//
// That is the owner's first rule for this feature, and a rule stated only in prose erodes. This file
// is the mechanical guarantee: it reads the real gate functions out of lib/db.js and fails if any of
// them so much as mentions the `walkthrough` key. If someone wires the checklist into a gate two
// months from now — even "just for a badge" — this goes red and names the function.
//
// The second half runs the model for real: progress, merging, sign-off and the photo rule.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WALKTHROUGH_STEPS, STEP_KEYS, stepByKey, LOADOUT, MATERIALS, materialQty,
  blankWalkthrough, itemId, fieldId, mergeWalkthrough, isTicked, allItemIds,
  walkthroughProgress, stepProgress, signOff, signedBy, isPhotoRef, rejectsInlineImage,
} from "../lib/walkthrough.js";

const db = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");

// Brace-extract a top-level function body from lib/db.js.
function fnBody(name) {
  const start = db.search(new RegExp("(export\\s+)?(async\\s+)?function\\s+" + name + "\\s*\\("));
  assert.ok(start >= 0, "lib/db.js is missing " + name + "()");
  let i = db.indexOf("{", db.indexOf(")", start)), depth = 0, q = null;
  for (let j = i; j < db.length; j++) {
    const c = db[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{") depth++; else if (c === "}" && --depth === 0) return db.slice(start, j + 1);
  }
  throw new Error("unbalanced " + name);
}

// ---------------------------------------------------------------- the rule

const GATES = [
  "phaseGate", "buildStageFacts", "surveyStageSatisfied", "installProgress",
  "qcProgress", "getToolMeta", "qcSignoffFacts", "getStageAcceptances",
];

test("NO GATE READS THE CHECKLIST — it can never block an install", () => {
  const offenders = [];
  for (const name of GATES) {
    let body;
    try { body = fnBody(name); } catch { continue; }   // a gate that no longer exists cannot read it
    if (/\bwalkthrough\b/i.test(body)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `these gate functions now read the checklist, which means it can block an install:\n  ${offenders.join("\n  ")}`);
});

test("the key is registered as a tool, so it can be saved at all", () => {
  const line = db.slice(db.indexOf("export const TOOL_KEYS"), db.indexOf("export const TOOL_KEYS") + 300);
  assert.ok(/"walkthrough"/.test(line), "walkthrough is a TOOL_KEY");
  // …and it is NOT on the REST sync route, which is restricted to the geometry/photo blobs.
  const route = readFileSync(new URL("../app/api/tool-data/route.js", import.meta.url), "utf8");
  const sync = route.slice(route.indexOf("const SYNC_TOOLS"), route.indexOf("const SYNC_TOOLS") + 200);
  assert.ok(!/walkthrough/.test(sync), "the checklist goes through the server actions, not the sync route");
});

test("the checklist does not reach the survey fingerprint", () => {
  const td = readFileSync(new URL("../lib/tool-data.js", import.meta.url), "utf8");
  const meaning = td.slice(td.indexOf("function survey2Meaning"), td.indexOf("function survey2Meaning") + 1800);
  assert.ok(!/walkthrough/.test(meaning), "survey2Meaning never sees it, so no signature can move");
});

// ---------------------------------------------------------------- the nine steps

test("the nine steps match the field document, in order", () => {
  assert.equal(WALKTHROUGH_STEPS.length, 9);
  assert.deepEqual(WALKTHROUGH_STEPS.map((s) => s.num), ["01","02","03","04","05","06","07","08","09"]);
  assert.deepEqual(STEP_KEYS, ["survey","nvr","drill","pull","terminate","manage","mount","inspect","closeout"]);
  for (const s of WALKTHROUGH_STEPS) {
    assert.ok(s.title && s.lookFor && s.does.length && s.items.length, `${s.key} is complete`);
    const keys = s.items.map((i) => i.key);
    assert.equal(new Set(keys).size, keys.length, `${s.key} item keys are unique`);
  }
  assert.equal(stepByKey("mount").perDevice, "cam", "step 07 repeats per camera");
  assert.equal(stepByKey("nope"), null);
});

test("item ids are addressable, and per-camera items carry the camera", () => {
  assert.equal(itemId("survey", "oriented"), "survey.oriented");
  assert.equal(itemId("mount", "live", "cabc"), "mount.live#cabc");
  assert.equal(fieldId("survey", "hazards"), "survey.hazards");
});

// ---------------------------------------------------------------- progress

const CAMS = [{ cid: "c1", name: "Camera 1" }, { cid: "c2", name: "Camera 2" }];

test("progress counts the per-camera step once per camera", () => {
  const fixed = WALKTHROUGH_STEPS.filter((s) => !s.perDevice).reduce((n, s) => n + s.items.length, 0);
  const perCam = stepByKey("mount").items.length;
  assert.equal(allItemIds(CAMS).length, fixed + perCam * CAMS.length);
  assert.equal(allItemIds([]).length, fixed, "no cameras → the mount step contributes nothing");

  let doc = blankWalkthrough();
  assert.deepEqual(walkthroughProgress(doc, CAMS), { done: 0, total: fixed + perCam * 2, pct: 0 });
  doc.items[itemId("survey", "oriented")] = { done: true, at: "2026-11-23T10:00:00Z" };
  assert.equal(walkthroughProgress(doc, CAMS).done, 1);
  assert.equal(stepProgress(doc, "survey", CAMS).done, 1);
  assert.equal(stepProgress(doc, "nvr", CAMS).done, 0, "progress is per step");
  assert.equal(stepProgress(doc, "mount", CAMS).total, perCam * 2);
});

// ---------------------------------------------------------------- merging (decision 1)

test("TWO TECHNICIANS TICK AT ONCE — both land, neither is refused", () => {
  const base = blankWalkthrough({ createdBy: "pm", at: "2026-11-23T09:00:00Z" });
  // Each loaded the same document and ticked a different thing.
  const a = { ...base, items: { ...base.items, [itemId("drill", "utilities")]: { done: true, by: "tech-a", at: "2026-11-23T10:00:00Z" } } };
  const b = { ...base, items: { ...base.items, [itemId("pull", "slack")]: { done: true, by: "tech-b", at: "2026-11-23T10:00:01Z" } } };

  const merged = mergeWalkthrough(a, b);
  assert.ok(isTicked(merged, itemId("drill", "utilities")), "tech A kept their tick");
  assert.ok(isTicked(merged, itemId("pull", "slack")), "tech B kept theirs");
  // Order must not matter, or the result depends on who saved first.
  const other = mergeWalkthrough(b, a);
  assert.deepEqual(other.items, merged.items, "the merge is the same both ways round");
});

test("the same item ticked twice resolves to the later one, not to a refusal", () => {
  const id = itemId("inspect", "replay");
  const a = { ...blankWalkthrough(), items: { [id]: { done: true, by: "tech-a", at: "2026-11-23T10:00:00Z" } } };
  const b = { ...blankWalkthrough(), items: { [id]: { done: false, by: "tech-b", at: "2026-11-23T10:05:00Z" } } };
  assert.equal(mergeWalkthrough(a, b).items[id].by, "tech-b", "the later write wins");
  assert.equal(mergeWalkthrough(b, a).items[id].by, "tech-b", "…whichever side it arrives on");
});

test("load-out columns merge per column, so Packed and Back do not fight", () => {
  const a = { ...blankWalkthrough(), loadout: { "Fish tape": { packed: { v: true, by: "a", at: "2026-11-23T08:00:00Z" } } } };
  const b = { ...blankWalkthrough(), loadout: { "Fish tape": { back: { v: true, by: "b", at: "2026-11-23T17:00:00Z" } } } };
  const m = mergeWalkthrough(a, b);
  assert.equal(m.loadout["Fish tape"].packed.v, true, "packed survived");
  assert.equal(m.loadout["Fish tape"].back.v, true, "and back landed beside it");
});

test("a merge never loses a field, and an empty side changes nothing", () => {
  const doc = { ...blankWalkthrough(), fields: { [fieldId("survey", "hazards")]: { text: "low roof", at: "2026-11-23T10:00:00Z" } } };
  assert.deepEqual(mergeWalkthrough(doc, null), doc);
  assert.deepEqual(mergeWalkthrough(null, doc), doc);
  assert.equal(mergeWalkthrough(doc, blankWalkthrough()).fields[fieldId("survey", "hazards")].text, "low roof");
});

// ---------------------------------------------------------------- sign-off (decision 2)

test("one shared checklist, one sign-off line per technician", () => {
  let doc = blankWalkthrough();
  doc = signOff(doc, { techId: 7, name: "Ari", at: "2026-11-23T17:00:00Z" });
  doc = signOff(doc, { techId: 9, name: "Sam", at: "2026-11-23T17:02:00Z" });
  assert.deepEqual(signedBy(doc).map((s) => s.name).sort(), ["Ari", "Sam"]);
  // Signing again does not overwrite the first, and a merge never erases somebody's signature.
  const again = signOff(doc, { techId: 7, name: "Someone else", at: "2026-11-23T18:00:00Z" });
  assert.equal(again.signoffs["7"].name, "Ari", "a sign-off stands once given");
  const other = signOff(blankWalkthrough(), { techId: 9, name: "Sam", at: "2026-11-23T17:02:00Z" });
  assert.deepEqual(Object.keys(mergeWalkthrough(doc, other).signoffs).sort(), ["7", "9"]);
});

// ---------------------------------------------------------------- always editable (decision 3)

test("nothing in the model depends on the survey being unlocked", () => {
  const src = readFileSync(new URL("../lib/walkthrough.js", import.meta.url), "utf8");
  // Strip comments: the rule is explained in prose at the top, which must not trip the check.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const token of ["frozen", "submitted", "acceptance", "stage_acceptances", "signed_fingerprint"]) {
    assert.ok(!new RegExp(token, "i").test(code), `the model never reads ${token} — it stays editable after the survey locks`);
  }
});

// ---------------------------------------------------------------- photos (decision 4)

test("a photo item holds a LINK, never image bytes", () => {
  assert.ok(isPhotoRef({ mediaId: "m_123" }));
  assert.ok(isPhotoRef({ cid: "cabc" }));
  assert.ok(!isPhotoRef({}));
  assert.ok(!isPhotoRef("data:image/jpeg;base64,AAAA"));
  assert.ok(rejectsInlineImage({ photo: "data:image/jpeg;base64,AAAA" }), "an inline image is refused");
  assert.ok(rejectsInlineImage("data:image/png;base64,iVBORw0KGgo="), "…in any shape");
  assert.ok(!rejectsInlineImage({ mediaId: "m_123" }), "a reference is fine");
});

// ---------------------------------------------------------------- load-out and materials

test("the load-out and materials match the field document, row for row", () => {
  // Counted FROM docs/camera-install-walkthrough.md rather than hard-coded, so the model cannot
  // drift away from the document the technician is actually holding.
  const doc = readFileSync(new URL("../docs/camera-install-walkthrough.md", import.meta.url), "utf8");
  const rows = (block, skipHeader) => block.split("\n")
    .filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l)).slice(skipHeader ? 1 : 0);

  const toolBlock = doc.slice(doc.indexOf("| Group | Tool |"), doc.indexOf("Materials stock"));
  const docTools = rows(toolBlock, true);
  assert.equal(LOADOUT.reduce((n, g) => n + g.items.length, 0), docTools.length,
    `the model has every tool row the document lists (${docTools.length})`);
  assert.deepEqual(LOADOUT.map((g) => g.group),
    [...new Set(docTools.map((l) => l.split("|")[1].trim()))], "and the same groups, in the same order");

  const matBlock = doc.slice(doc.indexOf("| Material | Qty needed"), doc.indexOf("At least two spares"));
  assert.equal(MATERIALS.length, rows(matBlock, true).length, "every material row is present");
});

test("material quantities come from the rates the document already states", () => {
  const by = (k) => MATERIALS.find((m) => m.key === k);
  assert.equal(materialQty(by("rj45"), { cam: 8 }), 8 * 2 + 4, "2 per camera plus spares");
  assert.equal(materialQty(by("screws"), { cam: 8 }), 8 * 3 + 6, "3 screws per camera plus spares");
  assert.equal(materialQty(by("patch"), { nvr: 1 }), 2);
  assert.equal(materialQty(by("cat6"), { cam: 8 }), null, "cable footage stays a judgement call");
  assert.equal(materialQty(by("rj45"), {}), null, "no count yet → no invented number");
});
