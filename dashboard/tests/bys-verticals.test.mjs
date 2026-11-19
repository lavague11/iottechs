// BYS builder verticals — per-vertical SEO on /build and /build/<vertical>.
//
// What broke before this: /build, /build/adt, /build/audio, /build/toast and /build/pos were all
// rewritten to ONE static file, so every one of them served the camera title, the camera description,
// and `<link rel="canonical" href="https://iot-techs.com/build">` — a canonical pointing somewhere
// else, which tells Google not to index the page it is on. Four working builders could never rank.
//
// These tests pin the three things that would silently bring it back:
//   1. the head markers still matching the real shell (a no-op substitution reverts every vertical to
//      the camera metadata without erroring),
//   2. the rewrites staying OUT of next.config.js (an afterFiles rewrite shadows the dynamic route),
//   3. the shell's applySpecBranding not overwriting the server-set <title> again.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BYS_VERTICALS, DEFAULT_VERTICAL, SHELL_MARKERS, SITE_ORIGIN,
         getVertical, listedVerticals, applyVerticalSeo } from "../lib/bys-verticals.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const SHELL = read("public/widgets/cctv-quote-calculator.html");

test("every vertical has a real spec file behind it", () => {
  assert.equal(BYS_VERTICALS.length, 5);
  for (const v of BYS_VERTICALS) {
    const p = `public/widgets/bys/${v.id}-spec.js`;
    assert.ok(fs.existsSync(path.join(root, p)), `${v.id}: ${p} must exist — the shell loads it by path`);
  }
});

test("each H1 is the spec's own brand.title, so the heading matches what the top bar renders", () => {
  for (const v of BYS_VERTICALS) {
    const spec = read(`public/widgets/bys/${v.id}-spec.js`);
    const m = spec.match(/brand:\s*\{[^}]*title:\s*'([^']+)'/);
    assert.ok(m, `${v.id}: could not read brand.title out of the spec`);
    assert.equal(v.h1, m[1], `${v.id}: H1 has drifted from the spec's brand.title`);
  }
});

test("titles, descriptions and canonicals are unique and the right length", () => {
  const titles = BYS_VERTICALS.map((v) => v.title);
  const paths = BYS_VERTICALS.map((v) => v.path);
  assert.equal(new Set(titles).size, titles.length, "duplicate titles were the original bug");
  assert.equal(new Set(paths).size, paths.length, "duplicate canonical paths");
  for (const v of BYS_VERTICALS) {
    assert.ok(v.title.length <= 60, `${v.id}: title ${v.title.length} chars (>60 truncates)`);
    const d = v.description.length;
    assert.ok(d >= 70 && d <= 170, `${v.id}: description ${d} chars (want 70-170)`);
    assert.ok(!v.path.startsWith("/") && !v.path.endsWith("/"), `${v.id}: canonical path form`);
  }
  assert.equal(DEFAULT_VERTICAL.id, "cameras");
  assert.equal(DEFAULT_VERTICAL.path, "build", "/build is the camera builder");
});

test("the shell's head markers still match the real file, and match exactly once", () => {
  // If any of these stops matching, applyVerticalSeo quietly no-ops and every vertical serves the
  // camera metadata again — with no error anywhere.
  for (const [name, re] of Object.entries(SHELL_MARKERS)) {
    assert.ok(re.test(SHELL), `the ${name} marker no longer matches public/widgets/cctv-quote-calculator.html`);
  }
  assert.equal(SHELL.match(/<link rel="canonical"/g).length, 1, "exactly one canonical to replace");
  assert.equal(SHELL.match(/<meta name="description"/g).length, 1, "exactly one description to replace");
  // There is a second literal "<title>" inside a JS comment; only the real element has a closing tag,
  // and the real one comes first, so a first-match replace is unambiguous.
  assert.equal(SHELL.match(/<title>[^<]*<\/title>/g).length, 1, "exactly one real <title> element");
  assert.equal(SHELL.match(/<body>/g).length, 1, "one <body> to inject the H1 after");
});

// Round-trip rather than re-implementing the escaper, so a bug in it is caught rather than mirrored.
// The descriptions contain "&" (NJ & NYC), which must reach the HTML as &amp;.
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

test("applying a vertical rewrites the head and injects the heading", () => {
  for (const v of BYS_VERTICALS) {
    const { html, applied } = applyVerticalSeo(SHELL, v);
    for (const [k, ok] of Object.entries(applied)) assert.ok(ok, `${v.id}: ${k} substitution did not apply`);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE_ORIGIN}/${v.path}">`), `${v.id}: self-canonical`);
    assert.equal(unesc(html.match(/<title>([^<]*)<\/title>/)[1]), v.title, `${v.id}: own title`);
    assert.equal(unesc(html.match(/<meta name="description" content="([^"]*)">/)[1]), v.description, `${v.id}: own description`);
    // An "&" must be encoded on the way in, never left raw.
    if (v.description.includes("&")) assert.ok(html.includes("NJ &amp; NYC") || html.includes("&amp;"), `${v.id}: & is escaped`);
    assert.ok(html.includes(`<h1 class="bys-h1">${v.h1}</h1>`), `${v.id}: own H1`);
    assert.ok(html.includes(`<meta property="og:url" content="${SITE_ORIGIN}/${v.path}">`), `${v.id}: og:url`);
    // Still exactly one of each afterwards — the replace must not have added a second.
    assert.equal(html.match(/<link rel="canonical"/g).length, 1);
    assert.equal(html.match(/<title>[^<]*<\/title>/g).length, 1);
    assert.equal(html.match(/<h1 /g).length, 1, `${v.id}: exactly one H1`);
  }
});

test("a non-camera vertical keeps none of the camera metadata", () => {
  const adt = applyVerticalSeo(SHELL, getVertical("adt")).html;
  assert.ok(!adt.includes('href="https://iot-techs.com/build"'), "the canonical no longer points at /build");
  assert.ok(!adt.includes("<title>Security Camera System Builder"), "the camera title is gone");
  assert.ok(!/content="Design your security camera system online/.test(adt), "the camera description is gone");
  // And the application itself is untouched: the body is the same size bar the head edits and the H1.
  assert.ok(adt.includes("applySpecBranding"), "the app script survives the transform");
  // The transform only ever ADDS (og tags, the sr-only H1) — it must never drop part of the app.
  assert.ok(adt.length >= SHELL.length, "the whole shell is still being served, not a fragment");
});

test("an unknown vertical resolves to nothing rather than falling back to cameras", () => {
  // The old behaviour served /build/anything as a 200 camera builder — a soft 404 that invites Google
  // to index unlimited junk URLs.
  assert.equal(getVertical("nope"), null);
  assert.equal(getVertical(""), null);
  assert.equal(getVertical(null), null);
  assert.equal(getVertical("../../etc/passwd"), null);
  assert.equal(getVertical("ADT").id, "adt", "lookup is case-insensitive");
  // /build/cameras must not be a second URL for /build; the route rejects any vertical whose path is
  // already "build".
  assert.equal(getVertical("cameras").path, "build");
  const route = read("app/build/[vertical]/route.js");
  assert.match(route, /v\.path === "build"/, "the route 404s /build/cameras as a duplicate of /build");
  assert.match(route, /status: 404/);
});

test("the /build rewrites are gone from next.config.js and must stay gone", () => {
  const cfg = read("next.config.js");
  assert.ok(!/source: "\/build"/.test(cfg), "/build is a route now, not a rewrite");
  assert.ok(!/source: "\/build\/:vertical"/.test(cfg),
    "a /build/:vertical rewrite is afterFiles, which is matched BEFORE dynamic routes — it would shadow app/build/[vertical] entirely");
  // /quote stays a rewrite: it is the plain shell and the route handler's fallback target.
  assert.match(cfg, /source: "\/quote"/);
  assert.ok(fs.existsSync(path.join(root, "app/build/route.js")));
  assert.ok(fs.existsSync(path.join(root, "app/build/[vertical]/route.js")));
});

test("the shell no longer overwrites the server-set title on every load", () => {
  // applySpecBranding used to do `document.title = SPEC.brand.title` unconditionally. Google renders
  // JS, so that replaced the real SEO title with the short label and undid the whole fix.
  assert.ok(!/if\(SPEC\.brand\.title\) document\.title/.test(SHELL),
    "the unconditional document.title assignment is back — it overrides the per-vertical SEO title");
  assert.match(SHELL, /URLSearchParams\(location\.search\)\.get\('vertical'\)\) document\.title/,
    "the spec label is only used when the vertical came from ?vertical=");
  // The brand text is still spec-driven.
  assert.match(SHELL, /b\.textContent = SPEC\.brand\.company/);
});

test("the shell never 500s: the serving helper falls back instead of throwing", () => {
  const helper = read("lib/bys-shell.js");
  assert.match(helper, /catch \(err\)/, "a failed read is caught");
  assert.match(helper, /\/quote\?vertical=/, "the fallback keeps the right builder via the query form");
  assert.match(helper, /status: 302/);
  assert.match(helper, /ETag/, "ETags preserve the 304s the static file used to get");
  assert.match(helper, /status: 304/);
});

test("the sitemap carries each listed builder on its own, and not /build/pos", () => {
  const listed = listedVerticals().map((v) => v.path);
  assert.deepEqual(listed, ["build", "build/adt", "build/audio", "build/toast"]);
  assert.ok(!listed.includes("build/pos"), "POS is not linked from /systems, so it is not promoted");
  const src = read("app/sitemap.js");
  assert.match(src, /listedVerticals/, "the sitemap builds the builder entries from the one list");
  assert.match(src, /\.\.\.builders/, "and actually returns them");
  assert.ok(!/"systems", "build",/.test(src), "'build' is no longer a hand-listed static slug");
});

test("every listed builder is linked from /systems, so none is an orphan", () => {
  const picker = read("public/bys-index.html");
  for (const v of listedVerticals()) {
    assert.ok(picker.includes(`href="/${v.path}"`), `/systems does not link /${v.path}`);
  }
  // And each non-camera builder is the CTA of its matching service page.
  const services = read("lib/seo/content/services.js");
  for (const p of ["/build/adt", "/build/audio", "/build/toast"]) {
    assert.ok(services.includes(`"${p}"`), `no service page sends anyone to ${p}`);
  }
});
