// Maya Learn Mode — pure classifier/toggle + security invariants. Learn Mode RECORDS admin feedback; it
// never changes behavior, is admin-only (server-gated on the session role, not prompt wording), and is
// unreachable from the untrusted customer path.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseLearnModeToggle, parseDirectReport, detectLearnFeedback, classifyLearnCategory,
  classifyLearnSeverity, extractExpected, buildLearnItem, similarity, parseLearnAnalyticsQuery,
  LEARN_CATEGORIES, LEARN_SEVERITIES, LEARN_STATUSES,
} from "../lib/maya-learn.js";

test("toggle: enter/exit variations → on/off, else null", () => {
  for (const s of ["enter Learn Mode", "Maya, start learn mode", "turn on learning mode", "go into learn mode"]) assert.equal(parseLearnModeToggle(s), "on", s);
  for (const s of ["exit Learn Mode", "stop learn mode", "turn off learning mode", "learn mode off"]) assert.equal(parseLearnModeToggle(s), "off", s);
  for (const s of ["add 4 cameras", "what's the balance", "learn about the project"]) assert.equal(parseLearnModeToggle(s), null, s);
});

test("direct report + feedback detection", () => {
  assert.equal(parseDirectReport("report this as a bug"), true);
  assert.equal(parseDirectReport("log this as feedback"), true);
  assert.equal(parseDirectReport("open the proposal"), false);
  assert.equal(detectLearnFeedback("you got that wrong"), true);
  assert.equal(detectLearnFeedback("you should have checked whether they already paid"), true);
  assert.equal(detectLearnFeedback("the correct answer is $500"), true);
  assert.equal(detectLearnFeedback("open Crazy Cars"), false);
});

test("classification: category + severity are sensible", () => {
  assert.equal(classifyLearnCategory("report a bug, the nudge still sent despite the pause"), "Bug");
  assert.equal(classifyLearnCategory("you should know our camera service includes the first hour"), "Knowledge Gap");
  assert.equal(classifyLearnCategory("you couldn't create the invoice but you should be able to"), "Missing Capability");
  assert.equal(classifyLearnCategory("ask one clarifying question first instead of escalating"), "Behavior Improvement");
  assert.equal(classifyLearnCategory("that answer was wrong, they already paid the deposit"), "Wrong Answer");
  // severity
  assert.equal(classifyLearnSeverity("an automated message was sent despite the pause", "Bug"), "Critical");
  assert.equal(classifyLearnSeverity("you told me the balance was outstanding but they paid", "Wrong Answer"), "High");
  assert.equal(classifyLearnSeverity("the spacing is slightly off", "UX Issue"), "Low");
  assert.equal(classifyLearnSeverity("you phrased that oddly", "Other"), "Medium");
});

test("buildLearnItem: shape + expected extraction + title", () => {
  const it = buildLearnItem("You should have checked whether the invoice was already paid before sending that reminder.");
  assert.equal(it.category, "Bad Judgment");
  assert.match(it.expected, /check/i);
  assert.ok(it.title.length <= 71 && it.title.length > 0);
  assert.match(it.proposedFix, /Expected:/);
  assert.ok(LEARN_CATEGORIES.includes(it.category) && LEARN_SEVERITIES.includes(it.severity));
});

test("similarity + analytics-query detection", () => {
  assert.ok(similarity("the nudge sent despite the pause", "a nudge was sent even though paused") > 0.2);
  assert.ok(similarity("camera pricing", "invoice totals") < 0.2);
  for (const s of ["what have I taught you this month", "what mistakes are you making most often", "show unresolved high severity learning items", "has the payment issue happened again in the learn queue"])
    assert.equal(parseLearnAnalyticsQuery(s), true, s);
  assert.equal(parseLearnAnalyticsQuery("what's the project balance"), false);
});

test("lifecycle statuses are the full set", () => {
  assert.deepEqual(LEARN_STATUSES, ["reported", "reviewed", "approved", "implemented", "verified", "rejected", "duplicate", "deferred", "cannot_reproduce"]);
});

// ---- Security invariants (source-level) ----------------------------------------------------------------
test("Learn Mode is admin-only, server-gated, records-only, and NOT on the customer path", () => {
  const ai = readFileSync(new URL("../app/project/[accessId]/ai-actions.js", import.meta.url), "utf8");
  // activation + recording both require admin role from the resolved session token
  assert.match(ai, /async function handleLearnMode[\s\S]{0,400}tok\?\.role !== "admin"[\s\S]{0,200}only available to administrators/, "toggle gated on admin");
  assert.ok(/handleLearnMode[\s\S]{0,900}tok\?\.role !== "admin"[\s\S]{0,120}administrators\.?"\s*;?\s*\}\s*\n\s*const li = buildLearnItem/.test(ai) || /if \(tok\?\.role !== "admin"\) return \{ ok: true, kind: "unsupported", speak: "Reporting feedback/.test(ai), "recording gated on admin");
  // runs in the STAFF interpret paths, before the model
  assert.equal((ai.match(/const lm = await handleLearnMode\(/g) || []).length, 2, "wired into both staff interpret actions");
  // the CUSTOMER path must NOT invoke Learn Mode (no self-teaching from untrusted customer text)
  const custStart = ai.indexOf("export async function aiCustomerInterpretAction");
  const custBody = ai.slice(custStart, ai.indexOf("export async function", custStart + 1));
  assert.ok(!/handleLearnMode/.test(custBody), "customer assistant never reaches Learn Mode");
});
