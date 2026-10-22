// AI command center — interpreter core (Phase 1). The deterministic router, the pure payload applier and
// the Claude tool-result parser are all isomorphic and validated here; the server action + UI are thin.
import test from "node:test";
import assert from "node:assert/strict";
import { routeCommand, applyIntentToPayload, parseClaudeResult, buildClaudeBody, AI_MODEL } from "../lib/ai-command.js";

const payload = () => ({ options: [{ id: "A", name: "Premium", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "x", name: "Camera", qty: 1, price: 300, cost: 0 }] }] }], discount: { type: "flat", value: 0 } });

test("router parses the four Phase-1 commands with zero tokens", () => {
  assert.deepEqual(routeCommand("add 8 cameras at $300"), { type: "add_items", name: "Camera", qty: 8, price: 300 });
  assert.deepEqual(routeCommand("Add a camera"), { type: "add_items", name: "Camera", qty: 1, price: null });
  assert.deepEqual(routeCommand("give them a 15% discount"), { type: "set_discount", pct: 15 });
  assert.deepEqual(routeCommand("note: wants two more cameras"), { type: "add_note", body: "wants two more cameras" });
  assert.deepEqual(routeCommand("open Crazy Cars"), { type: "navigate_project", query: "Crazy Cars" });
  assert.deepEqual(routeCommand("go to Crazy Cars."), { type: "navigate_project", query: "Crazy Cars" });
});

test("router leaves ambiguous phrasing to Claude (returns null), and doesn't hijack 'show invoices'", () => {
  assert.equal(routeCommand("throw a couple cams on there for three hundred bucks"), null);
  assert.equal(routeCommand("schedule install Thursday"), null);
  assert.equal(routeCommand("show me outstanding invoices"), null);   // not a project open
});

test("applyIntentToPayload adds a camera line to the camera service and reports the change", () => {
  const { payload: out, summary } = applyIntentToPayload(payload(), { type: "add_items", name: "Camera", qty: 8, price: 300 });
  const items = out.options[0].services.find((s) => s.key === "camera").items;
  assert.equal(items.length, 2, "appended one line");
  assert.equal(items[1].qty, 8); assert.equal(items[1].price, 300);
  assert.match(summary, /Add 8 × Camera at \$300\.00/);
});

test("applyIntentToPayload creates the camera service when the option has none, and uses the price book when price is null", () => {
  const p = { options: [{ id: "A", services: [] }] };
  const { payload: out } = applyIntentToPayload(p, { type: "add_items", name: "Camera", qty: 2, price: null }, { priceOf: () => 250 });
  const svc = out.options[0].services.find((s) => s.key === "camera");
  assert.ok(svc, "camera service created");
  assert.equal(svc.items[0].price, 250, "price filled from the book");
});

test("applyIntentToPayload sets a percent discount, and refuses an option-less proposal", () => {
  const { payload: out } = applyIntentToPayload(payload(), { type: "set_discount", pct: 15 });
  assert.deepEqual(out.discount, { type: "pct", value: 15 });
  assert.ok(applyIntentToPayload({ options: [] }, { type: "set_discount", pct: 10 }).error, "no options → error");
});

test("the original payload is never mutated (pure)", () => {
  const p = payload();
  applyIntentToPayload(p, { type: "add_items", name: "Camera", qty: 3, price: 100 });
  assert.equal(p.options[0].services[0].items.length, 1, "input untouched");
});

test("buildClaudeBody targets Haiku with the tool + the current project context", () => {
  const body = buildClaudeBody("add some cameras", { projectName: "Crazy Cars" });
  assert.equal(body.model, AI_MODEL);
  assert.equal(body.tool_choice.name, "proposal_command");
  assert.match(body.system, /Crazy Cars/);
  assert.ok(body.max_tokens <= 300, "bounded output keeps cost down");
});

test("parseClaudeResult extracts + sanitizes the tool intent, and degrades safely", () => {
  const res = (input) => ({ content: [{ type: "tool_use", name: "proposal_command", input }] });
  assert.deepEqual(parseClaudeResult(res({ type: "add_items", name: "Camera", qty: 9999, price: 300 })), { type: "add_items", name: "Camera", qty: 999, price: 300 });
  assert.deepEqual(parseClaudeResult(res({ type: "set_discount", pct: 150 })), { type: "set_discount", pct: 100 });
  assert.deepEqual(parseClaudeResult(res({ type: "unsupported", reason: "scheduling" })), { type: "unsupported", reason: "scheduling" });
  assert.deepEqual(parseClaudeResult({ content: [{ type: "text", text: "hi" }] }), { type: "unknown" });
  assert.deepEqual(parseClaudeResult(null), { type: "unknown" });
});
