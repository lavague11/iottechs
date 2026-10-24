// #6 Explain-the-quote — the glossary + explain-intent detection (pure, 0-token, never a price).
import test from "node:test";
import assert from "node:assert/strict";
import { glossaryFor, isExplainItem, GLOSSARY } from "../lib/quote-glossary.js";

test("glossaryFor resolves standard line terms; most specific wins", () => {
  assert.equal(glossaryFor("what's the nvr")?.id, "nvr");
  assert.equal(glossaryFor("why the recorder")?.id, "nvr");
  assert.equal(glossaryFor("what does the labor cover")?.id, "labor");
  assert.equal(glossaryFor("what's the $150 drop")?.id, "drop");
  assert.equal(glossaryFor("what is a ceiling speaker")?.id, "speaker");
  assert.equal(glossaryFor("tell me about the amplifier")?.id, "amplifier");
  assert.equal(glossaryFor("what's the keypad")?.id, "keypad");
  assert.equal(glossaryFor("totally unrelated question"), null);
});

test("no glossary body ever states a price", () => {
  for (const e of GLOSSARY) assert.ok(!/\$\s*\d/.test(e.body), `${e.id} body has a price`);
});

test("isExplainItem fires only on an explain cue + a known term (never a bare objection)", () => {
  assert.equal(isExplainItem("what's an nvr"), true);
  assert.equal(isExplainItem("why do I need the drop"), true);
  assert.equal(isExplainItem("what does the labor cover"), true);
  // No glossary term → not an explain-item (e.g. a warranty/FAQ question).
  assert.equal(isExplainItem("what's your warranty"), false);
  // A doubt/objection about a device is NOT an explain-item — it must reach the objection capture, not a
  // generic glossary answer. (EXPLAIN_CUE deliberately excludes bare "need".)
  assert.equal(isExplainItem("I'm not sure we need the entrance camera"), false);
  assert.equal(isExplainItem("do we really need the nvr"), false);
});
