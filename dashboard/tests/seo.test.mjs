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

// --- AI drafting: prompt contract + output normalization (no API calls) ---
import { buildPagePrompt, normalizeDraft } from "../lib/seo/generate.js";
import { provisionalQuality } from "../lib/seo.js";

test("generation prompt encodes fact-safety, the banned phrases, and the JSON contract", () => {
  const { system, user } = buildPagePrompt({
    page: { slug: "license-plate-reader-cameras", page_type: "service", title: "License Plate Reader Cameras", primary_keyword: "lpr camera installation nj" },
    facts: { "company.phone": "(646) 396-0775", "service_area.primary": "New Jersey; New York City" },
    instruction: "emphasize dealership lots",
  });
  assert.match(system, /ONLY state facts/i, "forbids inventing facts");
  assert.match(system, /peace of mind/i, "lists banned phrases");
  assert.match(system, /distance, speed, angle, lighting, lens/i, "LPR responsibility rule present");
  assert.match(user, /lpr camera installation nj/, "passes the target keyword");
  assert.match(user, /company\.phone: \(646\) 396-0775/, "passes verified facts");
  assert.match(user, /"needs_verification"/, "requires the needs_verification output field");
  assert.match(user, /emphasize dealership lots/, "includes the owner instruction");
});

test("normalizeDraft parses a model response and guards bad output", () => {
  assert.throws(() => normalizeDraft(null), /no JSON/);
  assert.throws(() => normalizeDraft({ h1: "x", body: [] }), /no body blocks/);
  const d = normalizeDraft({
    h1: "Commercial Security Cameras", meta_title: "x".repeat(90), meta_description: "y".repeat(200),
    primary_keyword: "commercial security cameras nj", secondary_topics: ["cctv", "nvr", "retention"],
    search_intent: "transactional", body: [{ type: "p", value: "Lead paragraph." }, { type: "bogus" }, { type: "h2", value: "Design" }],
    internal_link_suggestions: [{ anchor: "access control", to_topic: "commercial-access-control" }], needs_verification: ["1500+ locations"], notes: "ok",
  });
  assert.ok(d.meta_title.length <= 70 && d.meta_description.length <= 170, "meta clamped");
  assert.equal(d.body.filter((b) => b.type === "bogus").length, 1, "keeps unknown-typed blocks for the editor (renderer guards)");
  assert.deepEqual(d.needs_verification, ["1500+ locations"]);
  assert.equal(d.search_intent, "transactional");
});

test("provisionalQuality rewards a real draft and tanks placeholder text", () => {
  const good = { meta_title: "t", meta_description: "d", secondary_topics: ["a", "b", "c"],
    body: [{ type: "p", value: "A specific, useful paragraph about camera placement at dealership lots. ".repeat(12) }, { type: "h2", value: "Design" }, { type: "faq", items: [{ q: "q", a: "a" }] }], needs_verification: [] };
  assert.ok(provisionalQuality(good) >= 70, "a complete draft can reach the threshold");
  const bad = { meta_title: "t", body: [{ type: "p", value: "TODO write this. lorem ipsum ".repeat(30) }], needs_verification: ["x"] };
  assert.ok(provisionalQuality(bad) < 40, "placeholder text is penalized hard");
});

// --- AI fact-check: grounding-audit prompt + verdict normalization ---
import { buildFactCheckPrompt, normalizeFactCheck } from "../lib/seo/generate.js";

test("fact-check prompt audits grounding: flags unsupported claims, allows general guidance", () => {
  const { system, user } = buildFactCheckPrompt({
    page: { slug: "s", title: "T", meta_title: "m", meta_description: "d", body: [{ type: "p", value: "We serve 1500+ locations and reduced theft 40%." }] },
    facts: { "company.brand": "IOT TECHS", "service_area.primary": "New Jersey; New York City" },
  });
  assert.match(system, /GROUNDING/i, "frames it as grounding, not truth");
  assert.match(system, /number\/statistic|percentage|outcome/i, "targets numbers/outcomes");
  assert.match(system, /Do NOT flag: general industry knowledge/i, "leaves general guidance alone");
  assert.match(user, /1500\+ locations/, "includes the draft text to audit");
  assert.match(user, /company\.brand: IOT TECHS/, "includes the verified facts");
});

test("normalizeFactCheck: clean only with zero flags; otherwise review", () => {
  assert.equal(normalizeFactCheck({ verdict: "clean", flags: [] }).verdict, "clean");
  const r = normalizeFactCheck({ verdict: "clean", flags: [{ claim: "1500+ locations", category: "number", severity: "high", why: "not in facts" }] });
  assert.equal(r.verdict, "review", "a model saying clean but listing a flag is forced to review");
  assert.equal(r.flags.length, 1);
  assert.throws(() => normalizeFactCheck(null), /no JSON/);
});

// --- case study requires a real linked project ---
import { projectExists } from "../lib/seo.js";
test("projectExists gates case-study drafting to real projects", () => {
  assert.equal(projectExists("ASC0042"), true, "a seeded project exists");
  assert.equal(projectExists("ZZ-not-a-project"), false);
  assert.equal(projectExists(""), false);
  assert.equal(projectExists(null), false);
});
