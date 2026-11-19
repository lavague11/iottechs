// Code-driven public content pages — the registry. PURE: no DB import, so it is safe to use from a
// test, a script or the edge without opening sqlite.
//
// WHY CODE AND NOT THE seo_pages TABLE. The SEO engine stores pages in the app database, which is
// per-environment: a page authored in /dev/seo on a laptop exists only on that laptop, and production's
// seo_pages is empty. Content that must actually be live has to ship with the repo. So these pages are
// code — diffable, reviewable, covered by tests, deployed by the same push as everything else.
//
// The engine is NOT replaced. app/[...seoSlug]/page.jsx asks the DB first: a PUBLISHED seo_pages row at
// the same slug always wins over the record here, so an AI-drafted page that clears publishGate() can
// supersede a code page without a deploy. The slugs here deliberately match lib/seo.js PLAN_PAGES, so
// the engine's seeded opportunity rows and these pages are one URL rather than two competing ones.
//
// NAP IS NEVER A LITERAL. Pages write {{phone}}, {{phoneDigits}} or {{email}} and the renderer
// substitutes from publicFacts() (verified + public-use-cleared). That keeps the fact store the single
// source of truth for the public phone number, which is the rule that stops the old Zelle payment
// number ever reappearing as the published line. tests/seo-content.test.mjs fails if any phone number
// is typed into a content file as a literal — including in a comment like this one.
import { SERVICE_PAGES } from "./content/services.js";
import { LOCATION_PAGES } from "./content/locations.js";
import { HUB_PAGES } from "./content/hubs.js";

export { SERVICE_PAGES, LOCATION_PAGES, HUB_PAGES };

// Hubs first so /services and /locations lead the sitemap; then money pages, then locations.
export const CONTENT_PAGES = [...HUB_PAGES, ...SERVICE_PAGES, ...LOCATION_PAGES];

// Same canonical form as normalizeSlug() in lib/seo.js (asserted equal in tests — lib/seo.js can't be
// imported here because it opens a sqlite handle at module load).
const norm = (slug) => String(slug || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");

const BY_SLUG = new Map(CONTENT_PAGES.map((p) => [norm(p.slug), p]));

export function getContentPage(slug) { return BY_SLUG.get(norm(slug)) || null; }
export function contentSlugs() { return CONTENT_PAGES.map((p) => norm(p.slug)); }

// ---- NAP tokens -----------------------------------------------------------
// Only these three. Anything else stays literal, so a typo surfaces as visible text in review rather
// than silently rendering an empty string.
export function fillTokens(str, facts = {}) {
  if (typeof str !== "string" || !str.includes("{{")) return str;
  const phone = facts["company.phone"] || "";
  return str
    .replace(/\{\{phoneDigits\}\}/g, phone.replace(/\D/g, ""))
    .replace(/\{\{phone\}\}/g, phone)
    .replace(/\{\{email\}\}/g, facts["company.email"] || "");
}

// Deep-fill every string in a page record (block values, list items, FAQ q/a, link labels, CTA href).
// Returns a new object; the module-level records are never mutated, which matters because they are
// shared across requests in a long-lived server process.
export function fillPage(page, facts = {}) {
  const walk = (v) => {
    if (typeof v === "string") return fillTokens(v, facts);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return page ? walk(page) : page;
}

// ---- Internal-link graph --------------------------------------------------
// Every "links" block in every page, as { from, to, anchor }. Used by the orphan test and available for
// a future merge with the DB-backed seo_links graph.
export function contentLinks() {
  const out = [];
  for (const p of CONTENT_PAGES) {
    for (const b of p.body || []) {
      if (b?.type !== "links") continue;
      for (const l of b.items || []) if (l?.to) out.push({ from: norm(p.slug), to: norm(l.to), anchor: l.label || "" });
    }
  }
  return out;
}

// Content pages with no inbound link from any other content page. The home-page footer links the two
// hubs, so a page reachable from a hub is reachable from the site.
export function orphanContentPages() {
  const linked = new Set(contentLinks().map((l) => l.to));
  return contentSlugs().filter((s) => !linked.has(s));
}
