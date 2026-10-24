// Phase 3.2 — structured feedback/objection capture (pure model). Proves the taxonomy classification, that
// parseFeedback fires on real capture/objection phrasings (incl. the device-bound "need" objection) but NOT
// on other action verbs or plain statements, and the display label.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyFeedback, parseFeedback, mentionsDevice, feedbackLabel, suggestedActionFor, FEEDBACK_KINDS, FEEDBACK_STATUS } from "../lib/feedback-model.js";

test("classifyFeedback maps utterances to the taxonomy (specific objection wins)", () => {
  assert.equal(classifyFeedback("the price is too expensive for our budget"), "objection:price");
  assert.equal(classifyFeedback("how long will this take, it seems like a long timeline"), "objection:timeline");
  assert.equal(classifyFeedback("not sure we really need that camera"), "objection:need");
  assert.equal(classifyFeedback("do they have a good track record and warranty"), "objection:trust");
  assert.equal(classifyFeedback("can we add a speaker in the lobby"), "feedback:request");
  assert.equal(classifyFeedback("they love the new layout, very happy"), "feedback:praise");
  assert.equal(classifyFeedback("the customer is a bit worried"), "feedback:concern");
  assert.equal(classifyFeedback("mentioned something in passing"), "feedback:other");
  for (const k of FEEDBACK_KINDS) assert.equal(feedbackLabel(k).length > 0, true);
  assert.deepEqual(FEEDBACK_STATUS, ["open", "reviewed", "resolved"]);
});

test("parseFeedback fires on explicit capture, reported speech, and the device-need objection", () => {
  const a = parseFeedback("log an objection from the customer: the price is too high");
  assert.ok(a && a.kind === "objection:price");
  const b = parseFeedback("the customer is worried about the front entrance camera");
  assert.ok(b && b.kind === "feedback:concern" && b.wantsDevice === true);
  // The owner's headline sentence.
  const c = parseFeedback("I'm not sure we need that camera near the entrance");
  assert.ok(c && c.kind === "objection:need" && c.wantsDevice === true);
  assert.ok(c.ref.includes("entrance"));
});

test("parseFeedback does NOT hijack other actions or plain statements", () => {
  assert.equal(parseFeedback("flag camera 3 as damaged"), null);        // → raise_issue
  assert.equal(parseFeedback("resolve the issue"), null);               // → adjudicate_issue
  assert.equal(parseFeedback("send the proposal to the customer"), null);
  assert.equal(parseFeedback("record a $500 deposit"), null);
  assert.equal(parseFeedback("the install is finished"), null);         // plain statement, no cue
  assert.equal(parseFeedback(""), null);
});

test("mentionsDevice detects a device reference (to decide whether to bind one)", () => {
  assert.equal(mentionsDevice("the entrance camera"), true);
  assert.equal(mentionsDevice("c3"), true);
  assert.equal(mentionsDevice("the overall price"), false);
});

test("#7 suggestedActionFor maps a device-bound objection to a one-click revision", () => {
  assert.equal(suggestedActionFor("objection:need"), "remove");    // "don't need it" → drop the line
  assert.equal(suggestedActionFor("objection:scope"), "remove");   // "too much equipment" → drop
  assert.equal(suggestedActionFor("objection:price"), "revise");   // "too expensive" → revise the price
  assert.equal(suggestedActionFor("objection:timeline"), null);    // no obvious one-click change
  assert.equal(suggestedActionFor("feedback:praise"), null);
  assert.equal(suggestedActionFor(""), null);
});
