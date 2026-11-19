// Brand fonts are self-hosted. No page may fetch a webfont from a third party again.
//
// What this fixes: Hanken Grotesk and Bricolage Grotesque were loaded from fonts.googleapis.com —
// on the home page as a render-BLOCKING <link rel=stylesheet> (nothing painted until that
// third-party CSS returned), and inside five app components as a CSS `@import`, which is worse: the
// browser cannot discover it until the stylesheet containing it has been fetched and parsed, so the
// chain was our CSS → Google CSS → gstatic woff2, with DNS + TLS to two third parties in the middle.
// The 2026-11-19 audit measured ~2.1s of the home page's 3.1s LCP and ~1.7s on /report-issue.
//
// Serving them from our own origin removes both third-party connections and the CSS round-trip.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const FAMILIES = ["Hanken Grotesk", "Bricolage Grotesque"];
const FILES = [
  "fonts/hanken-grotesk-latin.woff2", "fonts/hanken-grotesk-latin-ext.woff2",
  "fonts/bricolage-grotesque-latin.woff2", "fonts/bricolage-grotesque-latin-ext.woff2",
];

// Walk the source we actually ship, skipping build output and dependencies.
function sourceFiles() {
  const out = [];
  const skip = new Set(["node_modules", ".next", ".git", "tests", "fonts"]);
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name).split(path.sep).join("/");
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(rel); continue; }
      if (/\.(html|css|jsx?|mjs)$/.test(e.name)) out.push(rel);
    }
  })(".");
  return out;
}

test("the font files are present and are real woff2", () => {
  for (const f of FILES) {
    const p = path.join(root, "public", f);
    assert.ok(fs.existsSync(p), `missing ${f} — the @font-face rules point at it`);
    const fd = fs.openSync(p, "r");
    const magic = Buffer.alloc(4);
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    assert.equal(magic.toString("latin1"), "wOF2", `${f} is not a woff2 file`);
    assert.ok(fs.statSync(p).size > 5000, `${f} is suspiciously small`);
  }
});

test("no shipped page fetches a webfont from a third party", () => {
  // lib/email.js is the one exception: it is an HTML EMAIL template, not a page. Mail clients mostly
  // strip or ignore webfont links, and it costs a recipient nothing at page-load time.
  const EXEMPT = new Set(["lib/email.js"]);
  const offenders = [];
  for (const f of sourceFiles()) {
    if (EXEMPT.has(f)) continue;
    for (const line of read(f).split("\n")) {
      // Ignore the comments that explain why this changed — they name the host deliberately.
      if (!/fonts\.(googleapis|gstatic)\.com/.test(line)) continue;
      if (/^\s*(\/\/|\/\*|\*|<!--)/.test(line.trim()) || /used to be pulled|This was a render-BLOCKING|These were pulled|this was an @import/i.test(line)) continue;
      offenders.push(`${f}: ${line.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(offenders, [], "these still load fonts from Google");
});

test("every family is declared once, globally, for the whole app", () => {
  const css = read("app/globals.css");
  for (const fam of FAMILIES) {
    assert.ok(css.includes(`font-family: '${fam}'`), `globals.css does not declare ${fam}`);
  }
  // Variable fonts: one face per subset must span the whole weight range the site uses (400-800),
  // otherwise a 700-weight heading silently synthesises a fake bold.
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  assert.equal(faces.length, 4, "two families x two subsets");
  for (const f of faces) {
    assert.match(f, /font-weight:\s*400 800/, "face does not span 400-800");
    assert.match(f, /font-display:\s*swap/, "face must keep swap — text paints in the fallback first");
    assert.match(f, /url\('\/fonts\//, "face must point at our own origin");
    assert.match(f, /unicode-range:/, "faces are subsetted; without a range the browser fetches both");
  }
  // globals.css has to actually reach every route.
  assert.match(read("app/layout.jsx"), /import "\.\/globals\.css"/);
});

test("the components that used an @import now rely on the global declaration", () => {
  for (const f of ["app/components/admin-shell.jsx", "app/my-projects/my-projects-client.jsx",
                   "app/project/[accessId]/gateway-client.jsx", "app/report-issue/report-issue-client.jsx",
                   "app/welcome/[appId]/welcome-client.jsx"]) {
    const s = read(f);
    assert.ok(!/@import url\(/.test(s), `${f} still has a CSS @import`);
    // They still USE the families — that is the point; they just no longer fetch them.
    assert.ok(FAMILIES.some((fam) => s.includes(fam)), `${f} no longer references the brand fonts at all`);
  }
});

test("a static page that uses the fonts also declares them", () => {
  // public/*.html is outside the Next CSS pipeline, so globals.css does not reach it. A file that
  // uses a family without declaring it would silently fall back to system sans.
  for (const f of sourceFiles().filter((p) => p.startsWith("public/") && p.endsWith(".html"))) {
    const s = read(f);
    const uses = FAMILIES.filter((fam) => new RegExp(`font-family:\\s*['"]?${fam}`).test(s));
    if (!uses.length) continue;
    for (const fam of uses) {
      assert.match(s, new RegExp(`@font-face[\\s\\S]{0,200}font-family:\\s*'${fam}'`),
        `${f} uses ${fam} but never declares it — it would fall back to system sans`);
    }
  }
});

test("the home page preloads the two faces the hero needs, and blocks on nothing", () => {
  const home = read("public/home.html");
  for (const f of ["fonts/bricolage-grotesque-latin.woff2", "fonts/hanken-grotesk-latin.woff2"]) {
    assert.match(home, new RegExp(`<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin>`),
      `${f} is not preloaded`);
  }
  // crossorigin is mandatory on a font preload: without it the browser fetches the file TWICE.
  const preloads = home.match(/<link rel="preload"[^>]*as="font"[^>]*>/g) || [];
  for (const p of preloads) assert.match(p, /crossorigin/, `font preload without crossorigin fetches twice: ${p}`);
  // And the render-blocking stylesheet is gone.
  assert.ok(!/<link[^>]+fonts\.googleapis\.com[^>]*rel="stylesheet"/.test(home));
  assert.ok(!/rel="preconnect"[^>]*fonts\./.test(home), "preconnects to Google are pointless now");
});

test("the fonts are redistributed with their licence, as OFL requires", () => {
  const lic = read("public/fonts/LICENSE.txt");
  for (const fam of FAMILIES) assert.ok(lic.includes(fam), `LICENSE.txt does not cover ${fam}`);
  assert.match(lic, /SIL Open Font License, Version 1\.1/);
  // The copyright lines are the part OFL actually requires to travel with the files.
  assert.match(lic, /Copyright 2021 The Hanken Grotesk Project Authors/);
  assert.match(lic, /Copyright 2022 The Bricolage Grotesque Project Authors/);
});
