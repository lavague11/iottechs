// Voice layer — the PURE helpers (feature detection, what-to-say, yes/no classification, parsing a
// recognition event). The browser I/O (SpeechRecognition / speechSynthesis) is exercised live, not here.
import test from "node:test";
import assert from "node:assert/strict";
import { speechSupport, readRecognition, summarizeForSpeech, voiceDecision, startMeter, pickPreferredVoice } from "../lib/voice.js";

test("speechSupport reports nothing in a non-browser (node) env", () => {
  assert.deepEqual(speechSupport(), { recognition: false, synthesis: false });
});

test("readRecognition splits interim vs final from a result event", () => {
  const ev = { resultIndex: 0, results: [
    { 0: { transcript: "add eight " }, isFinal: true },
    { 0: { transcript: "cameras" }, isFinal: false },
  ] };
  assert.deepEqual(readRecognition(ev), { interim: "cameras", final: "add eight" });
  assert.deepEqual(readRecognition({}), { interim: "", final: "" });
});

test("summarizeForSpeech speaks the right thing per result kind", () => {
  assert.match(summarizeForSpeech({ kind: "write", preview: { title: "Add 8 × Camera at $300.00", before: 0, after: 2400 } }), /Add 8 .*Camera.*New total \$2,400\.00\. Say confirm to apply, or cancel\./);
  assert.match(summarizeForSpeech({ kind: "write", preview: { title: "Describe 4 items" } }), /Describe 4 items\. Say confirm to apply, or cancel\./);
  assert.match(summarizeForSpeech({ kind: "navigate", label: "Payment" }), /Open Payment\? Say yes/);
  assert.match(summarizeForSpeech({ kind: "disambiguate", candidates: [{ id: "a", label: "Camera 1" }, { id: "b", label: "Camera 2" }] }), /1: Camera 1\. 2: Camera 2\. Which number\?/);
  assert.equal(summarizeForSpeech({ error: "No proposal yet." }), "No proposal yet.");
  assert.match(summarizeForSpeech({ kind: "unsupported", speak: "That's a later phase." }), /later phase/);
  assert.equal(summarizeForSpeech(null), "");
});

test("voiceDecision classifies a spoken reply while a change is pending", () => {
  for (const t of ["confirm", "yes do it", "apply", "yeah", "go ahead", "okay"]) assert.deepEqual(voiceDecision(t), { kind: "confirm" }, t);
  for (const t of ["cancel", "no", "never mind", "forget it", "scratch that"]) assert.deepEqual(voiceDecision(t), { kind: "cancel" }, t);
  assert.deepEqual(voiceDecision("the second one"), { kind: "pick", index: 2 });
  assert.deepEqual(voiceDecision("number 3"), { kind: "pick", index: 3 });
  assert.equal(voiceDecision("add more cameras"), null, "a real command is not a decision");
  assert.equal(voiceDecision(""), null);
});

test("pickPreferredVoice chooses a natural female English voice over a robotic male default", () => {
  const voices = [
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Microsoft Zira - English (United States)", lang: "en-US" },
    { name: "Google US English", lang: "en-US" },
    { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US" },
    { name: "Google Deutsch", lang: "de-DE" },
  ];
  const v = pickPreferredVoice(voices);
  assert.ok(/aria|zira|google us english/i.test(v.name), `picked a female/natural voice, got ${v.name}`);
  assert.ok(!/david/i.test(v.name), "never the male default");
  // Natural/neural engines win when present (least robotic).
  assert.match(pickPreferredVoice(voices).name, /aria|natural/i);
  assert.equal(pickPreferredVoice([]), null);
  assert.equal(pickPreferredVoice(), null);
});

test("startMeter returns null (honest fallback) when no mic API is present — never a fake waveform", async () => {
  // No navigator.mediaDevices.getUserMedia in node → the meter must resolve to null so the UI shows a
  // non-reactive listening state instead of bars that imply audio is being detected.
  const m = await startMeter(5);
  assert.equal(m, null);
});
