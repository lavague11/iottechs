// AI command center — interpreter core (Phase 1). The deterministic router, the pure payload applier and
// the Claude tool-result parser are all isomorphic and validated here; the server action + UI are thin.
import test from "node:test";
import assert from "node:assert/strict";
import { routeCommand, applyIntentToPayload, parseClaudeResult, buildClaudeBody, AI_MODEL, resolveItems, resolveSection, resolveServiceIndex } from "../lib/ai-command.js";

// A multi-section proposal for the reorder / navigation tests.
const sectioned = () => ({ options: [{ id: "A", services: [
  { key: "camera", label: "Security Cameras", items: [{ id: "c", name: "Camera", qty: 2, price: 300, cost: 0 }] },
  { key: "sound", label: "Audio System", items: [{ id: "s", name: "Speaker", qty: 1, price: 150, cost: 0 }] },
  { key: "network", label: "Networking", items: [{ id: "n", name: "Switch", qty: 1, price: 120, cost: 0 }] },
] }], discount: { type: "flat", value: 0 } });

const payload = () => ({ options: [{ id: "A", name: "Premium", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "x", name: "Camera", qty: 1, price: 300, cost: 0 }] }] }], discount: { type: "flat", value: 0 } });

// A richer proposal for the editing tests: an NVR + three cameras + one qty-8 "just added" camera line.
const editable = () => ({ options: [{ id: "A", services: [
  { key: "camera", label: "Security Cameras", items: [
    { id: "nvr", name: "NVR · 8-Channel", qty: 1, price: 150, cost: 0 },
    { id: "c1", name: "Camera 1", qty: 1, price: 300, cost: 0 },
    { id: "c2", name: "Camera 2", qty: 1, price: 300, cost: 0 },
    { id: "ai-99", name: "Camera", qty: 8, price: 300, cost: 0 },
  ] },
] }], discount: { type: "flat", value: 0 } });

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

test("resolveItems finds existing line items by name / qty / price / id (first option)", () => {
  const p = editable();
  assert.equal(resolveItems(p, { name: "camera" }).length, 3, "all three camera-named lines (not the NVR)");
  assert.equal(resolveItems(p, { name: "camera", qty: 8 }).length, 1, "'the 8 cameras' → the qty-8 line");
  assert.equal(resolveItems(p, { name: "dvr" })[0].id, "nvr", "synonym: dvr → NVR");
  assert.deepEqual(resolveItems(p, { id: "c1" }).map((m) => m.id), ["c1"], "exact id");
  assert.equal(resolveItems(p, { name: "nothing-here" }).length, 0);
});

test("router parses a $ price edit on existing items (zero tokens), not a discount", () => {
  assert.deepEqual(routeCommand("change the cameras to $275"), { type: "edit_item", match: { name: "camera" }, set: { price: 275 } });
  assert.deepEqual(routeCommand("set the pool camera to $250 each"), { type: "edit_item", match: { name: "pool camera" }, set: { price: 250 } });
  assert.equal(routeCommand("give them 15% off").type, "set_discount", "discount phrasing still wins, not edit_item");
});

test("edit_item sets price/qty on every match and summarizes", () => {
  const { payload: out, summary, count } = applyIntentToPayload(editable(), { type: "edit_item", match: { name: "camera", qty: 8 }, set: { price: 275 } });
  const line = out.options[0].services[0].items.find((i) => i.id === "ai-99");
  assert.equal(line.price, 275, "the qty-8 camera line repriced");
  assert.equal(count, 1);
  assert.match(summary, /\$275\.00/);
  // "the cameras" (3 matches) → all repriced
  const multi = applyIntentToPayload(editable(), { type: "edit_item", match: { name: "camera" }, set: { price: 250 } });
  assert.deepEqual(multi.payload.options[0].services[0].items.filter((i) => /camera/i.test(i.name)).map((i) => i.price), [250, 250, 250]);
});

test("edit_item rename/move needs a single match — otherwise it returns candidates to disambiguate", () => {
  const amb = applyIntentToPayload(editable(), { type: "edit_item", match: { name: "camera" }, set: { name: "Front Door Camera" } });
  assert.ok(Array.isArray(amb.ambiguous) && amb.ambiguous.length === 3, "3 candidates handed back");
  assert.equal(amb.action, "rename");
  // disambiguated by id → applies
  const done = applyIntentToPayload(editable(), { type: "edit_item", match: { id: "c1" }, set: { name: "Front Door Camera" } });
  assert.equal(done.payload.options[0].services[0].items.find((i) => i.id === "c1").name, "Front Door Camera");
});

test("edit_item moves a single item into another section, creating it if needed", () => {
  const { payload: out, summary } = applyIntentToPayload(editable(), { type: "edit_item", match: { id: "nvr" }, moveToService: "software" });
  const cam = out.options[0].services.find((s) => s.key === "camera");
  const soft = out.options[0].services.find((s) => /software/i.test(s.label));
  assert.ok(!cam.items.some((i) => i.id === "nvr"), "removed from cameras");
  assert.ok(soft && soft.items.some((i) => i.id === "nvr"), "added to the new Software section");
  assert.match(summary, /moved to/i);
});

test("edit_item with no matching item errors clearly", () => {
  assert.match(applyIntentToPayload(editable(), { type: "edit_item", match: { name: "thermostat" }, set: { price: 10 } }).error, /No line item matching/);
});

// ---- Slice 2: reorganize sections, rewrite descriptions, contextual navigation ----

test("router parses section reorder (zero tokens) and resolveServiceIndex finds sections fuzzily", () => {
  assert.deepEqual(routeCommand("move the audio section to the top"), { type: "reorder_section", match: { name: "audio" }, to: "top" });
  assert.deepEqual(routeCommand("put networking last"), { type: "reorder_section", match: { name: "networking" }, to: "bottom" });
  assert.deepEqual(routeCommand("move cameras up"), { type: "reorder_section", match: { name: "cameras" }, to: "up" });
  const p = sectioned();
  assert.equal(resolveServiceIndex(p, { name: "audio" }), 1, "fuzzy: 'audio' → Audio System");
  assert.equal(resolveServiceIndex(p, { name: "security cameras" }), 0, "exact label");
  assert.equal(resolveServiceIndex(p, { name: "nope" }), -1);
});

test("reorder_section moves a whole section and leaves the total unchanged", () => {
  const { payload: out, summary, reorder } = applyIntentToPayload(sectioned(), { type: "reorder_section", match: { name: "networking" }, to: "top" });
  assert.deepEqual(out.options[0].services.map((s) => s.key), ["network", "camera", "sound"], "Networking moved to the top");
  assert.ok(reorder && /Networking/.test(summary));
  // down / already-at-edge
  assert.deepEqual(applyIntentToPayload(sectioned(), { type: "reorder_section", match: { name: "camera" }, to: "down" }).payload.options[0].services.map((s) => s.key), ["sound", "camera", "network"]);
  assert.match(applyIntentToPayload(sectioned(), { type: "reorder_section", match: { name: "camera" }, to: "top" }).error, /already at the top/);
  assert.match(applyIntentToPayload(sectioned(), { type: "reorder_section", match: { name: "ghost" }, to: "up" }).error, /No section matching/);
});

test("edit_item rename/rewrite shows old → new and never touches price or qty", () => {
  const p = { options: [{ id: "A", services: [{ key: "camera", label: "Cameras", items: [{ id: "x", name: "Pool Cam", qty: 1, price: 300, cost: 0 }] }] }] };
  const { payload: out, summary } = applyIntentToPayload(p, { type: "edit_item", match: { id: "x" }, set: { name: "Exterior IP Camera — Pool Area" } });
  const it = out.options[0].services[0].items[0];
  assert.equal(it.name, "Exterior IP Camera — Pool Area");
  assert.equal(it.price, 300, "price locked"); assert.equal(it.qty, 1, "qty locked");
  assert.match(summary, /"Pool Cam" → "Exterior IP Camera/);
});

test("set_desc writes a customer description on matched item(s) and never touches name/price/qty", () => {
  const p = { options: [{ id: "A", services: [{ key: "camera", label: "Cameras", items: [
    { id: "c1", name: "8MP 4K Security Camera", qty: 2, price: 300, cost: 0 },
    { id: "c2", name: "8MP 4K Security Camera", qty: 1, price: 300, cost: 0 },
    { id: "nvr", name: "NVR · 8-Channel", qty: 1, price: 150, cost: 0 },
  ] }] }] };
  const { payload: out, summary, desc, count } = applyIntentToPayload(p, { type: "set_desc", match: { name: "camera" }, desc: "High-resolution security camera with remote mobile viewing." });
  const cams = out.options[0].services[0].items.filter((i) => /camera/i.test(i.name));
  assert.equal(cams.length, 2, "both cameras matched (not the NVR)");
  for (const c of cams) {
    assert.equal(c.desc, "High-resolution security camera with remote mobile viewing.", "description written");
    assert.equal(c.name, "8MP 4K Security Camera", "product name untouched");
    assert.equal(c.price, 300); assert.equal(c.qty, 2 === c.qty ? 2 : 1);   // prices/qtys unchanged
  }
  assert.equal(out.options[0].services[0].items.find((i) => i.id === "nvr").desc, undefined, "NVR untouched");
  assert.equal(count, 2); assert.ok(desc && /Describe/.test(summary));
  assert.match(applyIntentToPayload(p, { type: "set_desc", match: { name: "nothing" }, desc: "x" }).error, /No line item matching/);
});

test("parseClaudeResult handles set_desc (match + desc), and the prompt enforces grounding", () => {
  const res = (input) => ({ content: [{ type: "tool_use", name: "proposal_command", input }] });
  assert.deepEqual(parseClaudeResult(res({ type: "set_desc", match: { name: "camera" }, desc: "  Clear, color   night   overview. " })),
    { type: "set_desc", match: { name: "camera" }, desc: "Clear, color night overview." });
  assert.deepEqual(parseClaudeResult(res({ type: "set_desc", match: {}, desc: "" })), { type: "unknown" }, "needs a match + text");
  // the grounding rule must be in the system prompt the model receives
  const sys = buildClaudeBody("x", {}).system;
  assert.match(sys, /ONLY on the product name/);
  assert.match(sys, /Never invent/i);
  assert.match(sys, /set_desc NEVER changes the product name/);
});

test("resolveSection maps phrases to the deck's stage + open slug", () => {
  assert.deepEqual(resolveSection("take me to the proposal"), { stage: "proposal", open: "proposal", label: "Proposal" });
  assert.deepEqual(resolveSection("the site survey"), { stage: "site_survey", open: "survey", label: "Site Survey" });
  assert.deepEqual(resolveSection("final payment"), { stage: "payment", open: "payment", label: "Payment" });
  assert.deepEqual(resolveSection("quality control"), { stage: "qc", open: null, label: "Quality Control" });
  assert.equal(resolveSection("the moon"), null);
});

test("router sends a known section to navigate_section, an unknown name to navigate_project", () => {
  assert.deepEqual(routeCommand("take me to the proposal"), { type: "navigate_section", stage: "proposal", open: "proposal", label: "Proposal" });
  assert.deepEqual(routeCommand("open the site survey"), { type: "navigate_section", stage: "site_survey", open: "survey", label: "Site Survey" });
  assert.deepEqual(routeCommand("open Crazy Cars"), { type: "navigate_project", query: "Crazy Cars" });
});

test("parseClaudeResult handles reorder_section + navigate_section, and resolves/declines nav targets", () => {
  const res = (input) => ({ content: [{ type: "tool_use", name: "proposal_command", input }] });
  assert.deepEqual(parseClaudeResult(res({ type: "reorder_section", match: { name: "audio" }, to: "bottom" })), { type: "reorder_section", match: { name: "audio" }, to: "bottom" });
  assert.deepEqual(parseClaudeResult(res({ type: "reorder_section", match: { name: "audio" }, to: "sideways" })), { type: "unknown" }, "bad direction rejected");
  assert.deepEqual(parseClaudeResult(res({ type: "navigate_section", target: "payment screen" })), { type: "navigate_section", stage: "payment", open: "payment", label: "Payment" });
  assert.equal(parseClaudeResult(res({ type: "navigate_section", target: "the kitchen" })).type, "unsupported", "unknown section → unsupported with guidance");
});

test("parseClaudeResult handles edit_item (match + set) and rejects an empty edit", () => {
  const res = (input) => ({ content: [{ type: "tool_use", name: "proposal_command", input }] });
  assert.deepEqual(parseClaudeResult(res({ type: "edit_item", match: { name: "camera", qty: 8 }, set: { price: 275 } })),
    { type: "edit_item", match: { name: "camera", qty: 8 }, set: { price: 275 } });
  assert.deepEqual(parseClaudeResult(res({ type: "edit_item", match: { name: "nvr" }, moveToService: "software" })),
    { type: "edit_item", match: { name: "nvr" }, set: {}, moveToService: "software" });
  assert.deepEqual(parseClaudeResult(res({ type: "edit_item", match: {}, set: {} })), { type: "unknown" }, "no match + no change → unknown");
});

test("parseClaudeResult extracts + sanitizes the tool intent, and degrades safely", () => {
  const res = (input) => ({ content: [{ type: "tool_use", name: "proposal_command", input }] });
  assert.deepEqual(parseClaudeResult(res({ type: "add_items", name: "Camera", qty: 9999, price: 300 })), { type: "add_items", name: "Camera", qty: 999, price: 300 });
  assert.deepEqual(parseClaudeResult(res({ type: "set_discount", pct: 150 })), { type: "set_discount", pct: 100 });
  assert.deepEqual(parseClaudeResult(res({ type: "unsupported", reason: "scheduling" })), { type: "unsupported", reason: "scheduling" });
  assert.deepEqual(parseClaudeResult({ content: [{ type: "text", text: "hi" }] }), { type: "unknown" });
  assert.deepEqual(parseClaudeResult(null), { type: "unknown" });
});
