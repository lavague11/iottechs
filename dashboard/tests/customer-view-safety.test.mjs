// Customer View regression: a sent proposal with a corrupt / empty / malformed payload must NOT throw
// in the server render (sanitizeProposal runs in the project page's server component — a throw there 500s
// the page as Next's "This page couldn't load"). sanitizeProposal always returns an object whose
// payload.options is an array, and every option carries a services array — so the customer view renders
// the "Preparing…" state instead of crashing. Confirmed root cause: ProposalCustomerView dereferenced
// options[0].id / opt.services on an empty/missing options list (cloned/imported/legacy rows).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeProposal } from "../lib/proposal.js";

test("sanitizeProposal never throws on a corrupt/empty/missing-options payload (customer)", () => {
  for (const payload of ["", "not json", "{bad", "{}", '{"options":null}', '{"foo":1}', null]) {
    const row = { id: 1, version: 1, status: "sent", payload };
    let out;
    assert.doesNotThrow(() => { out = sanitizeProposal(row, "customer"); }, `payload ${JSON.stringify(payload)}`);
    assert.ok(out, "returns a sanitized object for a sent proposal");
    assert.ok(Array.isArray(out.payload.options), "payload.options is always an array");
    assert.equal(out.payload.options.length, 0);
  }
});

test("sanitizeProposal: an option without services is normalized to an empty services array (customer)", () => {
  const row = { id: 1, version: 1, status: "sent", payload: '{"options":[{"id":"A","name":"X"}]}' };
  const out = sanitizeProposal(row, "customer");
  assert.equal(out.payload.options.length, 1);
  assert.deepEqual(out.payload.options[0].services, [], "stripCost fills a missing services list");
});

test("sanitizeProposal: corrupt payload doesn't throw for cost roles either (admin/manager)", () => {
  for (const role of ["admin", "manager"]) {
    let out;
    assert.doesNotThrow(() => { out = sanitizeProposal({ id: 1, version: 1, status: "sent", payload: "{bad" }, role); });
    assert.ok(Array.isArray(out.payload.options), role);
  }
});

test("sanitizeProposal(null) is null; a valid payload is preserved", () => {
  assert.equal(sanitizeProposal(null, "customer"), null);
  const good = { id: 2, version: 3, status: "sent", payload: '{"options":[{"id":"A","services":[{"key":"camera","items":[]}]}]}' };
  const out = sanitizeProposal(good, "customer");
  assert.equal(out.payload.options[0].id, "A");
  assert.equal(out.payload.options[0].services[0].key, "camera");
});
