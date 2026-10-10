// SEO engine foundations: the fact store never leaks an unverified claim, the publish gate refuses an
// unsafe page, JSON-LD is built only from public facts, and the slug/priority helpers behave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allFacts, publicFacts, publishGate, priorityTier, normalizeSlug, QUALITY_THRESHOLD } from "../lib/seo.js";
import { organizationLd, localBusinessLd, serviceLd, faqLd, breadcrumbLd } from "../lib/seo/ld.js";

test("fact store seeds safe identity facts and withholds unverified claims", () => {
  const byKey = Object.fromEntries(allFacts().map((f) => [f.key, f]));
  assert.ok(byKey["company.brand"]?.verified === 1 && byKey["company.brand"]?.public_use_allowed === 1, "brand is verified + public");
  assert.ok(byKey["claim.locations"], "the 1500+ claim is recorded");
  assert.equal(byKey["claim.locations"].verified, 0, "…but NOT verified");
  assert.equal(byKey["claim.locations"].public_use_allowed, 0, "…and NOT cleared for public use");
  const pub = publicFacts();
  assert.equal(pub["company.brand"], "IOT TECHS");
  assert.equal(pub["company.phone"], "(646) 396-0775");
  assert.ok(!("claim.locations" in pub), "unverified claim never appears in publicFacts()");
  assert.ok(!("claim.port_authority" in pub), "Port Authority reference withheld until verified");
});

test("publish gate refuses an unsafe page and states why", () => {
  const thin = { slug: "x", title: "", meta_title: "", meta_description: "", body: [], fact_check_status: "pending", technical_check_status: "pending", quality_score: 0 };
  const r = publishGate(thin);
  assert.equal(r.ok, false);
  const gates = r.failures.map((x) => x.gate);
  for (const g of ["title", "meta", "content", "fact_check", "quality"]) assert.ok(gates.includes(g), `flags ${g}`);
});

test("publish gate blocks placeholder text and un-passed fact check even when long", () => {
  const body = [{ type: "p", value: "This is a long paragraph ".repeat(20) + " TODO finish this section." }];
  const r = publishGate({ slug: "svc/x", title: "Title", meta_title: "M", meta_description: "D", body, fact_check_status: "pending", technical_check_status: "pending", quality_score: 90, primary_keyword: "unit-test-kw-xyz" });
  const gates = r.failures.map((x) => x.gate);
  assert.ok(gates.includes("placeholder"), "catches TODO placeholder");
  assert.ok(gates.includes("fact_check"), "requires passed fact check");
  assert.equal(r.ok, false);
});

test("publish gate passes a complete, verified, quality page", () => {
  const body = [{ type: "p", value: "A genuinely useful, specific paragraph about commercial camera placement. ".repeat(6) }];
  const r = publishGate({ id: -999, slug: "commercial-security-camera-installation", page_type: "service", title: "Commercial Security Camera Installation",
    meta_title: "Commercial Security Cameras — NJ & NYC", meta_description: "Design and install for businesses across NJ and NYC.",
    body, fact_check_status: "passed", technical_check_status: "passed", quality_score: QUALITY_THRESHOLD + 5, primary_keyword: "unit-test-unique-kw-123" });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test("JSON-LD is built only from public facts (no unverified claim leaks in)", () => {
  const facts = publicFacts();
  const org = organizationLd(facts);
  assert.equal(org["@type"], "Organization");
  assert.equal(org.name, "IOT TECHS");
  const asText = JSON.stringify(org) + JSON.stringify(localBusinessLd(facts));
  assert.ok(!/1500\+|Port Authority|NYPD/i.test(asText), "no unverified claim appears in schema");
  const lb = localBusinessLd(facts);
  assert.equal(lb["@type"], "LocalBusiness");
  assert.ok(Array.isArray(lb.areaServed) && lb.areaServed.some((a) => /New Jersey/i.test(a.name)), "areaServed from verified service area");
});

test("serviceLd / faqLd / breadcrumbLd shape + empty-guards", () => {
  const s = serviceLd({ title: "Access Control", service: "access-control", slug: "commercial-access-control", meta_description: "x", page_type: "service" }, publicFacts());
  assert.equal(s["@type"], "Service");
  assert.equal(faqLd([]), null, "no FAQ schema without visible FAQs");
  assert.equal(faqLd([{ q: "How many cameras?", a: "It depends on entrances." }]).mainEntity.length, 1);
  assert.equal(breadcrumbLd([{ name: "Home", slug: "" }]), null, "breadcrumb needs ≥2 items");
  assert.equal(breadcrumbLd([{ name: "Services", slug: "services" }, { name: "Cameras", slug: "commercial-security-camera-installation" }]).itemListElement.length, 2);
});

test("helpers: priority tiers + slug normalization", () => {
  assert.equal(priorityTier(95), "P0");
  assert.equal(priorityTier(80), "P1");
  assert.equal(priorityTier(70), "P2");
  assert.equal(priorityTier(50), "P3");
  assert.equal(normalizeSlug("/New-Jersey/Union-County/"), "new-jersey/union-county");
  assert.equal(normalizeSlug("Commercial-Security-Camera-Installation"), "commercial-security-camera-installation");
});
