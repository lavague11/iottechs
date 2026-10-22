// Authorization for the AI command actions. The decision lives in one pure function (lib/ai-authz.js) that
// every server action in app/project/[accessId]/ai-actions.js runs first — so the rule is unit-testable
// without the Next request stack, and a drift check proves no action skips it. The AI command center is
// STAFF-ONLY (admin/manager/sales) and dark unless AI_COMMANDS is on.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiGate, aiStaff, AI_STAFF } from "../lib/ai-authz.js";

const STAFF = ["admin", "manager", "sales"];
const NON_STAFF = ["customer", "tech", "readonly", "vendor"];

test("only admin/manager/sales count as AI staff", () => {
  for (const r of STAFF) assert.ok(aiStaff(r), `${r} is staff`);
  for (const r of NON_STAFF) assert.ok(!aiStaff(r), `${r} is NOT staff`);
  assert.ok(!aiStaff(null) && !aiStaff("") && !aiStaff("ADMIN"), "null/blank/mismatched-case are not staff");
  assert.deepEqual([...AI_STAFF].sort(), ["admin", "manager", "sales"]);
});

test("aiGate: staff + flag on → allowed", () => {
  for (const role of STAFF) assert.deepEqual(aiGate({ role }, true), { ok: true }, `${role} allowed`);
});

test("aiGate: non-staff is refused even with the flag on (and can't tell the flag is on)", () => {
  for (const role of NON_STAFF) {
    const r = aiGate({ role }, true);
    assert.equal(r.ok, false);
    assert.equal(r.error, "Unauthorized.", `${role} → Unauthorized (role checked before flag)`);
  }
});

test("aiGate: an unauthenticated caller is refused", () => {
  for (const tok of [null, undefined, {}, { role: null }, { role: "" }]) {
    assert.deepEqual(aiGate(tok, true), { ok: false, error: "Unauthorized." });
  }
});

test("aiGate: nothing runs while the flag is off, even for staff", () => {
  for (const role of STAFF) assert.deepEqual(aiGate({ role }, false), { ok: false, error: "AI commands are off." });
  // a non-staff caller with the flag off still reads as Unauthorized (role first — no feature-state leak)
  assert.equal(aiGate({ role: "customer" }, false).error, "Unauthorized.");
  assert.equal(aiGate(null, false).error, "Unauthorized.");
});

test("drift: every exported AI server action authorizes before doing anything", () => {
  const src = readFileSync(new URL("../app/project/[accessId]/ai-actions.js", import.meta.url), "utf8");
  // the funnel is defined once and is the only authority
  assert.ok(/async function authorize\(\)\s*\{[\s\S]*?aiGate\(tok, flagOn\(\)\)/.test(src), "authorize() funnels through aiGate");
  assert.ok(/import \{ aiGate \} from "\.\.\/\.\.\/\.\.\/lib\/ai-authz"/.test(src), "imports the shared gate");
  assert.ok(!/new Set\(\["admin", "manager", "sales"\]\)/.test(src), "no ad-hoc role set left in the actions");

  // each exported action must gate: aiStatusAction via aiGate(...), the rest via authorize()
  const exported = [...src.matchAll(/export async function (\w+)\s*\(/g)].map((m) => m[1]);
  assert.ok(exported.length >= 5, `found ${exported.length} exported actions`);
  for (const name of exported) {
    const start = src.indexOf(`export async function ${name}`);
    const after = src.indexOf("export async function ", start + 1);
    const body = src.slice(start, after === -1 ? src.length : after);
    const gated = name === "aiStatusAction" ? /aiGate\(tok, flagOn\(\)\)/.test(body) : /const g = await authorize\(\);\s*\n\s*if \(!g\.ok\) return \{ error: g\.error \};/.test(body);
    assert.ok(gated, `${name} authorizes before acting`);
  }
});
