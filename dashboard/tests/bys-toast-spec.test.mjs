// BYS fourth vertical — "Build Your Toast System" (Toast restaurant POS). One spec file, no shell changes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toast = readFileSync(new URL("../public/widgets/bys/toast-spec.js", import.meta.url), "utf8");

test("toast spec declares the BYS contract: identity + steps, CONFIG, Engine, render, actions", () => {
  assert.ok(/const SPEC = \{[\s\S]*id: 'toast'/.test(toast), "SPEC.id = toast");
  assert.ok(/title: 'Build Your Toast System'/.test(toast) && /service: 'TOAST'/.test(toast) && /endpoint: '\/api\/leads\/toast'/.test(toast), "toast brand + lead");
  for (const id of ["id:'essential'", "id:'smart'", "id:'pro'"]) assert.ok(toast.includes(id), `tier ${id}`);
  assert.ok(/name:'Starter'/.test(toast) && /name:'Growth'/.test(toast) && /name:'Full Service'/.test(toast), "toast tier display names");
  assert.ok(/Toast Flex terminal/.test(toast) && /Toast Go 2 handheld/.test(toast) && /Self-order kiosk/.test(toast) && /Toast Hub/.test(toast), "Toast hardware lineup");
  assert.ok(toast.includes("const Engine = (() => {") && toast.includes("function compute(s)"), "toast pricing Engine");
  assert.ok(/toastqty\(v\)/.test(toast) && /toasttoggle\(v\)/.test(toast) && /feat\(v\)/.test(toast), "actions: toastqty / toasttoggle / feat");
  assert.ok(!toast.includes('type="module"') && !/^\s*export\s/m.test(toast), "classic script, not a module");
});
