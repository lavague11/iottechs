import { SITE_ORIGIN } from "../lib/seo";

// robots.txt — allow the public marketing surface; keep the internal app, customer portal, APIs, and
// auth paths out of the index. The SEO pages live at clean top-level slugs and are allowed by default.
export default function robots() {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/", "/dashboard", "/project/", "/my-projects", "/login", "/forgot", "/onboarding",
        "/dev", "/dev/", "/manager", "/sales", "/tech", "/customers", "/finances", "/expenses",
        "/inventory", "/tickets", "/notifications", "/activity", "/operations", "/service-calls",
        "/id-scan", "/face-verify", "/identity", "/enroll", "/compliance", "/assessment",
        "/apply", "/application", "/hiring", "/adt", "/pcp", "/portal", "/go", "/liveness", "/migrate",
      ],
    }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
