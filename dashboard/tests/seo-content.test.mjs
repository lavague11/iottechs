// Code-driven public content pages (lib/seo/content.js) — the service pages, the location pages and
// the two hubs, served through app/[...seoSlug]/page.jsx.
//
// These tests exist to stop the two ways this content set could quietly become a liability:
//   1. THIN / DUPLICATE LOCATION PAGES. A location page that swaps the city name into the same
//      paragraph is a doorway page; Google treats it as duplicate content and it drags the whole site
//      down. The dedupe tests below fail if the location pages share prose.
//   2. UNVERIFIED CLAIMS. The fact store (lib/seo/schema.js) deliberately marks "1500+ locations",
//      Port Authority, NYPD, licensing, pricing and warranty as NOT cleared for public use. A literal
//      typed into a content file would bypass that gate entirely, so the claim tests check for them.
// Plus the NAP rule: the public phone number lives in the fact store, never as a literal, which is what
// keeps the Zelle token (646) 396-0775 from ever reappearing as the published line.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CONTENT_PAGES, SERVICE_PAGES, LOCATION_PAGES, HUB_PAGES,
         getContentPage, contentSlugs, contentLinks, orphanContentPages,
         fillTokens, fillPage } from "../lib/seo/content.js";
import { serviceLd, pageLdGraph } from "../lib/seo/ld.js";
import { SEO_PAGE_TYPES } from "../lib/seo/schema.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// Every string a visitor can read on the page.
function pageText(p) {
  const out = [p.title, p.primary_topic, p.meta_title, p.meta_description];
  for (const b of p.body || []) {
    if (b.value) out.push(b.value);
    for (const it of b.items || []) {
      if (typeof it === "string") out.push(it);
      else out.push(it.q, it.a, it.label, it.note);
    }
  }
  return out.filter(Boolean).join(" ");
}
const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const paras = (p) => (p.body || []).filter((b) => b.type === "p").map((b) => b.value);

test("the content set is the 6 services, 3 locations and 2 hubs that were approved", () => {
  assert.equal(SERVICE_PAGES.length, 6);
  assert.equal(LOCATION_PAGES.length, 3);
  assert.equal(HUB_PAGES.length, 2);
  assert.equal(CONTENT_PAGES.length, 11);
  // /locations is the hub AND the "rest of NJ/NYC" service-area page, rather than a thin fourth city
  // page competing with the three deep ones.
  assert.ok(HUB_PAGES.some((p) => p.slug === "locations"));
  assert.ok(HUB_PAGES.some((p) => p.slug === "services"));
});

test("every page carries the fields the renderer and the publish gate need", () => {
  for (const p of CONTENT_PAGES) {
    assert.ok(p.slug && !p.slug.startsWith("/") && !p.slug.endsWith("/"), `${p.slug}: canonical slug`);
    assert.equal(p.slug, p.slug.toLowerCase(), `${p.slug}: lowercase`);
    assert.ok(SEO_PAGE_TYPES.includes(p.page_type), `${p.slug}: known page_type`);
    assert.ok(p.title, `${p.slug}: title (the H1)`);
    assert.ok(p.meta_title, `${p.slug}: meta title`);
    assert.ok(p.meta_description, `${p.slug}: meta description`);
    assert.ok(Array.isArray(p.body) && p.body.length, `${p.slug}: body blocks`);
    assert.ok(p.cta?.href && p.cta?.label, `${p.slug}: a real CTA`);
  }
});

test("titles and descriptions are inside the lengths Google will render", () => {
  for (const p of CONTENT_PAGES) {
    assert.ok(p.meta_title.length <= 60, `${p.slug}: meta_title ${p.meta_title.length} chars (>60 gets truncated)`);
    const d = p.meta_description.length;
    assert.ok(d >= 70 && d <= 170, `${p.slug}: meta_description ${d} chars (want 70-170)`);
  }
});

test("no two pages compete for the same slug or keyword", () => {
  const slugs = contentSlugs();
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique");
  const kws = CONTENT_PAGES.map((p) => p.primary_keyword).filter(Boolean);
  assert.equal(new Set(kws).size, kws.length, "primary keywords are unique — cannibalization is the point of publishGate's check");
});

test("the slugs match the engine's seeded plan, so a page is one URL and not two", () => {
  // lib/seo.js PLAN_PAGES seeds opportunity rows. If a code page used a different slug for the same
  // topic, the site would end up with two URLs competing for one keyword.
  const plan = read("lib/seo.js");
  for (const slug of ["services", "locations", "commercial-security-camera-installation",
                      "restaurant-technology-installation", "commercial-access-control",
                      "commercial-alarm-systems", "commercial-networking-wifi", "commercial-sound-systems"]) {
    assert.ok(plan.includes(`"${slug}"`), `PLAN_PAGES still seeds "${slug}"`);
    assert.ok(getContentPage(slug), `a content page serves /${slug}`);
  }
});

test("every page has enough real content to rank, not a stub", () => {
  for (const p of CONTENT_PAGES) {
    const n = words(pageText(p));
    assert.ok(n >= 350, `${p.slug}: only ${n} words — publishGate treats thin pages as unpublishable`);
  }
});

// ---- the doorway-page guard ------------------------------------------------
test("location pages share no prose — each one is about its own place", () => {
  const seen = new Map();
  for (const p of LOCATION_PAGES) {
    for (const para of paras(p)) {
      const prior = seen.get(para);
      assert.equal(prior, undefined, `/${p.slug} repeats a paragraph from /${prior} verbatim — that is a doorway page`);
      seen.set(para, p.slug);
    }
  }
});

test("each location page names its own area and its own local detail", () => {
  const own = {
    "security-camera-installation-union-nj": ["Union", "Route 22", "Vauxhall", "Union County", "Elizabeth"],
    "security-camera-installation-queens-ny": ["Queens", "Astoria", "Northern Boulevard", "Flushing", "Maspeth"],
    "security-camera-installation-brooklyn-ny": ["Brooklyn", "Williamsburg", "Gowanus", "Industry City", "Bushwick"],
  };
  for (const p of LOCATION_PAGES) {
    const text = pageText(p);
    for (const term of own[p.slug]) assert.ok(text.includes(term), `/${p.slug} should mention "${term}"`);
    assert.ok(p.areas?.length, `/${p.slug}: areas[] drives its Service schema areaServed`);
    assert.ok(p.location, `/${p.slug}: location name`);
    // The install-constraints section is the part that makes the page worth reading.
    assert.ok((p.body || []).some((b) => b.type === "h2" && /different about installing/i.test(b.value || "")),
      `/${p.slug}: needs its own "what is different about installing here" section`);
  }
});

test("the three location pages describe genuinely different install constraints", () => {
  const u = pageText(LOCATION_PAGES.find((p) => p.slug.includes("union")));
  const q = pageText(LOCATION_PAGES.find((p) => p.slug.includes("queens")));
  const b = pageText(LOCATION_PAGES.find((p) => p.slug.includes("brooklyn")));
  assert.ok(/lot lighting|open|pole/i.test(u) && /landlord/i.test(u), "Union: open Route 22 lots + strip-plaza landlord consent");
  assert.ok(/elevated|sidewalk shed|roll-down|gate/i.test(q), "Queens: elevated lines, sidewalk sheds, roll-down gates");
  assert.ok(/landmark/i.test(b) && /flood/i.test(b), "Brooklyn: landmarked districts + flood-zone recorder placement");
  // And the distinguishing details must NOT be copied across.
  assert.ok(!/landmark/i.test(q), "the landmarked-district constraint is Brooklyn's, not boilerplate");
  assert.ok(!/Route 22/i.test(b), "Route 22 is Union's, not boilerplate");
});

// ---- claim discipline -----------------------------------------------------
test("no content page publishes a claim the fact store has not cleared", () => {
  // These are seeded verified=0 / public_use_allowed=0 in lib/seo/schema.js, so publicFacts() withholds
  // them. A literal in a content file would route around that gate.
  const banned = [
    [/1500\+?|1,500/, "the unverified “1500+ locations” claim"],
    [/port authority/i, "the unverified Port Authority reference"],
    [/\bNYPD\b/i, "the unverified NYPD reference"],
    // "Licensed and insured" became an owner-confirmed, public-use fact on 2026-11-19, so the
    // statement itself is allowed now. Licence NUMBERS are still not recorded anywhere, so citing
    // one would be inventing it.
    [/licen[cs]e *#|lic\. *#|licen[cs]e (number|no\.)/i, "a licence number (company.licensing records the statement only, never a number)"],
    [/\bfree (estimate|quote|consultation)\b/i, "a “free” offer nothing verifies"],
    [/\b\d+\+? years\b|years of experience|since \d{4}/i, "a years-in-business claim"],
    [/\b(warranty|guaranteed) for \d+/i, "a warranty length (company.warranty_months is unverified)"],
    [/\$\d/, "a price (pricing facts need management approval)"],
    [/\b(24\/7|central station|professionally monitored) monitoring\b/i, "a monitored-service claim"],
  ];
  for (const p of CONTENT_PAGES) {
    const text = pageText(p);
    for (const [re, why] of banned) {
      assert.ok(!re.test(text), `/${p.slug} contains ${why}`);
    }
  }
});

test("the alarm and camera pages state the self-monitored model plainly", () => {
  // company.monitoring is verified, and it says we do NOT run a central station. Any page that talks
  // about alerts has to be straight about that or it is making a monitored-service claim by omission.
  for (const slug of ["commercial-alarm-systems", "commercial-security-camera-installation"]) {
    const text = pageText(getContentPage(slug));
    assert.match(text, /does not (run|operate) a central/i, `/${slug} must say we do not run a central station`);
  }
});

test("no phone number is written as a literal anywhere in the content files", () => {
  // NAP comes from the fact store so one edit in /dev/seo moves every page. A literal also risks the
  // Zelle token (646) 396-0775 being republished as the public line.
  for (const f of ["lib/seo/content.js", "lib/seo/content/services.js",
                   "lib/seo/content/locations.js", "lib/seo/content/hubs.js"]) {
    const src = read(f);
    assert.ok(!/\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}/.test(src), `${f} contains a literal phone number — use {{phone}}`);
    assert.ok(!/396-0775/.test(src), `${f} contains the Zelle token`);
  }
});

test("NAP tokens resolve from the fact store and nothing is mutated", () => {
  const facts = { "company.phone": "(917) 727-0081", "company.email": "support@iot-techs.com" };
  assert.equal(fillTokens("Call {{phone}}", facts), "Call (917) 727-0081");
  assert.equal(fillTokens("tel:{{phoneDigits}}", facts), "tel:9177270081");
  assert.equal(fillTokens("{{email}}", facts), "support@iot-techs.com");
  assert.equal(fillTokens("nothing here", facts), "nothing here");
  // Missing facts must not render the literal token to a visitor's screen.
  assert.equal(fillTokens("Call {{phone}}", {}), "Call ");

  const src = getContentPage("commercial-access-control");
  const filled = fillPage(src, facts);
  assert.equal(filled.cta.href, "tel:9177270081");
  assert.equal(src.cta.href, "tel:{{phoneDigits}}", "the shared module record is never mutated");
  assert.notEqual(filled, src);
  // No token survives into rendered output.
  assert.ok(!pageText(filled).includes("{{"), "every token in the body is substituted");
});

test("every page's tokens are substituted, across the whole set", () => {
  const facts = { "company.phone": "(917) 727-0081", "company.email": "support@iot-techs.com" };
  for (const p of CONTENT_PAGES) {
    const filled = fillPage(p, facts);
    assert.ok(!pageText(filled).includes("{{"), `/${p.slug} leaves an unsubstituted token`);
    assert.ok(!String(filled.cta.href).includes("{{"), `/${p.slug} leaves a token in its CTA href`);
  }
});

// ---- internal links -------------------------------------------------------
test("nothing in the content set is an orphan", () => {
  // /report-issue was a total orphan and the one sitemap URL Google would not index. Every page here is
  // linked from at least one other, and both hubs are linked from the home-page footer.
  assert.deepEqual(orphanContentPages(), [], "these content pages have no inbound internal link");
});

test("every internal link points at something that exists", () => {
  // Real non-content routes these pages are allowed to link to.
  const REAL_ROUTES = new Set(["report-issue", "guides", "build", "systems", "apply", "terms"]);
  const known = new Set(contentSlugs());
  const links = contentLinks();
  assert.ok(links.length >= 30, `only ${links.length} internal links — the graph should be denser`);
  for (const l of links) {
    assert.ok(known.has(l.to) || REAL_ROUTES.has(l.to), `/${l.from} links to /${l.to}, which does not exist`);
    assert.ok(l.anchor && l.anchor.length > 2, `/${l.from} → /${l.to} needs descriptive anchor text`);
  }
});

test("each hub links to every service and every location page", () => {
  const from = (slug) => new Set(contentLinks().filter((l) => l.from === slug).map((l) => l.to));
  const services = from("services"), locations = from("locations");
  for (const p of SERVICE_PAGES) {
    assert.ok(services.has(p.slug), `/services does not link /${p.slug}`);
    assert.ok(locations.has(p.slug), `/locations does not link /${p.slug}`);
  }
  for (const p of LOCATION_PAGES) {
    assert.ok(services.has(p.slug), `/services does not link /${p.slug}`);
    assert.ok(locations.has(p.slug), `/locations does not link /${p.slug}`);
  }
});

test("every location page links to all six services", () => {
  for (const p of LOCATION_PAGES) {
    const out = new Set(contentLinks().filter((l) => l.from === p.slug).map((l) => l.to));
    for (const s of SERVICE_PAGES) assert.ok(out.has(s.slug), `/${p.slug} does not link /${s.slug}`);
  }
});

test("the home page links the new pages, so none of them depends on the sitemap alone", () => {
  const home = read("public/home.html");
  for (const slug of ["services", "locations", "commercial-security-camera-installation",
                      "commercial-sound-systems", "commercial-networking-wifi",
                      "restaurant-technology-installation", "commercial-access-control",
                      "commercial-alarm-systems", "security-camera-installation-union-nj",
                      "security-camera-installation-queens-ny", "security-camera-installation-brooklyn-ny"]) {
    assert.ok(home.includes(`href="/${slug}"`), `the home page does not link /${slug}`);
  }
  // The footer grew a fifth column; the grid has to have grown with it.
  assert.match(home, /\.foot-grid\{display:grid;grid-template-columns:1\.5fr 1fr 1fr 1fr 1fr/);
});

// ---- schema ---------------------------------------------------------------
test("a location page's Service schema is scoped to that location", () => {
  const facts = { "company.brand": "IOT TECHS", "service_area.primary": "New Jersey; New York City" };
  const queens = getContentPage("security-camera-installation-queens-ny");
  const ld = serviceLd(queens, facts);
  const names = ld.areaServed.map((a) => a.name);
  assert.ok(names.includes("Queens, NY"), "areaServed is the page's own area");
  assert.ok(!names.includes("New Jersey"), "a Queens page must not claim the company-wide service area");
  // A service page with no own areas still falls back to the company-wide area.
  const svc = serviceLd(getContentPage("commercial-access-control"), facts);
  assert.deepEqual(svc.areaServed.map((a) => a.name), ["New Jersey", "New York City"]);
});

test("location pages get Service schema in the graph, and FAQ schema only with visible FAQs", () => {
  const facts = { "company.brand": "IOT TECHS", "service_area.primary": "New Jersey" };
  for (const p of [...SERVICE_PAGES, ...LOCATION_PAGES]) {
    const faqs = (p.body || []).filter((b) => b.type === "faq").flatMap((b) => b.items || []);
    assert.ok(faqs.length >= 4, `/${p.slug} should answer at least four real questions`);
    const graph = pageLdGraph(p, facts, { breadcrumbs: [{ name: "Home", slug: "" }, { name: p.title, slug: p.slug }], faqs });
    const types = graph.map((g) => g["@type"]);
    assert.ok(types.includes("Service"), `/${p.slug} emits Service schema`);
    assert.ok(types.includes("FAQPage"), `/${p.slug} emits FAQPage for its visible FAQs`);
    assert.ok(types.includes("BreadcrumbList"), `/${p.slug} emits BreadcrumbList`);
  }
});

// ---- wiring ---------------------------------------------------------------
test("the route serves code pages but lets a published DB row win", () => {
  const route = read("app/[...seoSlug]/page.jsx");
  assert.match(route, /getContentPage|fillPage/, "the route falls back to the code content module");
  // Precedence: the DB is consulted first and returned if it has a published row.
  assert.match(route, /try \{ db = getPublishedPage\(slug\); \} catch \{ db = null; \}/);
  assert.match(route, /if \(db\) return db;/, "a published seo_pages row supersedes the code page");
  assert.match(route, /case "links":/, "the links block renders real anchors");
  // The old CTA pointed at /#contact, an anchor that does not exist on the home page.
  assert.ok(!route.includes('"/#contact"'), "the dead /#contact CTA is gone");
  assert.match(route, /page\.cta/, "each page supplies its own CTA target");
  assert.match(route, /replace\(\/<\/g, "\\\\u003c"\)/, "JSON-LD is escaped against </script> injection");
});

test("the sitemap carries every content page exactly once, with a lastmod", () => {
  const src = read("app/sitemap.js");
  assert.match(src, /CONTENT_PAGES/, "the sitemap includes the code content pages");
  assert.match(src, /lastModified: BUILT/, "code pages use the build stamp");
  // A slug owned by a published DB row must not also be emitted as a code page.
  assert.match(src, /dbSlugs\.has\(p\.url\)/, "the sitemap de-duplicates DB vs code slugs");
  assert.match(src, /\.\.\.content/, "content entries are actually returned");
});

test("the content module stays pure, so it cannot drag sqlite into a test or the sitemap", () => {
  for (const f of ["lib/seo/content.js", "lib/seo/content/services.js",
                   "lib/seo/content/locations.js", "lib/seo/content/hubs.js"]) {
    const src = read(f);
    assert.ok(!/from "\.\.\/db|from "\.\/db|sqliteHandle|require\(/.test(src), `${f} must not reach for the database`);
  }
  // The local slug normaliser has to agree with lib/seo.js, which cannot be imported here (it opens a
  // sqlite handle at module load), so it is lifted out of the source instead.
  const seo = read("lib/seo.js");
  const i = seo.indexOf("export function normalizeSlug(");
  const body = seo.slice(i, seo.indexOf("\n}", i) + 2).replace("export ", "");
  const normalizeSlug = new Function(`${body}; return normalizeSlug;`)();
  for (const probe of ["/Services/", "LOCATIONS", "a//b", "  Commercial-Access-Control  "]) {
    assert.equal(getContentPage(probe)?.slug ?? normalizeSlug(probe), normalizeSlug(probe),
      `lookup normalises "${probe}" the same way lib/seo.js does`);
  }
  assert.ok(getContentPage("/Services/"), "a messy slug still resolves");
  assert.equal(getContentPage("does-not-exist"), null);
  assert.equal(getContentPage(""), null);
});

test("the street address is never rendered on these pages", () => {
  // The owner asked that the street address not be shown. The town is fine (it matches the GBP and is
  // worth having for local search); "120 Industrial Ave" is not.
  for (const p of CONTENT_PAGES) {
    assert.ok(!/120 Industrial|Industrial Ave/i.test(pageText(p)), `/${p.slug} shows the street address`);
  }
  // localBusinessLd must not have grown an address field either.
  assert.ok(!/streetAddress|PostalAddress/.test(read("lib/seo/ld.js")), "LocalBusiness schema still omits the street address");
});
