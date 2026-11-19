// Every public page must carry its OWN title, description and canonical — and the sitemap must only list
// pages that are actually indexable.
//
// Two real regressions this freezes:
//   • /build (the camera builder) and /systems (the picker listing every builder) are different pages that
//     shipped the SAME <title> and description, so they competed with each other in search.
//   • /guides and /report-issue had no description at all and inherited the app's default
//     ("Track your project from survey to completion"), which described nothing and matched no query.
//   • /adt sets robots noindex but was listed in the sitemap — Search Console reports that as an error.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// Public routes → where their <head> actually comes from. Static files are served by the next.config
// rewrites; the rest are App Router pages whose `metadata` export supplies it.
const PAGES = [
  { route: "/",             file: "public/home.html",                            kind: "html" },
  { route: "/build",        file: "public/widgets/cctv-quote-calculator.html",   kind: "html" },
  { route: "/systems",      file: "public/bys-index.html",                       kind: "html" },
  { route: "/guides",       file: "app/guides/page.jsx",                         kind: "jsx" },
  { route: "/report-issue", file: "app/report-issue/page.jsx",                   kind: "jsx" },
  { route: "/apply",        file: "app/apply/page.jsx",                          kind: "jsx" },
  { route: "/terms",        file: "app/terms/page.jsx",                          kind: "jsx" },
];

// The app-wide fallback in app/layout.jsx. A page that still shows this never wrote its own.
const APP_DEFAULT_DESC = "Track your project from survey to completion";
const APP_DEFAULT_TITLE = "IOT TECHS · Project Dashboard";

function metaOf({ file, kind }) {
  const src = read(file);
  if (kind === "html") {
    return {
      title: (/<title>([^<]*)<\/title>/.exec(src) || [])[1]?.trim() || null,
      description: (/<meta name="description" content="([^"]*)"/.exec(src) || [])[1]?.trim() || null,
      canonical: (/<link rel="canonical" href="([^"]*)"/.exec(src) || [])[1] || null,
    };
  }
  const block = src.slice(src.indexOf("export const metadata"), src.indexOf("export default"));
  return {
    title: (/title:\s*"([^"]+)"/.exec(block) || [])[1] || null,
    description: (/description:\s*"([^"]+)"/.exec(block) || [])[1] || null,
    canonical: (/canonical:\s*"([^"]+)"/.exec(block) || [])[1] || null,
  };
}

test("every public page has its own title, description and canonical", () => {
  for (const page of PAGES) {
    const m = metaOf(page);
    assert.ok(m.title, `${page.route}: has a title`);
    assert.ok(m.description, `${page.route}: has a description`);
    assert.ok(m.canonical, `${page.route}: declares a canonical`);
    assert.notEqual(m.title, APP_DEFAULT_TITLE, `${page.route}: must not inherit the app's default title`);
    assert.notEqual(m.description, APP_DEFAULT_DESC, `${page.route}: must not inherit the app's default description`);
    assert.ok(m.title.length <= 75, `${page.route}: title is ${m.title.length} chars — Google truncates past ~70`);
    assert.ok(m.description.length >= 50 && m.description.length <= 185, `${page.route}: description is ${m.description.length} chars`);
  }
});

test("no two public pages share a title or a description", () => {
  for (const field of ["title", "description"]) {
    const seen = new Map();
    for (const page of PAGES) {
      const v = metaOf(page)[field]?.toLowerCase();
      if (!v) continue;
      assert.ok(!seen.has(v), `${page.route} and ${seen.get(v)} share the same ${field} — they compete in search`);
      seen.set(v, page.route);
    }
  }
});

test("each canonical points at that page's own route", () => {
  for (const page of PAGES) {
    const c = metaOf(page).canonical.replace("https://iot-techs.com", "") || "/";
    assert.equal(c === "" ? "/" : c, page.route, `${page.route}: canonical must be self-referential`);
  }
});

test("the sitemap lists only indexable pages", () => {
  const sitemap = read("app/sitemap.js");
  const listed = (/const STATIC_PUBLIC = \[([^\]]*)\]/.exec(sitemap) || [])[1] || "";
  const slugs = [...listed.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(slugs.length, "STATIC_PUBLIC is parsed");
  for (const slug of slugs) {
    const pageFile = path.join(root, "app", slug, "page.jsx");
    if (!fs.existsSync(pageFile)) continue;                      // rewritten static file, no robots meta
    assert.doesNotMatch(read(path.join("app", slug, "page.jsx")), /robots:\s*\{[^}]*index:\s*false/,
      `/${slug} is noindex — a noindexed page in the sitemap is a Search Console error`);
  }
  assert.ok(!slugs.includes("adt"), "/adt sets robots noindex, so it must stay out of the sitemap");
  assert.ok(slugs.includes("guides"), "/guides is real indexable content and belongs in the sitemap");
});

// ---------------------------------------------------------------------------
// Home-page claims. The site must not assert in marketing what its own Terms
// page or its own fact store contradicts. Each of these was live until 2026-11-19.
//
// Claim checks read the COPY A VISITOR SEES, not the raw file: the markup carries HTML comments
// that quote the old wording to explain why it changed, and those are not claims.
const homeCopy = () => read("public/home.html")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ");

test("the home page does not claim monitoring the Terms say we do not provide", () => {
  const home = homeCopy();
  const terms = read("app/terms/page.jsx");
  // Terms §8 is the authority: monitoring is third-party, optional, and not ours.
  assert.match(terms, /We are not the monitoring provider/, "Terms still disclaim being the monitoring provider");
  assert.match(terms, /third-party monitoring provider/, "Terms still describe monitoring as third-party");
  // So the hero may not say the systems we install are simply "monitored 24/7/365".
  assert.ok(!/monitored 24\/7\/365/.test(home),
    "the hero claims blanket monitoring; Terms §8 says monitoring is a third-party, optional add-on");
  // Where monitoring IS described, it must be attributed to the provider.
  const monitoringCopy = home.match(/[^<>]*monitoring[^<>]*/gi) || [];
  const described = monitoringCopy.filter((t) => /dispatch|central station|police|fire|EMS/i.test(t));
  assert.ok(described.length > 0, "the monitoring service card should still exist");
  for (const t of described) {
    assert.match(t, /ADT/, `monitoring copy must name the provider: "${t.trim().slice(0, 80)}"`);
  }
  // And it must not promise a response time the Terms expressly disclaim.
  assert.match(terms, /response times of the monitoring provider/, "Terms still disclaim response times");
  assert.ok(!/help is on the way fast/i.test(home), "that is a response-time promise the Terms disclaim");
});

test("the home page makes no unsubstantiable comparative claim", () => {
  const home = homeCopy();
  // Comparative superiority claims have to be provable. Puffery is fine; "fastest in the industry"
  // is a measurable comparison against every competitor, and nothing backs it.
  for (const re of [/fastest turnaround times in the industry/i,
                    /most advanced tools and the latest technology in the industry/i,
                    /it's the highest in the industry/i,
                    /\bbest in the industry\b/i,
                    /\b(cheapest|lowest priced) in the\b/i]) {
    assert.ok(!re.test(home), `the home page still makes an unprovable comparative claim: ${re}`);
  }
  // Absolute uptime guarantees, which the Terms also disclaim.
  assert.ok(!/registers never drop/i.test(home), "absolute uptime guarantee");
});

test("the Licensed & Insured badge is backed by a verified fact", () => {
  // The badge was live while company.licensing sat unverified in the fact store, so the site
  // asserted publicly what its own store refused to clear. The owner confirmed it on 2026-11-19;
  // the fact is now verified, which is what permits the badge to stay.
  const home = homeCopy();
  const schema = read("lib/seo/schema.js");
  if (/Licensed &amp; Insured|Licensed & Insured/.test(home)) {
    assert.match(schema, /confirmLicensingFact/, "the badge is shown, so company.licensing must be confirmed in the fact store");
    assert.match(schema, /key='company\.licensing'/);
    assert.match(schema, /verified=1, public_use_allowed=1/);
  }
  // A licence NUMBER is still not recorded anywhere, so the page must not cite one.
  assert.ok(!/licen[cs]e *#|lic\. *#/i.test(home), "no licence number is recorded — the page must not cite one");
});
