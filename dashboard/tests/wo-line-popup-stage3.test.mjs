// Stage 3 of docs/customer-flow-v2.md — the technician's line popup.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LINE_STATUS, lineStatusGate, lineDisplayName, lineProgressOf, statusForSteps,
  PROGRESS_LABEL, isFlagged, fieldProgress,
} from "../lib/work-order-field.js";
import { STAGE_FLOW } from "../lib/stage-flow.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ui = read("../app/project/[accessId]/work-order-field.jsx");

test("item 2+3: the steps ARE the status — none / some / all", () => {
  assert.equal(statusForSteps("camera", 0), LINE_STATUS.INCOMPLETE);
  assert.equal(statusForSteps("camera", 4), LINE_STATUS.INCOMPLETE);
  assert.equal(statusForSteps("camera", 5), LINE_STATUS.COMPLETE);
  assert.equal(PROGRESS_LABEL[lineProgressOf("camera", { stepsDone: 0 })], "Not started");
  assert.equal(PROGRESS_LABEL[lineProgressOf("camera", { stepsDone: 1 })], "In progress");
  assert.equal(PROGRESS_LABEL[lineProgressOf("camera", { stepsDone: 5 })], "Complete");
});

test("item 2: tapping the tip step clears it; tapping a lower one rewinds", () => {
  // The whole rule is one expression in the popup, so pin it rather than paraphrase it.
  assert.match(ui, /const tapStep = \(i\) => setPickStep\(pickStep === i \+ 1 \? i : i \+ 1\)/);
  assert.match(ui, /className=\{`wfd-step\$\{pickStep > i \? " on" : ""\}`\}/, "1..N light up, not just N");
});

test("item 5: Incomplete is called Not started, and nothing says Incomplete to a technician", () => {
  assert.equal(PROGRESS_LABEL.not_started, "Not started");
  assert.ok(!/>Incomplete</.test(ui), "no Incomplete label in the UI");
});

test("item 4: attention is a FLAG, orthogonal to progress, and legacy rows still read as flagged", () => {
  assert.ok(isFlagged({ state: { status: "attention" } }), "a row written before the flag existed");
  assert.ok(isFlagged({ state: { status: "complete", attention: 1 } }), "complete AND flagged is legal");
  assert.ok(!isFlagged({ state: { status: "complete" } }));
  // Counted by the progress summary either way.
  assert.equal(fieldProgress([{ kind: "equip", state: { status: "complete", attention: 1 } }]).attention, 1);
  assert.equal(fieldProgress([{ kind: "equip", state: { status: "attention" } }]).attention, 1);
  // The popup toggles it on its own, never through the status buttons.
  assert.match(ui, /onClick=\{\(\) => setAttention\(\(v\) => !v\)\}/);
});

test("item 6: photos are optional, and a tag is chosen after the shot", () => {
  const CAMERA = { needsPhotos: true };
  assert.equal(lineStatusGate({ status: LINE_STATUS.COMPLETE, checkedInToday: true, line: CAMERA, photos: [] }), null);
  assert.match(ui, /PHOTO_TAGS/, "before / after / detail");
  assert.ok(!/beforeRef|afterRef/.test(ui), "the two fixed slots are gone");
  assert.match(ui, /setPending\(f\)/, "the file waits to be tagged");
});

test("item 7: the Notes box is always rendered, not gated on a status", () => {
  const i = ui.indexOf('className="wfd-note"');
  assert.ok(i > 0, "the notes box exists");
  // It is not inside a `status === ... && (` guard the way the old "What's wrong?" box was.
  assert.ok(!/ATTENTION && \(\s*<div className="wfd-note"/.test(ui), "not conditional on the flag");
  assert.ok(!/What's wrong\?/.test(ui), "the old prompt is gone");
});

test("item 8: same-named lines are distinguishable by position and location", () => {
  const lines = [
    { key: "a", name: "JBL Speaker Upgrade" },
    { key: "b", name: "JBL Speaker Upgrade", location: "patio" },
    { key: "c", name: "Overnight Shipping" },
  ];
  assert.equal(lineDisplayName(lines[0], lines), "JBL Speaker Upgrade 1");
  assert.equal(lineDisplayName(lines[1], lines), "JBL Speaker Upgrade 2, patio");
  assert.equal(lineDisplayName(lines[2], lines), "Overnight Shipping", "a unique name is left alone");
  // The list and the popup must agree — both call the one helper.
  assert.ok((ui.match(/lineDisplayName\(/g) || []).length >= 2);
});

test("item 9: leaving Install needs the checklist only", () => {
  const labels = STAGE_FLOW.install.map((r) => r.label);
  assert.deepEqual(labels, ["Install checklist completed"]);
  assert.ok(!labels.some((l) => /photo/i.test(l)), "no photo requirement");
});

test("item 1: the popup reads top to bottom — steps, photo, notes, status, save", () => {
  const at = (s) => ui.indexOf(s);
  const steps = at('className="wfd-steps"'), shots = at('className="wfd-shots"');
  const note = at('className="wfd-note"'), choices = at('className="wfd-choices"'), save = at('className="wfd-save"');
  assert.ok(steps > 0 && shots > steps, "photo after steps");
  assert.ok(note > shots, "notes after photo");
  assert.ok(choices > note, "status after notes");
  assert.ok(save > choices, "save last");
});
