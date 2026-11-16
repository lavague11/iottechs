import { publishedSlugs, SITE_ORIGIN } from "../lib/seo";
import { listPublishedSops } from "../lib/db";

// XML sitemap — the home page plus every PUBLISHED SEO page. Auto-updates as pages go live, so there's
// nothing to maintain by hand. Drafts / in-progress pages are never listed (they aren't public).
export const dynamic = "force-dynamic";

// Public marketing/intake routes that aren't DB-driven SEO slugs — they'd otherwise be missing from
// the sitemap even though they're linked from the homepage and footer.
// NOTE: /adt is deliberately NOT here — app/adt/page.jsx sets robots noindex, and listing a noindexed
// page in the sitemap just earns a "Submitted URL marked noindex" error in Search Console.
const STATIC_PUBLIC = ["systems", "build", "apply", "report-issue", "terms", "guides"];

export default function sitemap() {
  const home = { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 };
  const statics = STATIC_PUBLIC.map((slug) => ({ url: `${SITE_ORIGIN}/${slug}`, changeFrequency: "monthly", priority: 0.7 }));
  let pages = [];
  try {
    pages = publishedSlugs().map((p) => ({
      url: `${SITE_ORIGIN}/${p.slug}`,
      lastModified: p.published_at || p.updated_at || undefined,
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  } catch { /* DB not ready during build — ship at least the home entry */ }
  // Published PUBLIC guides (/guides/<slug>). Real, indexable content that was missing from the sitemap
  // entirely. Internal guides are excluded — they 404 for anyone who isn't signed-in staff.
  let guides = [];
  try {
    guides = listPublishedSops({ includeInternal: false })
      .filter((s) => s.slug)
      .map((s) => ({ url: `${SITE_ORIGIN}/guides/${s.slug}`, lastModified: s.published_at || undefined, changeFrequency: "monthly", priority: 0.6 }));
  } catch { /* DB not ready during build */ }
  return [home, ...statics, ...pages, ...guides];
}
