// BYS Phase 0 seam guard — the /build widget (BYS shell) must load the cameras SPEC (catalog + pricing
// engine) from its own file, before the inline shell script, with CONFIG/Engine NOT re-inlined. This is
// the white-label seam: swap the spec file → a different vertical. Both are classic scripts sharing one
// global scope, so load order matters.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const widget = readFileSync(new URL("../public/widgets/cctv-quote-calculator.html", import.meta.url), "utf8");
const spec = readFileSync(new URL("../public/widgets/bys/cameras-spec.js", import.meta.url), "utf8");

test("the shell loads the vertical spec (by route) before its inline script, and never re-inlines CONFIG/Engine", () => {
  // The shell is vertical-agnostic: a bootstrap document.writes /widgets/bys/<vertical>-spec.js (from
  // /build/<vertical>, default cameras) BEFORE the inline shell script, so the spec's consts exist first.
  const bootIdx = widget.indexOf("document.write('<script src=\"/widgets/bys/' + v + '-spec.js");
  assert.ok(bootIdx >= 0, "a bootstrap document.writes /widgets/bys/<vertical>-spec.js");
  assert.ok(/match\(\/\\\/build\\\/\(\[a-z0-9-\]\+\)\/\)/.test(widget) || widget.includes("location.pathname"), "vertical is read from the /build/<vertical> path");
  assert.ok(/v = 'cameras'/.test(widget), "defaults to the cameras vertical");
  const inlineIdx = widget.indexOf("<script>", bootIdx);
  assert.ok(inlineIdx > bootIdx, "the bootstrap <script> comes before the inline shell <script> (load order)");
  assert.ok(!widget.includes("const CONFIG = {"), "CONFIG lives in the spec, not re-inlined in the shell");
  assert.ok(!widget.includes("const Engine = (() => {"), "Engine lives in the spec, not re-inlined in the shell");
});

test("the cameras spec is a classic script declaring the shared CONFIG + Engine the shell consumes", () => {
  assert.ok(spec.includes("const CONFIG = {") && spec.includes("catalog") && spec.includes("levels:"), "spec declares CONFIG (catalog + packages)");
  assert.ok(spec.includes("const Engine = (() => {") && spec.includes("return { compute, sizeStorage"), "spec declares the pricing Engine");
  assert.ok(!spec.includes('type="module"') && !/^\s*export\s/m.test(spec), "spec is a classic script (shares the shell's global scope), not an ES module");
});

test("the spec declares the vertical identity (brand + lead), and the shell reads it — not hard-coded", () => {
  assert.ok(/const SPEC = \{/.test(spec), "spec declares a SPEC identity object");
  assert.ok(spec.includes("id: 'cameras'"), "SPEC.id names the vertical");
  assert.ok(/title:\s*'Build Your CCTV System'/.test(spec), "SPEC.brand carries the <title>");
  assert.ok(/service:\s*'CCTV'/.test(spec) && /endpoint:\s*'\/api\/leads\/cctv'/.test(spec), "SPEC.lead carries the service + endpoint");
  // the shell reads SPEC (the hard-coded path/brand survive only as fallback defaults)
  assert.ok(widget.includes("SPEC.lead && SPEC.lead.endpoint"), "submitLead posts to SPEC.lead.endpoint");
  assert.ok(widget.includes("applySpecBranding") && widget.includes("SPEC.brand.title"), "the shell applies SPEC branding (title + header)");
});

test("step registry: the shell owns Intake + Quote bookends; the spec owns the config steps in between", () => {
  // the spec declares its config steps (the vertical-specific middle of the flow)
  for (const id of ["'features'", "'project'", "'system'"]) assert.ok(spec.includes(`id: ${id}`), `SPEC.steps includes ${id}`);
  assert.ok(/steps:\s*\[/.test(spec), "SPEC declares a steps array");
  // the shell assembles STEPS = Intake builtin + ...SPEC.steps + Quote builtin
  assert.ok(widget.includes("...((typeof SPEC !== 'undefined' && Array.isArray(SPEC.steps)) ? SPEC.steps : [])"), "shell splices SPEC.steps between the bookends");
  assert.ok(/id:'details', label:'Intake'/.test(widget) && /id:'quote',   label:'Quote'/.test(widget), "Intake + Quote remain shell built-ins");
  // the vertical config steps are no longer hard-coded in the shell's STEPS literal
  assert.ok(!/id:'system',\s*label:'System'/.test(widget), "the System step def lives in the spec, not the shell STEPS literal");
});

test("renderer contract (0.4): the shell dispatches R[t] || SPEC.render[t] and delegates unknown acts to SPEC.actions", () => {
  assert.ok(widget.includes("function pickRenderer(t){ return R[t] || (typeof SPEC !== 'undefined' && SPEC.render && SPEC.render[t]); }"), "shell resolves a renderer from R OR SPEC.render");
  assert.ok(widget.includes("pickRenderer(t)(slideOf(t), q, i)"), "renderStep dispatches via pickRenderer");
  assert.ok(widget.includes("SPEC.actions && SPEC.actions[act]){ SPEC.actions[act](v, a); break; }"), "the switch default delegates unknown acts to SPEC.actions, then re-renders");
  // Features moved to the spec; it's gone from the shell
  assert.ok(/SPEC_render\s*=\s*\{[\s\S]*features\(s, q, i\)/.test(spec), "the spec provides the Features renderer");
  assert.ok(/SPEC_actions\s*=\s*\{[\s\S]*feat\(v\)/.test(spec), "the spec provides the feat action");
  assert.ok(spec.includes("SPEC.render = SPEC_render") && spec.includes("SPEC.actions = SPEC_actions"), "spec exposes render + actions on SPEC");
  assert.ok(!/^  features\(s, q, i\)\{/m.test(widget), "the shell no longer defines R.features");
});
