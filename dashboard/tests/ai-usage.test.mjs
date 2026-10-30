// Maya — AI cost math + spend-cap decisions + model routing. Pure functions (lib/ai-usage.js,
// lib/ai-command.js pickModel), so no DB/network. Owner config: $10/day cap (1000¢), alert at 70%.
import test from "node:test";
import assert from "node:assert/strict";
import { costCents, rateFor, overCap, alertCents, crossesAlert, DEFAULT_CAP_CENTS, DEFAULT_ALERT_PCT } from "../lib/ai-usage.js";
import { pickModel, AI_MODEL_FAST, AI_MODEL_SMART } from "../lib/ai-command.js";

test("rateFor maps model family to the right $/MTok", () => {
  assert.deepEqual(rateFor("claude-haiku-4-5"), { in: 1.0, out: 5.0 });
  assert.deepEqual(rateFor("claude-sonnet-4-6"), { in: 3.0, out: 15.0 });
  assert.deepEqual(rateFor("claude-opus-4-8"), { in: 15.0, out: 75.0 });
  assert.deepEqual(rateFor("something-unknown"), { in: 1.0, out: 5.0 }, "defaults to fast/haiku rate");
});

test("costCents: a typical Haiku command is a small fraction of a cent", () => {
  // 400 in + 120 out on Haiku = (400*1 + 120*5)/1e6 $ = $0.001 = 0.1¢
  assert.equal(costCents("claude-haiku-4-5", 400, 120), 0.1);
  // Sonnet is pricier: (400*3 + 120*15)/1e6 $ = $0.003 = 0.3¢
  assert.equal(costCents("claude-sonnet-4-6", 400, 120), 0.3);
  assert.equal(costCents("claude-haiku-4-5", 0, 0), 0);
});

test("overCap: at or above the cap is over; below is not; cap<=0 disables the cap", () => {
  assert.equal(overCap(1000, 1000), true);
  assert.equal(overCap(1001, 1000), true);
  assert.equal(overCap(999.99, 1000), false);
  assert.equal(overCap(5000, 0), false, "cap 0 = unlimited");
});

test("alert threshold + crossesAlert fire once, on the crossing call", () => {
  assert.equal(alertCents(1000, 70), 700);
  assert.equal(crossesAlert(650, 60, 1000, 70), true, "650 → 710 crosses 700");
  assert.equal(crossesAlert(700, 10, 1000, 70), false, "already past the line → no re-alert");
  assert.equal(crossesAlert(600, 50, 1000, 70), false, "650 is still under 700");
});

test("defaults match the owner's config ($10/day, 70%)", () => {
  assert.equal(DEFAULT_CAP_CENTS, 1000);
  assert.equal(DEFAULT_ALERT_PCT, 70);
});

test("pickModel: escalates heavy asks to Sonnet, keeps everyday chat on Haiku", () => {
  for (const s of ["create an invoice for the Jones job", "diagnose why camera 3 is offline",
                   "draft the full quote for a 16-camera system with audio", "add 2 cameras and then send the proposal",
                   "troubleshoot the NVR, then record a $500 deposit and advance the stage"]) {
    assert.equal(pickModel(s), AI_MODEL_SMART, `"${s}" → Sonnet`);
  }
  for (const s of ["add 4 cameras", "what's the balance", "open Crazy Cars", "15% discount", "rename camera 3 to Front Door"]) {
    assert.equal(pickModel(s), AI_MODEL_FAST, `"${s}" → Haiku`);
  }
});

test("escalation model is claude-sonnet-5-5 and is costed at the sonnet rate", () => {
  assert.equal(AI_MODEL_SMART, "claude-sonnet-5-5");
  assert.deepEqual(rateFor("claude-sonnet-5-5"), { in: 3.0, out: 15.0 });
});
