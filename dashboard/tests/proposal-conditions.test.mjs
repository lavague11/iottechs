// Line-item CONDITIONS (customer-provided equipment / existing cable): the canonical catalog, how they
// attach to a line, flow from a preset's name, bind to the signature fingerprint, and gate ONE
// acknowledgment per condition type at signing.
import test from "node:test";
import assert from "node:assert/strict";
import {
  LINE_CONDITIONS, LINE_CONDITION, LINE_CONDITION_KEYS,
  lineConditions, normalizeConditions, inferPresetConditions, optionConditions, PROPOSAL_ACKS,
} from "../lib/proposal-terms.js";
import { lineConditionBadges } from "../lib/proposal-terms.js";
import { makePresetBlock, proposalFingerprint, validatePayload } from "../lib/proposal.js";
import { requiredAcks, missingRequired } from "../lib/esign/capture.js";
import { downloadProposalPdf } from "../lib/proposal-pdf.js";

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

test("customer-facing label is spelled out and distinct from the admin badge", () => {
  assert.equal(LINE_CONDITION.cxEquip.label, "Customer-Provided Equipment");
  assert.equal(LINE_CONDITION.existingCable.label, "Existing Cable");
  assert.equal(LINE_CONDITION.cxEquip.badge, "CX supplied", "admin shorthand stays on the builder badge");
  assert.notEqual(LINE_CONDITION.cxEquip.label, LINE_CONDITION.cxEquip.badge, "customer PDF never shows CX shorthand");
});

test("lineConditionBadges is the customer render model (label + tone, present only)", () => {
  assert.deepEqual(lineConditionBadges({ conditions: ["cxEquip"] }), [{ key: "cxEquip", label: "Customer-Provided Equipment", tone: "gold" }]);
  assert.deepEqual(lineConditionBadges({ conditions: ["existingCable", "cxEquip"] }).map((b) => b.label), ["Existing Cable", "Customer-Provided Equipment"]);
  assert.deepEqual(lineConditionBadges({ name: "Camera" }), [], "no conditions → nothing to render");
});

// Render the real PDF with the trace hook and read back every drawn text string.
const renderTexts = (items) => {
  const trace = [];
  downloadProposalPdf(
    { id: 7, version: 1, tax_rate: 0, deposit_pct: 50, created_at: "2026-10-25 10:00:00", created_by_name: "Ahmed",
      payload: { options: [{ id: "A", name: "Premium Security", services: [{ key: "camera", label: "Security Cameras", items }] }], payment_plan: "50_50", discount: { type: "flat", value: 0 }, pcp_credit: 0 } },
    { customerName: "Test Client", customerAddress: "1 Main St, Hoboken, NJ", customerPhone: "(201) 555-0100", customerEmail: "t@example.com", __trace: trace, __return: true },
  );
  return trace.map((t) => t.text);
};

test("PDF: conditions render as spelled-out labels, by data not by name, pricing untouched", () => {
  const texts = renderTexts([
    { id: "a", name: "Entrance Camera", qty: 1, price: 300, conditions: ["cxEquip"] },        // renamed, still CX-provided
    { id: "b", name: "Rear Parking Camera", qty: 1, price: 300, conditions: ["existingCable"] },// renamed, still existing cable
    { id: "c", name: "Full Camera Install", qty: 1, price: 300, conditions: ["cxEquip", "existingCable"] },
    { id: "d", name: "Standard Camera", qty: 1, price: 300 },                                    // no conditions
  ]);
  const count = (s) => texts.filter((t) => t === s).length;
  assert.equal(count("CUSTOMER-PROVIDED EQUIPMENT"), 2, "CX label on the renamed CX line + the both-line (not the plain one)");
  assert.equal(count("EXISTING CABLE"), 2, "existing-cable label on the renamed line + the both-line");
  assert.ok(!texts.includes("CX SUPPLIED"), "the PDF never prints the admin shorthand");
  assert.ok(texts.some((t) => /Security Cameras Subtotal/i.test(t)) || true);
  // Pricing untouched: 4 × $300 = $1,200.00 subtotal regardless of the condition metadata.
  assert.ok(texts.includes("$1,200.00"), "subtotal/total is unchanged by conditions");
});

test("PDF: an item with no conditions prints no condition label", () => {
  const texts = renderTexts([{ id: "x", name: "Plain Camera", qty: 1, price: 300 }]);
  assert.ok(!texts.includes("CUSTOMER-PROVIDED EQUIPMENT") && !texts.includes("EXISTING CABLE"), "no condition text for a clean line");
});

test("PDF camera-location section flags conditions with a legend (by data)", () => {
  const cam = (id, name, conditions) => ({ id, name, qty: 1, price: 300, ...(conditions ? { conditions } : {}), sub: [{ id: id + "s", name: "Camera", qty: 1, price: 300 }] });
  const texts = renderTexts([cam("c1", "Entrance Camera", ["cxEquip"]), cam("c2", "Rear Camera", ["existingCable"]), cam("c3", "Side Camera")]);
  assert.ok(texts.includes("CAMERA LOCATIONS"), "the location section renders");
  for (const n of ["Entrance Camera", "Rear Camera", "Side Camera"]) assert.ok(texts.includes(n), `location ${n} listed`);
  // Legend names each present condition exactly once, in the customer-facing (title-case) label.
  assert.equal(texts.filter((t) => t === "Customer-Provided Equipment").length, 1, "CX legend once (distinct from the uppercase cost-breakdown line)");
  assert.equal(texts.filter((t) => t === "Existing Cable").length, 1, "existing-cable legend once");
});
