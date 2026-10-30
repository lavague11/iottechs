// Phase 3 — Waiver semantics + Customer-Provided Equipment (CPE).
// Contract: /dev/docs/pricing-fulfillment-architecture. RED / money-sensitive.
// Governing invariants (every test below defends one):
//   • a waive NEVER mutates the line's snapshot price — the value stays on the line, struck;
//   • un-waiving NEVER restores a price from the catalog — the original price was always preserved;
//   • CPE ⇒ waived is ONE-WAY — a manual waive, a $0 price, or any other condition NEVER implies CPE;
//   • manual + CPE are independent causes — removing one never clobbers the other (the owner's insisted case).
import test from "node:test";
import assert from "node:assert/strict";
import {
  WAIVER_CAUSES, waiverCausesOf, isWaived, hasWaiverCause, withWaiverCause, itemTotal,
} from "../lib/proposal.js";
import { LINE_CONDITION, conditionWaiveCause } from "../lib/proposal-terms.js";

const CPE = WAIVER_CAUSES.CPE;
const MANUAL = WAIVER_CAUSES.MANUAL;

// --- test mirrors of the editor's pure toggles (condPatch / setItemWaived) -----------------------------
// Toggle a condition on a line exactly as the editor does: a condition that carries a waiver cause
// adds/removes ONLY that cause; the condition key tracks separately. Never touches price.
function toggleCond(line, key, on) {
  const cause = conditionWaiveCause(LINE_CONDITION[key]);
  const conds = on
    ? [...new Set([...(line.conditions || []), key])]
    : (line.conditions || []).filter((k) => k !== key);
  return { ...line, conditions: conds, ...(cause ? withWaiverCause(line, cause, on) : {}) };
}
const toggleManual = (line, on) => ({ ...line, ...withWaiverCause(line, MANUAL, on) });
const toggleSub = (block, sid, fn) => ({ ...block, sub: block.sub.map((s) => (s.id === sid ? fn(s) : s)) });

// =======================================================================================================
// Condition → cause mapping
// =======================================================================================================
test("conditionWaiveCause: only CPE waives; Existing Cable / Tested / Not Tested never do", () => {
  assert.equal(conditionWaiveCause(LINE_CONDITION.cxEquip), CPE);
  assert.equal(conditionWaiveCause(LINE_CONDITION.existingCable), null);
  assert.equal(conditionWaiveCause(LINE_CONDITION.tested), null);
  assert.equal(conditionWaiveCause(LINE_CONDITION.notTested), null);
  assert.equal(conditionWaiveCause(null), null);
});

test("an admin waive-price condition gets its own isolated per-key cause", () => {
  assert.equal(conditionWaiveCause({ key: "promo", waivePrice: true }), "cond:promo");
});

// =======================================================================================================
// Cause model: read, derive, migrate
// =======================================================================================================
test("waiverCausesOf: bare legacy waived reads as a single MANUAL cause; absent reads as none", () => {
  assert.deepEqual(waiverCausesOf({ waived: true }), [MANUAL]);
  assert.deepEqual(waiverCausesOf({}), []);
  assert.deepEqual(waiverCausesOf({ waived: false }), []);
});

test("waiverCausesOf: an explicit array passes through and is sanitized", () => {
  assert.deepEqual(waiverCausesOf({ waiverCauses: [MANUAL, CPE] }), [MANUAL, CPE]);
  assert.deepEqual(waiverCausesOf({ waiverCauses: [MANUAL, 2, null, CPE] }), [MANUAL, CPE]);
  assert.deepEqual(waiverCausesOf({ waiverCauses: [] }), []);
});

test("isWaived / hasWaiverCause agree with the causes", () => {
  assert.equal(isWaived({ waived: true }), true);
  assert.equal(isWaived({}), false);
  assert.equal(isWaived({ waiverCauses: [CPE] }), true);
  assert.equal(hasWaiverCause({ waiverCauses: [MANUAL] }, MANUAL), true);
  assert.equal(hasWaiverCause({ waiverCauses: [CPE] }, MANUAL), false);
});

test("withWaiverCause: add is idempotent, remove is a no-op when absent, waived stays synced", () => {
  const add = withWaiverCause({}, CPE, true);
  assert.deepEqual(add, { waiverCauses: [CPE], waived: true });
  const addAgain = withWaiverCause({ waiverCauses: [CPE], waived: true }, CPE, true);
  assert.deepEqual(addAgain.waiverCauses, [CPE]);                 // no duplicate
  const rm = withWaiverCause({ waiverCauses: [CPE], waived: true }, CPE, false);
  assert.deepEqual(rm, { waiverCauses: [], waived: false });
  const rmAbsent = withWaiverCause({ waiverCauses: [MANUAL], waived: true }, CPE, false);
  assert.deepEqual(rmAbsent, { waiverCauses: [MANUAL], waived: true });
});

// =======================================================================================================
// One-way rule: CPE ⇒ waived, but waived ⇏ CPE
// =======================================================================================================
test("a manual waive never introduces a CPE cause", () => {
  const line = toggleManual({ id: "l", price: 200 }, true);
  assert.equal(isWaived(line), true);
  assert.equal(hasWaiverCause(line, MANUAL), true);
  assert.equal(hasWaiverCause(line, CPE), false);
});

test("a $0-priced line is NOT inferred to be CPE (or waived) by itself", () => {
  const free = { id: "f", price: 0 };
  assert.equal(isWaived(free), false);
  assert.equal(hasWaiverCause(free, CPE), false);
});

test("Existing Cable toggles its condition but never waives the line or touches price", () => {
  let line = { id: "l", qty: 1, price: 150 };
  line = toggleCond(line, "existingCable", true);
  assert.deepEqual(line.conditions, ["existingCable"]);
  assert.equal(isWaived(line), false);
  assert.equal(line.price, 150);
  assert.equal(itemTotal(line), 150);
});

// =======================================================================================================
// The coexistence case the owner insisted on
// =======================================================================================================
test("manual + CPE coexist: removing CPE leaves the manual waive intact (no reintroduced charge)", () => {
  let line = { id: "l", price: 150 };
  line = toggleManual(line, true);              // staff manually waives
  line = toggleCond(line, "cxEquip", true);     // then marks customer-provided
  assert.equal(hasWaiverCause(line, MANUAL), true);
  assert.equal(hasWaiverCause(line, CPE), true);
  line = toggleCond(line, "cxEquip", false);    // customer brings their own after all → remove CPE
  assert.equal(isWaived(line), true, "line is STILL waived — the manual waive survives");
  assert.equal(hasWaiverCause(line, MANUAL), true);
  assert.equal(hasWaiverCause(line, CPE), false);
  assert.equal(itemTotal(line), 0);
});

test("the reverse also holds: dropping a manual waive leaves a CPE waive intact", () => {
  let line = { id: "l", price: 150 };
  line = toggleCond(line, "cxEquip", true);
  line = toggleManual(line, true);
  line = toggleManual(line, false);             // un-waive manually
  assert.equal(isWaived(line), true, "still waived via CPE");
  assert.equal(hasWaiverCause(line, CPE), true);
  assert.equal(hasWaiverCause(line, MANUAL), false);
});

test("legacy bare-waived line: adding then removing CPE preserves the (manual) waive", () => {
  let line = { id: "l", price: 150, waived: true };   // old proposal, no recorded causes
  line = toggleCond(line, "cxEquip", true);
  assert.deepEqual(waiverCausesOf(line).sort(), [CPE, MANUAL].sort());
  line = toggleCond(line, "cxEquip", false);
  assert.equal(isWaived(line), true);
  assert.deepEqual(waiverCausesOf(line), [MANUAL]);
});

// =======================================================================================================
// Snapshot price preserved; never restored from the catalog
// =======================================================================================================
test("CPE on the Camera component comps only it; sibling labor stays billable (400 → 250 → 400)", () => {
  let block = { id: "b", name: "Camera Install Complete", qty: 1, price: 0, sub: [
    { id: "cam", name: "Camera", qty: 1, price: 150 },
    { id: "drop", name: "Cat6 Drop", qty: 1, price: 150 },
    { id: "term", name: "Termination", qty: 1, price: 40 },
    { id: "mnt", name: "Mounting", qty: 1, price: 30 },
    { id: "prog", name: "Programming", qty: 1, price: 30 },
  ] };
  assert.equal(itemTotal(block), 400);
  block = toggleSub(block, "cam", (s) => toggleCond(s, "cxEquip", true));
  assert.equal(itemTotal(block), 250, "only the $150 camera is comped");
  const cam = block.sub.find((s) => s.id === "cam");
  assert.equal(cam.price, 150, "snapshot price never mutated by the waive");
  assert.equal(isWaived(cam), true);
  for (const sib of block.sub.filter((s) => s.id !== "cam")) assert.equal(isWaived(sib), false);
  // Catalog price could now be anything (say $175) — removing CPE restores the line's OWN snapshot, not catalog.
  block = toggleSub(block, "cam", (s) => toggleCond(s, "cxEquip", false));
  assert.equal(block.sub.find((s) => s.id === "cam").price, 150, "returns to the $150 snapshot, never a new catalog price");
  assert.equal(itemTotal(block), 400);
});

test("NVR hardware CPE does NOT waive the NVR Setup labor line", () => {
  const nvr = toggleCond({ id: "nvr", name: "NVR (16-Channel)", qty: 1, price: 300, itemType: "equipment" }, "cxEquip", true);
  const setup = { id: "set", name: "NVR Setup", qty: 1, price: 100, nvrSetup: true, itemType: "labor" };
  assert.equal(isWaived(nvr), true);
  assert.equal(isWaived(setup), false);
  assert.equal(itemTotal(setup), 100, "setup labor stays billable when the recorder is customer-provided");
});

// =======================================================================================================
// Downstream safety: the authoritative `waived` flag stays synced (fingerprint/PDF/diff unchanged)
// =======================================================================================================
test("withWaiverCause keeps the `waived` flag equal to isWaived (fingerprint stability)", () => {
  for (const start of [{}, { waived: true }, { waiverCauses: [CPE], waived: true }]) {
    for (const [cause, on] of [[MANUAL, true], [CPE, true], [MANUAL, false], [CPE, false]]) {
      const patch = withWaiverCause(start, cause, on);
      const merged = { ...start, ...patch };
      assert.equal(!!merged.waived, isWaived(merged), "synced flag must match the derived state");
    }
  }
});

test("itemTotal keys off the synced flag, so the pre-waiver value is still computable for display", () => {
  const line = { id: "l", qty: 1, price: 150, ...withWaiverCause({}, CPE, true) };
  assert.equal(itemTotal(line), 0);
  assert.equal(itemTotal({ ...line, waived: false }), 150, "struck value shown to staff/PDF");
});
