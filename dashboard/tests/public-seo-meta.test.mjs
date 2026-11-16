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
