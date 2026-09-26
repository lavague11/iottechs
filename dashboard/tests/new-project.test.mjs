// New Project form rules (node --test): one canonical service list, the property/company rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_PROJECT_SERVICES, DEFAULT_NEW_PROJECT_SERVICE, SERVICE_CATALOG, propertyAfterCompany, serviceCodeFromText } from "../lib/spec.js";

test("one service list: every catalog service + ADT Monitoring, no duplicates, default is cameras", () => {
  const codes = NEW_PROJECT_SERVICES.map((s) => s.code);
  assert.deepEqual(new Set(codes).size, codes.length);
  for (const c of SERVICE_CATALOG) assert.ok(codes.includes(c.code), c.code);
  const adt = NEW_PROJECT_SERVICES.find((s) => s.code === "ADT");
  assert.equal(adt.module, "adt"); assert.equal(adt.label, "ADT Monitoring");
  assert.ok(NEW_PROJECT_SERVICES.filter((s) => s.module === "project").length === SERVICE_CATALOG.length);
  assert.equal(DEFAULT_NEW_PROJECT_SERVICE, "SC");
  // Every catalog label the form sends resolves back to its own code server-side (TEST 10).
  for (const c of SERVICE_CATALOG) assert.equal(serviceCodeFromText(c.label), c.code, c.label);
});

test("TEST 4/5/6: company auto-sets Commercial unless Property was picked by hand; clearing never flips to Residential", () => {
  assert.equal(propertyAfterCompany("commercial", false, ""), "commercial");          // modal opens → Commercial
  assert.equal(propertyAfterCompany("residential", false, "Crazy Cars"), "commercial"); // company entered → Commercial
  assert.equal(propertyAfterCompany("residential", true, "Crazy Cars"), "residential"); // manual override respected
  assert.equal(propertyAfterCompany("residential", true, "Crazy Cars Inc"), "residential"); // editing company afterwards doesn't force it back
  assert.equal(propertyAfterCompany("commercial", false, ""), "commercial");           // company cleared → still Commercial
  assert.equal(propertyAfterCompany("residential", true, ""), "residential");          // no company + manual Residential → residential
});
