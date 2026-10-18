// BYS Phase 0 seam guard — the /build widget (BYS shell) must load the cameras SPEC (catalog + pricing
// engine) from its own file, before the inline shell script, with CONFIG/Engine NOT re-inlined. This is
// the white-label seam: swap the spec file → a different vertical. Both are classic scripts sharing one
// global scope, so load order matters.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const widget = readFileSync(new URL("../public/widgets/cctv-quote-calculator.html", import.meta.url), "utf8");
const spec = readFileSync(new URL("../public/widgets/bys/cameras-spec.js", import.meta.url), "utf8");

test("the shell loads the cameras spec before its inline script, and never re-inlines CONFIG/Engine", () => {
  const specIdx = widget.indexOf('<script src="/widgets/bys/cameras-spec.js');
  assert.ok(specIdx >= 0, "loads the spec by ABSOLUTE path (resolves under the /build + /quote rewrites, not just /widgets/)");
  const inlineIdx = widget.indexOf("<script>", specIdx);
  assert.ok(inlineIdx > specIdx, "the spec <script src> comes before the inline shell <script> (shared-scope load order)");
  assert.ok(!widget.includes("const CONFIG = {"), "CONFIG lives in the spec, not re-inlined in the shell");
  assert.ok(!widget.includes("const Engine = (() => {"), "Engine lives in the spec, not re-inlined in the shell");
});

test("the cameras spec is a classic script declaring the shared CONFIG + Engine the shell consumes", () => {
  assert.ok(spec.includes("const CONFIG = {") && spec.includes("catalog") && spec.includes("levels:"), "spec declares CONFIG (catalog + packages)");
  assert.ok(spec.includes("const Engine = (() => {") && spec.includes("return { compute, sizeStorage"), "spec declares the pricing Engine");
  assert.ok(!spec.includes('type="module"') && !/^\s*export\s/m.test(spec), "spec is a classic script (shares the shell's global scope), not an ES module");
});
