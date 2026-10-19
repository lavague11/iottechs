// BYS discoverability — a public picker at /systems lists every builder, linked from the homepage.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../public/bys-index.html", import.meta.url), "utf8");
const nextCfg = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../public/home.html", import.meta.url), "utf8");

test("the /systems picker links to all four builders", () => {
  for (const href of ['href="/build"', 'href="/build/pos"', 'href="/build/audio"', 'href="/build/toast"']) {
    assert.ok(index.includes(href), `picker links ${href}`);
  }
  assert.ok(/Camera System/.test(index) && /POS System/.test(index) && /Sound System/.test(index) && /Toast System/.test(index), "all four named");
  assert.ok(nextCfg.includes('source: "/systems"') && nextCfg.includes('destination: "/bys-index.html"'), "/systems rewrites to the picker");
});

test("the homepage surfaces the picker", () => {
  assert.ok(home.includes('href="/systems"') && /Build Your System/.test(home), "homepage has a Build Your System CTA → /systems");
});
