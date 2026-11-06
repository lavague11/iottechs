// Proposal import — Claude reads the PDF into SYSTEMS (one section per system), customer-only, cost logged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeCandidate, importCandidateToPayload } from "../lib/proposal-reuse.js";

const route = readFileSync(new URL("../app/api/proposal-import/route.js", import.meta.url), "utf8");

const SAMPLE = {
  customer: "Fuel Gas Station Hub", customer_address: "12800 US-9W", customer_phone: null,
  systems: [
    { name: "System 1 — Store", coverage: "Store", cameras: 31, nvr: "32-Ch", storage: "5x8TB", total: 8885,
      items: [{ name: "4K Dome", qty: 20, unit_price: 200, total: 4000 }, { name: "NVR", qty: 1, unit_price: 4885, total: 4885, confidence: "low" }] },
    { name: "System 2 — Dining", cameras: 8, nvr: "8-Ch", storage: "1x8TB", total: 2287,
      items: [{ name: "Dome", qty: 8, unit_price: 200, total: 1600 }, { name: "NVR", qty: 1, unit_price: 687, total: 687 }] },
    { name: "System 3 — Canopy", cameras: 30, nvr: "32-Ch", storage: "3x8TB", total: 8811,
      items: [{ name: "Bullet", qty: 30, unit_price: 250, total: 7500 }, { name: "NVR", qty: 1, unit_price: 1311, total: 1311 }] },
  ],
  total: 19983,
};

test("normalizeCandidate keeps systems + flattens items (section=system) + customer fields", () => {
  const c = normalizeCandidate(SAMPLE);
  assert.equal(c.systems.length, 3, "3 systems");
  assert.equal(c.systems.reduce((s, x) => s + (x.cameras || 0), 0), 69, "69 cameras total");
  assert.equal(c.customer, "Fuel Gas Station Hub");
  assert.equal(c.customer_address, "12800 US-9W");
  assert.ok(c.items.length === 6 && c.items.every((it) => it.section), "items flattened with a section (system name)");
  assert.ok(c.items.some((it) => it.confidence === "low"), "low-confidence preserved");
});

test("importCandidateToPayload builds one section per system with correct totals", () => {
  const c = normalizeCandidate(SAMPLE);
  const payload = importCandidateToPayload(c, { serviceKey: "cctv" });
  const services = payload.options[0].services;
  assert.equal(services.length, 3, "3 sections");
  assert.ok(services[0].label.startsWith("System 1") && services[0].note.includes("31 cameras") && services[0].note.includes("NVR 32-Ch"), "section carries system name + camera/NVR/storage meta");
  const grand = services.reduce((a, s) => a + s.items.reduce((b, it) => b + (+it.qty || 0) * (+it.price || 0), 0), 0);
  assert.equal(grand, 19983, "sections sum to the grand total");
});

test("flat (no systems) candidate still works — one section", () => {
  const c = normalizeCandidate({ customer: "X", items: [{ name: "Cam", qty: 2, unit_price: 100, total: 200 }] });
  assert.equal(c.systems.length, 0);
  const payload = importCandidateToPayload(c);
  assert.equal(payload.options[0].services.length, 1, "legacy flat path = one section");
});

test("extraction route: Claude primary + native PDF, customer-only prompt, cost logged", () => {
  assert.ok(route.includes('const anthropic = secretValue("ANTHROPIC_API_KEY");') && route.indexOf("anthropic") < route.indexOf('secretValue("OPENAI_API_KEY")'), "Claude (Anthropic) is primary");
  assert.ok(route.includes('type: "document"') && route.includes("media_type: PDF"), "native PDF document input");
  assert.ok(/CUSTOMER ONLY/.test(route) && route.includes("NEVER return IOT TECHS"), "ignores IOT TECHS / La Vague, customer only");
  assert.ok(route.includes('"systems"') && route.includes("Detect EACH separate camera system"), "systems-aware prompt");
  assert.ok(route.includes("usage?.cost") && route.includes("Proposal import parsed") && route.includes("logProjectEvent"), "logs API cost per import");
});
