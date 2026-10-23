// Conversation-mode policy is pure, so the endpointing / noise / barge-in / local-control rules unit-test
// without a microphone. These are the rules that stop the assistant interrupting, responding to silence,
// or hitting Claude for a "slow down".
import test from "node:test";
import assert from "node:assert/strict";
import { CONVO, NUDGE, LANGS, endpointDelay, isNoise, isBargeIn, parseVoiceControl, langFromPhrase } from "../lib/voice-convo.js";

test("endpointDelay waits ~2s normally, longer when the sentence sounds unfinished", () => {
  assert.equal(endpointDelay("open the crazy cars proposal"), CONVO.endSilenceMs);
  assert.equal(endpointDelay("what is the total and"), CONVO.unfinishedSilenceMs);   // trailing conjunction
  assert.equal(endpointDelay("show me the,"), CONVO.unfinishedSilenceMs);            // trailing comma
  assert.equal(endpointDelay("um"), CONVO.unfinishedSilenceMs);                      // trailing filler
  assert.ok(CONVO.endSilenceMs >= 1500 && CONVO.endSilenceMs <= 2200);              // ~2 seconds
});

test("isNoise rejects empty / filler / punctuation so silence never triggers a response", () => {
  assert.ok(isNoise(""));
  assert.ok(isNoise("a"));
  assert.ok(isNoise("um uh"));
  assert.ok(isNoise("..."));
  assert.ok(!isNoise("open crazy cars"));
  assert.ok(!isNoise("hi"));   // short but real
});

test("isBargeIn needs genuine speech, not a cough or the assistant's own stray word", () => {
  assert.ok(!isBargeIn("uh"));
  assert.ok(!isBargeIn("hmm"));
  assert.ok(isBargeIn("actually wait stop"));
  assert.ok(!isBargeIn("no"));   // too short to be a confident barge-in
});

test("parseVoiceControl handles local meta-commands with NO Claude call", () => {
  assert.deepEqual(parseVoiceControl("stop talking"), { kind: "stop" });
  assert.deepEqual(parseVoiceControl("wait"), { kind: "wait" });
  assert.deepEqual(parseVoiceControl("repeat that"), { kind: "repeat" });
  assert.equal(parseVoiceControl("slow down").kind, "rate");
  assert.ok(parseVoiceControl("slow down").delta < 0);
  assert.ok(parseVoiceControl("speak faster").delta > 0);
  assert.deepEqual(parseVoiceControl("keep it short"), { kind: "brief", on: true });
  assert.deepEqual(parseVoiceControl("go back"), { kind: "back" });
  assert.deepEqual(parseVoiceControl("speak spanish"), { kind: "lang", lang: "es" });
  assert.deepEqual(parseVoiceControl("switch to arabic"), { kind: "lang", lang: "ar" });
  assert.deepEqual(parseVoiceControl("answer in english"), { kind: "lang", lang: "en" });
});

test("parseVoiceControl returns null for real requests — those go to the interpreter", () => {
  assert.equal(parseVoiceControl("how much is the crazy cars proposal"), null);
  assert.equal(parseVoiceControl("open crazy cars"), null);
  assert.equal(parseVoiceControl("what's going on with it"), null);
  assert.equal(parseVoiceControl("explain that"), null);   // a content question, not a local control
});

test("language helpers map phrases + expose supported languages with BCP-47 tags", () => {
  assert.equal(langFromPhrase("please speak español"), "es");
  assert.equal(langFromPhrase("talk in العربية"), "ar");
  assert.equal(langFromPhrase("no language here"), null);
  assert.equal(LANGS.es.bcp47, "es-ES");
  assert.equal(LANGS.ar.bcp47, "ar-SA");
  assert.ok(typeof NUDGE === "string" && NUDGE.length);
});
