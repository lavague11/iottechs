// Section F — one tool-card status language: Survey and Proposal derive through the same helper.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toolCardState, toolDone, acceptanceCurrent } from "../lib/tool-card.js";

const META = { has: true, fingerprint: "fp-1" };

test("a submitted survey reads Completed; an unsubmitted one does not", () => {
  assert.deepEqual(toolCardState({ done: toolDone(META, { fingerprint: "fp-1" }), started: true }), { done: true, action: "Completed" });
  assert.equal(toolCardState({ done: toolDone(META, undefined, undefined), started: true }).action, "Edit");
  assert.equal(toolCardState({ done: false, started: false }).action, "Create");
});

test("customer approval alone also completes; either matching acceptance suffices", () => {
  assert.equal(toolDone(META, null, { fingerprint: "fp-1" }), true);
});

test("a survey edited after approval does NOT read Completed", () => {
  const edited = { has: true, fingerprint: "fp-2" };
  assert.equal(toolDone(edited, { fingerprint: "fp-1" }, { fingerprint: "fp-1" }), false);
  assert.equal(toolCardState({ done: toolDone(edited, { fingerprint: "fp-1" }), started: true }).action, "Edit");
});

test("no fingerprint never counts as done", () => {
  assert.equal(toolDone({ has: false }, { fingerprint: undefined }), false);
  assert.equal(toolDone(undefined, { fingerprint: "x" }), false);
});

test("approval current but staff submission absent still completes", () => {
  assert.equal(toolDone(META, undefined, { fingerprint: "fp-1" }), true);
});

test("submission and approval holding DIFFERENT fingerprints: only the current one counts", () => {
  assert.equal(toolDone(META, { fingerprint: "old" }, { fingerprint: "fp-1" }), true);
  assert.equal(toolDone(META, { fingerprint: "fp-1" }, { fingerprint: "old" }), true);
  assert.equal(toolDone(META, { fingerprint: "old" }, { fingerprint: "older" }), false);
});

test("Proposal card: sent-but-unsigned is Edit, never-sent is Create, signed is Completed", () => {
  assert.equal(toolCardState({ done: false, started: !!"sent" }).action, "Edit");
  assert.equal(toolCardState({ done: false, started: !!undefined }).action, "Create");
  assert.equal(toolCardState({ done: true, started: true }).action, "Completed");
});

test("a card may name its own states — the word changes, the dialect does not", () => {
  // The Proposal's done word is "Signed". `done` (which drives the green + the title check) is
  // unaffected, so a renamed card is still the same language, not a second one.
  const signed = toolCardState({ done: true, started: true, labels: { done: "Signed" } });
  assert.deepEqual(signed, { done: true, action: "Signed" });
  // An override for a state the card is not in is ignored.
  assert.equal(toolCardState({ done: false, started: true, labels: { done: "Signed" } }).action, "Edit");
  // No labels at all = the generic defaults, unchanged for every existing card.
  assert.equal(toolCardState({ done: true }).action, "Completed");
  assert.equal(toolCardState({ done: false, started: true }).action, "Edit");
  assert.equal(toolCardState({}).action, "Create");
});

test("hub Proposal card: Awaiting signature while unsigned, green Signed once accepted", () => {
  const g = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
  const at = g.indexOf('{ key: "proposal", title: "Proposal"');
  assert.ok(at > -1, "the hub proposal card exists");
  const card = g.slice(at, at + 700);
  assert.match(card, /pStatus \? "Awaiting signature\."/, '"Sent." is gone — the sub says what it waits on');
  assert.doesNotMatch(card, /"Sent\."/);
  assert.match(card, /labels: \{ done: "Signed" \}/, "the done chip reads Signed");
  // The sub must not simply repeat the chip (house rule: nothing twice on one screen).
  assert.doesNotMatch(card, /pSigned \? "Signed\."/);
  // Green + the check come from `done`, which is still the signed fact — not from the new word.
  assert.match(card, /done: pSigned/);
});

test("ONE definition of 'current': toolAccepted delegates to acceptanceCurrent (null fingerprints never match)", () => {
  assert.equal(acceptanceCurrent({}, {}), false);
  assert.equal(acceptanceCurrent({ fingerprint: "a" }, { fingerprint: "a" }), true);
  const sa = readFileSync(new URL("../app/project/[accessId]/survey-approve.jsx", import.meta.url), "utf8");
  assert.match(sa, /return acceptanceCurrent\(meta, acceptance\)/);
});

test("hub: the card state comes from the shared helper; done card stays clickable with an accessible SVG check", () => {
  const g = readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
  assert.match(g, /sSurveyDone = toolDone\(toolMeta\?\.survey,/);
  assert.equal((g.match(/\.\.\.toolCardState\(/g) || []).length >= 2, true);
  const h = readFileSync(new URL("../app/project/[accessId]/staff-hub.jsx", import.meta.url), "utf8");
  assert.ok(!h.includes('" ✓"'));
  assert.match(h, /role="img" aria-label="Done"/);
  assert.match(h, /disabled=\{c\.locked\}/);
});
