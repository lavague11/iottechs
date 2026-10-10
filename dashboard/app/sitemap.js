import { publishedSlugs, SITE_ORIGIN } from "../lib/seo";

// XML sitemap — the home page plus every PUBLISHED SEO page. Auto-updates as pages go live, so there's
// nothing to maintain by hand. Drafts / in-progress pages are never listed (they aren't public).
export const dynamic = "force-dynamic";

export default function sitemap() {
  const home = { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 };
  let pages = [];
  try {
    pages = publishedSlugs().map((p) => ({
      url: `${SITE_ORIGIN}/${p.slug}`,
      lastModified: p.published_at || p.updated_at || undefined,
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  } catch { /* DB not ready during build — ship at least the home entry */ }
  return [home, ...pages];
}
