// Line-item CONDITIONS (customer-provided equipment / existing cable): the canonical catalog, how they
// attach to a line, flow from a preset's name, bind to the signature fingerprint, and gate ONE
// acknowledgment per condition type at signing.
import test from "node:test";
import assert from "node:assert/strict";
import {
  LINE_CONDITIONS, LINE_CONDITION, LINE_CONDITION_KEYS,
  lineConditions, normalizeConditions, inferPresetConditions, optionConditions, PROPOSAL_ACKS,
} from "../lib/proposal-terms.js";
import { makePresetBlock, proposalFingerprint, validatePayload } from "../lib/proposal.js";
import { requiredAcks, missingRequired } from "../lib/esign/capture.js";

test("catalog: two condition types, each with a key/badge/tone/ack", () => {
  assert.deepEqual(LINE_CONDITION_KEYS, ["cxEquip", "existingCable"]);
  for (const c of LINE_CONDITIONS) {
    assert.ok(c.key && c.badge && c.tone && c.ack, "every condition is fully specified");
    assert.equal(LINE_CONDITION[c.key], c, "indexed by key");
  }
});

test("lineConditions keeps only known keys; normalizeConditions dedupes + drops junk", () => {
  assert.deepEqual(lineConditions({ conditions: ["cxEquip", "nope", "existingCable"] }), ["cxEquip", "existingCable"]);
  assert.deepEqual(lineConditions({}), []);
  assert.deepEqual(lineConditions({ conditions: "cxEquip" }), [], "a non-array is no conditions");
  assert.deepEqual(normalizeConditions(["cxEquip", "cxEquip", "x"]), ["cxEquip"]);
  assert.deepEqual(normalizeConditions(null), []);
});

test("inferPresetConditions reads the owner's bundle names", () => {
  assert.deepEqual(inferPresetConditions("CX Provided Camera Install"), ["cxEquip"]);
  assert.deepEqual(inferPresetConditions("Customer-supplied cameras"), ["cxEquip"]);
  assert.deepEqual(inferPresetConditions("Existing Cable Install"), ["existingCable"]);
  assert.deepEqual(inferPresetConditions("Existing wiring reuse"), ["existingCable"]);
  assert.deepEqual(inferPresetConditions("Full Camera Install"), [], "a plain install implies nothing");
});

test("makePresetBlock carries conditions (explicit wins over inferred; none → no key)", () => {
  const book = { prices: {}, names: {}, hidden: {}, custom: {}, presets: [] };
  const plain = makePresetBlock({ name: "Full Camera Install", items: [] }, book);
  assert.ok(!("conditions" in plain), "no condition → the key is omitted");
  const inferred = makePresetBlock({ name: "CX Provided Camera Install", items: [] }, book);
  assert.deepEqual(inferred.conditions, ["cxEquip"], "inferred from the name");
  const explicit = makePresetBlock({ name: "Full Camera Install", conditions: ["existingCable"], items: [] }, book);
  assert.deepEqual(explicit.conditions, ["existingCable"], "explicit conditions win over the name");
});

const optWith = (items) => ({ options: [{ id: "A", services: [{ key: "camera", items }] }] });

test("optionConditions scans top-level lines of the chosen option (sub-items ignored)", () => {
  const pl = {
    options: [
      { id: "A", services: [{ items: [{ conditions: ["cxEquip"] }, { sub: [{ conditions: ["existingCable"] }] }] }] },
      { id: "B", services: [{ items: [{ conditions: ["existingCable"] }] }] },
    ],
  };
  assert.deepEqual(optionConditions(pl, "A"), ["cxEquip"], "A has only the top-level cxEquip; sub-item is ignored");
  assert.deepEqual(optionConditions(pl, "B"), ["existingCable"]);
  assert.deepEqual(optionConditions(pl), ["cxEquip"], "defaults to the first option");
  assert.deepEqual(optionConditions({ options: [] }), []);
});

test("PROPOSAL_ACKS has one required, condKey-gated acknowledgment per condition type", () => {
  for (const key of LINE_CONDITION_KEYS) {
    const a = PROPOSAL_ACKS.find((x) => x.key === key);
    assert.ok(a?.required && a.condKey === key, `${key} ack is required + gated on its condition`);
    assert.equal(a.label, LINE_CONDITION[key].ack, "the ack text is the canonical condition ack");
  }
});

test("requiredAcks surfaces a condition ack only when a line carries it", () => {
  const keys = (payload, facts) => requiredAcks(payload, facts).map((a) => a.key);
  assert.ok(!keys({}, {}).includes("cxEquip"), "no conditions → no cxEquip ack");
  // Derived from the payload's option (what the stored doc was rendered for)
  const got = keys(optWith([{ conditions: ["cxEquip"] }]), { option: "A" });
  assert.ok(got.includes("cxEquip") && !got.includes("existingCable"), "cxEquip present → its ack only");
  // Or passed directly as facts.conditions
  assert.ok(keys({}, { conditions: ["existingCable"] }).includes("existingCable"), "facts.conditions is honored");
});

test("missingRequired demands a condition ack whenever that condition is on the signed option", () => {
  const SIG = { data: "data:image/png;base64,AAAA" };
  const payload = optWith([{ conditions: ["existingCable"] }]);
  const facts = { option: "A" };
  const base = { name: "Jo", signature: SIG, acks: { terms: true, payment: true } };
  assert.deepEqual(missingRequired(base, payload, facts), ["ack:existingCable"], "existing-cable ack still missing");
  const agreed = { ...base, acks: { ...base.acks, existingCable: true } };
  assert.deepEqual(missingRequired(agreed, payload, facts), [], "checking it satisfies the gate");
});

test("a condition is part of the signature fingerprint (changing it voids the signature)", () => {
  const noCond = optWith([{ name: "Cam", qty: 1, price: 300 }]);
  const withCond = optWith([{ name: "Cam", qty: 1, price: 300, conditions: ["cxEquip"] }]);
  const emptyCond = optWith([{ name: "Cam", qty: 1, price: 300, conditions: [] }]);
  assert.notEqual(proposalFingerprint(withCond), proposalFingerprint(noCond), "adding a condition changes the hash");
  assert.equal(proposalFingerprint(emptyCond), proposalFingerprint(noCond), "an empty conditions array hashes like none (existing signatures safe)");
});

test("validatePayload rejects malformed conditions", () => {
  const ok = optWith([{ name: "Cam", qty: 1, price: 300, conditions: ["cxEquip"] }]);
  assert.equal(validatePayload(ok), null, "a well-formed condition list is accepted");
  const bad = optWith([{ name: "Cam", qty: 1, price: 300, conditions: "cxEquip" }]);
  assert.equal(validatePayload(bad), "Bad conditions.", "a non-array is rejected");
});
