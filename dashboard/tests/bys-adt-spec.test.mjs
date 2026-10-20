// BYS vertical — "Build Your ADT System" (alarm / security). One spec file, no shell changes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adt = readFileSync(new URL("../public/widgets/bys/adt-spec.js", import.meta.url), "utf8");

test("adt spec declares the BYS contract: identity + steps, CONFIG, Engine, render, actions", () => {
  assert.ok(/const SPEC = \{[\s\S]*id: 'adt'/.test(adt), "SPEC.id = adt");
  assert.ok(/title: 'Build Your ADT System'/.test(adt) && /service: 'ADT'/.test(adt) && /endpoint: '\/api\/leads\/adt'/.test(adt), "adt brand + lead (ADT → AS service code)");
  for (const id of ["id:'essential'", "id:'smart'", "id:'pro'"]) assert.ok(adt.includes(id), `tier ${id}`);
  assert.ok(/name:'Secure'/.test(adt) && /name:'Smart Home'/.test(adt) && /name:'Total'/.test(adt), "adt tier display names");
  assert.ok(/panel:/.test(adt) && /door:/.test(adt) && /motion:/.test(adt) && /keypad:/.test(adt), "alarm catalog (panel + sensors + keypad)");
  assert.ok(adt.includes("const Engine = (() => {") && adt.includes("function compute(s)"), "adt pricing Engine");
  assert.ok(/adtqty\(v\)/.test(adt) && /adttoggle\(v\)/.test(adt) && /feat\(v\)/.test(adt), "actions: adtqty / adttoggle / feat");
  assert.ok(!adt.includes('type="module"') && !/^\s*export\s/m.test(adt), "classic script, not a module");
});
