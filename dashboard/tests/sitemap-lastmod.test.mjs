// Sitemap lastmod — Google reported "Sitemap can be read, but has errors: Invalid date" against the
// live site because app/sitemap.js piped SQLite's "2026-11-14 18:41:09" straight into <lastmod>, which
// is not W3C Datetime. These tests pin the coercion and the on-page SEO fixes shipped with it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const sitemap = read("app/sitemap.js");

// Lift the real w3cDate out of the source rather than re-implementing it, so a rename or a change in
// behaviour breaks this test instead of quietly passing against a stale copy.
const w3cDate = (() => {
  const i = sitemap.indexOf("function w3cDate(");
  assert.ok(i >= 0, "app/sitemap.js defines w3cDate");
  const body = sitemap.slice(i, sitemap.indexOf("\n}", i) + 2);
  return new Function(`${body}; return w3cDate;`)();
})();

test("a SQLite timestamp becomes a Date that serialises to W3C Datetime", () => {
  const d = w3cDate("2026-11-14 18:41:09");
  assert.ok(d instanceof Date, "returns a Date, not the raw string");
  // The exact failure Google flagged: a space where the T belongs, and no zone designator.
  const iso = d.toISOString();
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(!iso.includes(" "), "no space survives into the serialised date");
});

test("already-valid and empty values are handled without inventing a date", () => {
  assert.equal(w3cDate(null), undefined);
  assert.equal(w3cDate(""), undefined);
  assert.equal(w3cDate("not a date"), undefined, "garbage yields no lastmod rather than Invalid Date");
  assert.ok(w3cDate("2026-11-14T18:41:09Z") instanceof Date);
  const now = new Date();
  assert.equal(w3cDate(now).getTime(), now.getTime(), "a Date passes through");
});

test("every lastmod in the sitemap goes through w3cDate", () => {
  const lastmods = [...sitemap.matchAll(/lastModified:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  assert.ok(lastmods.length >= 3, "home, statics, SEO pages and guides all carry a lastmod");
  for (const v of lastmods) {
    assert.ok(/w3cDate\(|BUILT/.test(v), `lastmod "${v}" is coerced, not a raw DB string`);
  }
});

test("home and the static routes carry a lastmod at all", () => {
  // They shipped with none, so Google had no freshness signal for the most important URLs.
  // Match to end of line — a `}` also closes the ${SITE_ORIGIN} inside the template literal.
  const home = sitemap.match(/const home = .*/)[0];
  assert.match(home, /lastModified/);
  const statics = sitemap.match(/const statics = .*/)[0];
  assert.match(statics, /lastModified/);
});

test("the guide page is the page's H1 and its photos have real alt text", () => {
  const player = read("app/guides/[slug]/sop-player.jsx");
  assert.match(player, /<h1>\{sop\.title\}<\/h1>/, "the guide title is an H1, not a <b>");
  assert.match(player, /\.sopv \.ph h1\{/, "and it is styled so the header does not move");
  assert.ok(!/<img src=\{st\.img\} alt="" ?\/>/.test(player), "no empty alt on a content photo");
  assert.match(player, /alt=\{st\.title \? `\$\{sop\.title\} — \$\{st\.title\}`/);
  const list = read("app/guides/guides-client.jsx");
  assert.ok(!/src=\{s\.thumb\} alt=""/.test(list), "the guides index thumbnail has alt text too");
});

test("guides publish HowTo + breadcrumb schema, and internal guides publish none", () => {
  const page = read("app/guides/[slug]/page.jsx");
  assert.match(page, /"@type": "HowTo"/);
  assert.match(page, /"@type": "HowToStep"/);
  assert.match(page, /"@type": "BreadcrumbList"/);
  // The player shows one step at a time, so the schema is what carries the rest of the guide.
  assert.match(page, /step: steps\.map/);
  assert.match(page, /sop\.visibility === "internal" \? null/, "noindex guides get no schema");
  assert.match(page, /replace\(\/<\/g, "\\\\u003c"\)/, "JSON-LD is escaped against </script> injection");
});

test("the home page links to the pages that had no inbound links", () => {
  const home = read("public/home.html");
  assert.match(home, /href="\/report-issue"/, "/report-issue was a total orphan");
  assert.match(home, /href="\/guides"/, "/guides was reachable only from its own child");
  assert.ok(!/href="https:\/\/www\.iot-techs\.com"/.test(home), "no self-link through the www redirect");
});
