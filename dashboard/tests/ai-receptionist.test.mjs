// Item 2 — the PUBLIC receptionist's pure recognizers + capture state machine. No model, no I/O: these
// decide intent on untrusted public text deterministically, so this is where the safety contract is proven.
import test from "node:test";
import assert from "node:assert/strict";
import {
  extractEmail, extractPhone, extractName, detectService, wantsQuote,
  receptionistHandoff, looksLikeExistingClient, mergeLead, leadComplete, missingLeadField,
} from "../lib/ai-receptionist.js";

test("contact extraction: email + US phone, normalized", () => {
  assert.equal(extractEmail("reach me at Sam.Lee@Example.COM please"), "sam.lee@example.com");
  assert.equal(extractEmail("no contact here"), null);
  assert.equal(extractPhone("call (305) 555-1234"), "3055551234");
  assert.equal(extractPhone("+1 305.555.1234"), "3055551234");
  assert.equal(extractPhone("123"), null);
});

test("name extraction only when clearly given", () => {
  assert.equal(extractName("I'm Dana Lee"), "Dana Lee");
  assert.equal(extractName("this is jo"), "Jo");
  assert.equal(extractName("Maria Garcia"), "Maria Garcia");
  // a question is never a name
  assert.equal(extractName("how much is a camera"), null);
  // contact strings are not names
  assert.equal(extractName("sam@example.com"), null);
});

test("service detection maps to a label, else null", () => {
  assert.equal(detectService("I need some security cameras"), "CCTV");
  assert.equal(detectService("looking for an alarm system"), "Alarm");
  assert.equal(detectService("door access for my office"), "Access Control");
  assert.equal(detectService("just saying hi"), null);
});

test("quote intent", () => {
  assert.ok(wantsQuote("can I get a free quote"));
  assert.ok(wantsQuote("how much does it cost"));
  assert.ok(!wantsQuote("what are your hours"));
});

test("handoff + urgency", () => {
  assert.deepEqual(receptionistHandoff("I want to talk to a person"), { urgent: false });
  assert.deepEqual(receptionistHandoff("this is an emergency"), { urgent: true });
  assert.equal(receptionistHandoff("what cameras do you sell"), null);
});

test("existing-client questions route to sign-in, not a lead", () => {
  assert.ok(looksLikeExistingClient("where's my proposal"));
  assert.ok(looksLikeExistingClient("I'm already a customer"));
  assert.ok(!looksLikeExistingClient("I want cameras"));
});

test("capture state machine: merge → complete, never overwrites", () => {
  let s = {};
  s = mergeLead(s, "I need cameras");
  assert.equal(s.need, "CCTV");
  assert.equal(missingLeadField(s), "name");
  s = mergeLead(s, "I'm Dana Lee");
  assert.equal(s.name, "Dana Lee");
  assert.equal(missingLeadField(s), "contact");
  assert.ok(!leadComplete(s));
  s = mergeLead(s, "305-555-1234");
  assert.deepEqual(s.contact, { kind: "phone", value: "3055551234" });
  assert.ok(leadComplete(s));
  assert.equal(missingLeadField(s), null);
  // a later message does not overwrite an established field
  const s2 = mergeLead(s, "actually email me at other@x.com");
  assert.deepEqual(s2.contact, { kind: "phone", value: "3055551234" });
});

test("email preferred shape is captured when first given as email", () => {
  const s = mergeLead({}, "name is Jo, jo@x.com");
  assert.equal(s.name, "Jo");
  assert.deepEqual(s.contact, { kind: "email", value: "jo@x.com" });
});
