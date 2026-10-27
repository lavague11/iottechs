// Catalog + configuration scoping (data-correctness, guarded by drift tests since these are .jsx UI):
// a service editor only offers its OWN service's catalog, and Proposal Configuration only surfaces the
// services actually in the proposal. Both by canonical service id, never by name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("inline catalog autocomplete is scoped to the current service by canonical id", () => {
  const src = read("../app/project/[accessId]/proposal-items-editor.jsx");
  assert.ok(/allCatalog\.filter\(\(c\) => c\.service === currentService && c\.name\.toLowerCase\(\)\.includes\(needle\)\)/.test(src),
    "matches filter by c.service === currentService BEFORE the name match (no cross-service results)");
  assert.ok(!/const others = hits\.filter/.test(src), "the old cross-service 'others' bucket is gone");
  assert.ok(!/prop-name-opt-svc/.test(src), "the redundant service label is dropped from the scoped dropdown");
});

test("allCatalogEntries tags every item with its canonical service", () => {
  const prop = read("../lib/proposal.js");
  assert.ok(/flatMap\(\(s\) => effectiveCatalog\(s\.key, b\)\.map\(\(c\) => \(\{ \.\.\.c, service: s\.key \}\)\)\)/.test(prop),
    "each catalog entry carries service: s.key");
});

test("Proposal Configuration is handed only the proposal's active services", () => {
  const builder = read("../app/project/[accessId]/proposal-builder.jsx");
  assert.ok(/const activeServices = useMemo\(\(\) => \{[\s\S]*?PROPOSAL_SERVICES\.filter\(\(s\) => keys\.has\(s\.key\)\)/.test(builder),
    "activeServices derives from the payload's option services (union)");
  assert.ok(/<ProposalConfig[\s\S]*?services=\{activeServices\}/.test(builder), "and is passed to ProposalConfig");
});

test("ProposalConfig: Pricing (service-scoped), Presets, Conditions — no redundant Default Pricing tab", () => {
  const pricing = read("../app/project/[accessId]/proposal-pricing.jsx");
  assert.ok(/const svcKeys = services\.map\(\(s\) => s\.key\)/.test(pricing), "derives the active service keys");
  assert.ok(!/>Default Pricing</.test(pricing), "the redundant Default Pricing tab is removed");
  assert.ok(/tab === "service"/.test(pricing) && /scopeKey=\{svc\}/.test(pricing), "Pricing is scoped to the selected service");
  assert.ok(/tab === "conditions" && <ConditionEditor/.test(pricing), "a Conditions tab is present");
  assert.ok(/svcKeys\.includes\(startService\) \? startService : \(svcKeys\[0\]/.test(pricing), "the selected service is always a valid active one");
  assert.ok(/No services in this proposal yet/.test(pricing), "a blank proposal shows an empty state, not every service");
  // sectionsFor still accepts an array of keys (scoped) as well as one / all
  assert.ok(/const keys = Array\.isArray\(scope\) \? scope : scope \? \[scope\] : PROPOSAL_SERVICES\.map/.test(pricing),
    "sectionsFor handles a scoped key array");
});
