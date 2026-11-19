import { publishedSlugs, SITE_ORIGIN } from "../lib/seo";
import { CONTENT_PAGES } from "../lib/seo/content";
import { listedVerticals } from "../lib/bys-verticals";
import { listPublishedSops } from "../lib/db";

// XML sitemap — the home page plus every PUBLISHED SEO page. Auto-updates as pages go live, so there's
// nothing to maintain by hand. Drafts / in-progress pages are never listed (they aren't public).
export const dynamic = "force-dynamic";

// Public marketing/intake routes that aren't DB-driven SEO slugs — they'd otherwise be missing from
// the sitemap even though they're linked from the homepage and footer.
// NOTE: /adt is deliberately NOT here — app/adt/page.jsx sets robots noindex, and listing a noindexed
// page in the sitemap just earns a "Submitted URL marked noindex" error in Search Console.
// NOTE: "build" is NOT listed here. Each BYS builder vertical now has its own title, description and
// self-canonical (lib/bys-verticals.js), so /build, /build/adt, /build/audio and /build/toast each go
// in on their own — they used to be one URL with four invisible duplicates behind it. /build/pos is
// excluded because it is not linked from /systems yet.
const STATIC_PUBLIC = ["systems", "apply", "report-issue", "terms", "guides"];

// The sitemap protocol demands W3C Datetime; SQLite hands us "2026-11-14 18:41:09", which Google
// rejected outright ("Sitemap can be read, but has errors — Invalid date") and then ignored the
// lastmod for that URL. Next serialises a Date correctly, so coerce to one. A space-separated
// stamp is Eastern wall time (the server is pinned to America/New_York), and ISO-without-zone
// parses as local time by spec, so swapping the space for a "T" dates it correctly.
function w3cDate(v) {
  if (!v) return undefined;
  if (v instanceof Date) return isNaN(v) ? undefined : v;
  const d = new Date(String(v).trim().replace(" ", "T"));
  return isNaN(d) ? undefined : d;
}

// Code-driven pages (home + the static routes) change when a deploy changes them, so the build
// stamp IS their last-modified. Without this they carried no lastmod at all.
const BUILT = w3cDate(process.env.BUILT_AT) || new Date();

export default function sitemap() {
  const home = { url: `${SITE_ORIGIN}/`, lastModified: BUILT, changeFrequency: "weekly", priority: 1 };
  const statics = STATIC_PUBLIC.map((slug) => ({ url: `${SITE_ORIGIN}/${slug}`, lastModified: BUILT, changeFrequency: "monthly", priority: 0.7 }));
  // The builder verticals that are linked from /systems. Each is its own indexable URL now.
  const builders = listedVerticals().map((v) => ({ url: `${SITE_ORIGIN}/${v.path}`, lastModified: BUILT, changeFrequency: "monthly", priority: 0.8 }));
  let pages = [];
  try {
    pages = publishedSlugs().map((p) => ({
      url: `${SITE_ORIGIN}/${p.slug}`,
      lastModified: w3cDate(p.published_at || p.updated_at),
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  } catch { /* DB not ready during build — ship at least the home entry */ }
  // Code-driven service / location / hub pages (lib/seo/content.js). They deploy with the repo, so the
  // build stamp is their last-modified. Skipped where a PUBLISHED seo_pages row owns the same slug —
  // the route serves the DB row there, and one URL must appear once.
  const dbSlugs = new Set(pages.map((p) => p.url));
  const content = CONTENT_PAGES
    .map((p) => ({
      url: `${SITE_ORIGIN}/${p.slug}`,
      lastModified: BUILT,
      changeFrequency: "monthly",
      priority: p.page_type === "hub" ? 0.8 : 0.9,
    }))
    .filter((p) => !dbSlugs.has(p.url));
  // Published PUBLIC guides (/guides/<slug>). Real, indexable content that was missing from the sitemap
  // entirely. Internal guides are excluded — they 404 for anyone who isn't signed-in staff.
  let guides = [];
  try {
    guides = listPublishedSops({ includeInternal: false })
      .filter((s) => s.slug)
      .map((s) => ({ url: `${SITE_ORIGIN}/guides/${s.slug}`, lastModified: w3cDate(s.published_at), changeFrequency: "monthly", priority: 0.6 }));
  } catch { /* DB not ready during build */ }
  return [home, ...statics, ...builders, ...content, ...pages, ...guides];
}
