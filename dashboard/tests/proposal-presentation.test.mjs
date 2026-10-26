// Lane B (presentation-only) guards: the builder renders the payment plan from the ONE canonical schedule, never a
// hand-typed split, never a second "Deposit due" restatement, and the service section stays frameless.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planScheduleRows } from "../lib/proposal.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const builder = read("../app/project/[accessId]/proposal-builder.jsx");
const panel = read("../app/project/[accessId]/proposal-panel.jsx");

test("payment plan display derives from planScheduleRows over the current contract total", () => {
  assert.ok(/planSched\s*=\s*planScheduleRows\(plan, custRows, fin\.current/.test(builder), "one schedule source, current total");
  assert.ok(builder.includes("planSched.map"), "columns render from the schedule rows");
});

test("the Deposit-due / terms restatement is a fallback only (never beside a rendered schedule)", () => {
  const i = builder.indexOf("planSched.length === 0 && !(plan === \"custom\" && !readOnly) && (() =>");
  assert.ok(i > 0, "fallback row is gated on there being no schedule");
  assert.ok(builder.slice(i).includes("Deposit due"), "the fallback still exists for schedule-less plans");
});

test("canonical schedules the display must adapt to (no hard-coded 50/50)", () => {
  const amt = (rows) => rows.map((r) => r.amount);
  assert.deepEqual(amt(planScheduleRows("50_50", [], 1190)), [595, 595]);
  assert.deepEqual(amt(planScheduleRows("100_end", [], 1190)), [1190]);
  const t = planScheduleRows("50_30_20", [], 2000);
  assert.deepEqual(amt(t), [1000, 600, 400]);
  assert.deepEqual(t.map((r) => r.pctLabel), ["50%", "30%", "20%"]);
});

test("service section is frameless: no outer border / rounded shell / header band", () => {
  const rule = (sel) => (panel.match(new RegExp(sel.replace(/[.]/g, "\\.") + "\\{([^}]*)\\}")) || [])[1] || "";
  const svc = rule(".pvx .prop-svc");
  assert.ok(/border:none/.test(svc) && /border-radius:0/.test(svc), "prop-svc has no frame");
  assert.ok(/background:none/.test(rule(".pvx .prop-svc-head")), "service header has no shaded band");
});

test("total is typography, not a card", () => {
  const big = (panel.match(/\.pvx \.prop-total-big\{([^}]*)\}/) || [])[1] || "";
  assert.ok(/background:none/.test(big) && /border:0/.test(big), "no fill / border on the total");
});
