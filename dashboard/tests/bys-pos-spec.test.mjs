// BYS second vertical — "Build Your POS System". Proves the white-label seam: the same shell + a different
// spec file. Guards the POS spec's contract surface and the shell robustness that made it vertical-agnostic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pos = readFileSync(new URL("../public/widgets/bys/pos-spec.js", import.meta.url), "utf8");
const widget = readFileSync(new URL("../public/widgets/cctv-quote-calculator.html", import.meta.url), "utf8");
const nextCfg = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");

test("pos spec declares the BYS contract: SPEC identity + steps, CONFIG, Engine, render, actions", () => {
  assert.ok(/const SPEC = \{[\s\S]*id: 'pos'/.test(pos), "SPEC.id = pos");
  assert.ok(/title: 'Build Your POS System'/.test(pos) && /service: 'POS'/.test(pos) && /endpoint: '\/api\/leads\/pos'/.test(pos), "POS brand + lead");
  for (const id of ["'capabilities'", "'hardware'"]) assert.ok(pos.includes(`id: ${id}`), `SPEC.steps has ${id}`);
  // reuses the shared Quote + recommendLevel machinery → tiers keyed essential/smart/pro, POS display names
  for (const id of ["id:'essential'", "id:'smart'", "id:'pro'"]) assert.ok(pos.includes(id), `tier ${id} (reuses recommendLevel/Quote)`);
  assert.ok(/name:'Starter'/.test(pos) && /name:'Standard'/.test(pos) && /name:'Pro Kitchen'/.test(pos), "POS tier display names");
  assert.ok(pos.includes("const CONFIG = {") && pos.includes("securityFeatures:"), "POS CONFIG with its own catalog + capability checklist");
  assert.ok(pos.includes("const Engine = (() => {") && pos.includes("function compute(s)"), "POS pricing Engine");
  assert.ok(/SPEC\.render = SPEC_render/.test(pos) && /SPEC\.actions = SPEC_actions/.test(pos), "exposes render + actions");
  assert.ok(/features\(s, q, i\)/.test(pos) && /system\(s, q, i\)/.test(pos), "POS renderers: Capabilities + Hardware");
  assert.ok(/posqty\(v\)/.test(pos) && /postoggle\(v\)/.test(pos) && /feat\(v\)/.test(pos), "POS actions: posqty / postoggle / feat");
  // classic script, shares the shell scope
  assert.ok(!pos.includes('type="module"') && !/^\s*export\s/m.test(pos), "pos spec is a classic script, not a module");
});

test("the shell is vertical-agnostic: /build/<vertical> route + guarded optional CONFIG.slides + per-vertical draft", () => {
  assert.ok(nextCfg.includes('source: "/build/:vertical"'), "next.config rewrites /build/<vertical> to the shell");
  assert.ok(widget.includes("(CONFIG.slides||[]).find"), "slideOf tolerates a spec without the legacy CONFIG.slides");
  assert.ok(widget.includes("(CONFIG.slides||[])[cur]"), "skipSlide tolerates a missing CONFIG.slides");
  assert.ok(widget.includes("STEPS.map((st,i)=>`<button class=\"ix"), "the index drawer iterates STEPS (the real flow), not legacy CONFIG.slides");
  assert.ok(widget.includes("'iot-bys-draft-' + ((typeof SPEC!=='undefined' && SPEC.id)"), "draft key is per-vertical (no cameras↔pos bleed)");
});
