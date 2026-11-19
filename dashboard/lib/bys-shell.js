// Serves the BYS builder shell with per-vertical SEO applied. Kept apart from lib/bys-verticals.js so
// that module stays pure (fs lives here, the transform lives there and is unit-testable).
//
// One source file. public/widgets/cctv-quote-calculator.html is still the only copy of the 197KB
// application; this reads it once per process per vertical, applies the head substitutions, and caches
// the result with an ETag so browsers keep getting 304s exactly as they did when it was a static file.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyVerticalSeo } from "./bys-verticals.js";

const SHELL_PATH = path.join(process.cwd(), "public", "widgets", "cctv-quote-calculator.html");
const cache = new Map();   // vertical id -> { body, etag }

function render(v) {
  const hit = cache.get(v.id);
  if (hit) return hit;
  const { html, applied } = applyVerticalSeo(fs.readFileSync(SHELL_PATH, "utf8"), v);
  // If the shell is edited and a marker stops matching, the substitution silently no-ops and the page
  // quietly goes back to serving the camera metadata. Say so loudly rather than fail quietly; a test
  // covers the same thing at build time.
  for (const [k, ok] of Object.entries(applied)) {
    if (!ok) console.error(`[bys] "${k}" substitution did not match for vertical "${v.id}" — check SHELL_MARKERS against public/widgets/cctv-quote-calculator.html`);
  }
  const out = { body: html, etag: `"${crypto.createHash("sha1").update(html).digest("hex").slice(0, 20)}"` };
  cache.set(v.id, out);
  return out;
}

export function serveVertical(request, v) {
  let page;
  try {
    page = render(v);
  } catch (err) {
    // This page captures leads. Never 500 it: /quote is still a plain rewrite to the same static file,
    // and the shell's own loader honours ?vertical=, so the visitor still gets the right builder.
    console.error("[bys] could not render the builder shell:", err);
    return new Response(null, { status: 302, headers: { Location: `/quote?vertical=${encodeURIComponent(v.id)}`, "Cache-Control": "no-store" } });
  }
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: page.etag,
  };
  if (request.headers.get("if-none-match") === page.etag) return new Response(null, { status: 304, headers });
  return new Response(page.body, { status: 200, headers });
}
