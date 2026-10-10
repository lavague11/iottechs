import { notFound } from "next/navigation";
import { getPublishedPage, publicFacts, linksTo, normalizeSlug, SITE_ORIGIN } from "../../lib/seo";
import { pageLdGraph } from "../../lib/seo/ld";

// Public SEO page surface. This root catch-all only ever receives paths NOT matched by a more specific
// route (every app/portal route wins first), so it serves published marketing pages at clean top-level
// slugs (e.g. /commercial-security-camera-installation). Anything without a PUBLISHED record 404s —
// drafts and in-progress pages are never reachable here. Content + metadata + schema come from the SEO
// store (lib/seo); structured data is built only from verified public facts.
export const dynamic = "force-dynamic";   // DB-backed; render at request time (ISR/caching comes later)

const slugOf = (p) => normalizeSlug((Array.isArray(p?.seoSlug) ? p.seoSlug.join("/") : p?.seoSlug) || "");

export async function generateMetadata({ params }) {
  const slug = slugOf(await params);
  const page = slug ? getPublishedPage(slug) : null;
  if (!page) return { title: "Not found", robots: { index: false, follow: false } };
  const url = `${SITE_ORIGIN}/${slug}`;
  const title = page.meta_title || page.title;
  const description = page.meta_description || undefined;
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, siteName: "IOT TECHS", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

// Breadcrumb trail: Home → hub (by page type) → this page. Used for the visible crumb + BreadcrumbList.
const HUB = { service: ["Services", "services"], industry: ["Industries", "industries"], location: ["Locations", "locations"], "case-study": ["Case Studies", "case-studies"], resource: ["Resources", "resources"] };
function crumbs(page) {
  const out = [{ name: "Home", slug: "" }];
  const hub = HUB[page.page_type];
  if (hub) out.push({ name: hub[0], slug: hub[1] });
  out.push({ name: page.title, slug: page.slug });
  return out;
}

export default async function SeoPage({ params }) {
  const slug = slugOf(await params);
  const page = slug ? getPublishedPage(slug) : null;
  if (!page) notFound();

  const facts = publicFacts();
  const faqBlocks = (page.body || []).filter((b) => b && b.type === "faq").flatMap((b) => b.items || []);
  const trail = crumbs(page);
  const graph = pageLdGraph(page, facts, { breadcrumbs: trail, faqs: faqBlocks });
  const inbound = linksTo(slug);   // (for later: related-link rendering)

  return (
    <main className="seo-main">
      <style>{CSS}</style>
      {graph.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph.length === 1 ? graph[0] : graph) }} />
      )}

      <header className="seo-top">
        <a className="seo-brand" href="/">IOT TECHS</a>
        <a className="seo-cta-sm" href="/#contact">Request a Site Survey</a>
      </header>

      <article className="seo-article">
        <nav className="seo-crumb" aria-label="Breadcrumb">
          {trail.map((c, i) => (
            <span key={i}>{i > 0 && <span className="sep">/</span>}
              {i < trail.length - 1 ? <a href={`/${c.slug}`}>{c.name}</a> : <span aria-current="page">{c.name}</span>}
            </span>
          ))}
        </nav>

        <h1 className="seo-h1">{page.title}</h1>
        {page.primary_topic && page.primary_topic !== page.title && <p className="seo-sub">{page.primary_topic}</p>}

        <div className="seo-body">{(page.body || []).map((b, i) => <Block key={i} b={b} />)}</div>

        <aside className="seo-foot-cta">
          <div>
            <h2>Plan your system</h2>
            <p>Request a site survey and a security assessment for your facility across New Jersey &amp; New York.</p>
          </div>
          <a className="seo-cta" href="/#contact">Request a Site Survey</a>
        </aside>
      </article>

      <footer className="seo-footer">
        <span>IOT TECHS · La Vague Inc.</span>
        <span>{facts["company.phone"]} · {facts["company.email"]}</span>
      </footer>
    </main>
  );
}

// Minimal, safe block renderer. Text is rendered as text (no raw HTML injection). Covers the blocks a
// money/industry/resource page needs; richer blocks can be added as Phase B authoring requires.
function Block({ b }) {
  if (!b) return null;
  if (typeof b === "string") return <p>{b}</p>;
  switch (b.type) {
    case "h2": return <h2>{b.value}</h2>;
    case "h3": return <h3>{b.value}</h3>;
    case "p": return <p>{b.value}</p>;
    case "callout": return <div className="seo-callout">{b.value}</div>;
    case "ul": return <ul>{(b.items || []).map((t, i) => <li key={i}>{t}</li>)}</ul>;
    case "ol": return <ol>{(b.items || []).map((t, i) => <li key={i}>{t}</li>)}</ol>;
    case "faq": return (
      <div className="seo-faq">
        {(b.items || []).map((x, i) => (
          <details key={i}><summary>{x.q}</summary><div>{x.a}</div></details>
        ))}
      </div>
    );
    case "cta": return <p><a className="seo-cta" href={b.href || "/#contact"}>{b.label || "Request a Quote"}</a></p>;
    default: return b.value ? <p>{b.value}</p> : null;
  }
}

const CSS = `
.seo-main{--ink:#0d1420;--muted:#55627a;--line:#e6e9f0;--accent:#1f5fff;--paper:#fff;--soft:#f6f8fc;
  color:var(--ink);background:var(--paper);min-height:100vh;
  font-family:var(--font-sans),ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.65}
.seo-top{display:flex;align-items:center;justify-content:space-between;max-width:960px;margin:0 auto;padding:18px 20px;border-bottom:1px solid var(--line)}
.seo-brand{font-weight:800;letter-spacing:.14em;font-size:15px;color:var(--ink);text-decoration:none}
.seo-cta-sm{font-size:13px;font-weight:600;color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:8px 13px}
.seo-article{max-width:760px;margin:0 auto;padding:30px 20px 10px}
.seo-crumb{font-size:12.5px;color:var(--muted);margin-bottom:18px}
.seo-crumb a{color:var(--muted);text-decoration:none}.seo-crumb a:hover{color:var(--accent)}
.seo-crumb .sep{margin:0 7px;color:#c3cad8}
.seo-h1{font-size:clamp(28px,4.4vw,42px);line-height:1.08;letter-spacing:-.02em;margin:0 0 10px}
.seo-sub{font-size:17px;color:var(--muted);margin:0 0 22px}
.seo-body>*{margin:0 0 16px}
.seo-body h2{font-size:23px;letter-spacing:-.01em;margin:30px 0 10px}
.seo-body h3{font-size:18px;margin:22px 0 8px}
.seo-body p{font-size:16.5px;color:#1c2636}
.seo-body ul,.seo-body ol{padding-left:22px}.seo-body li{margin:7px 0;font-size:16px}
.seo-body a{color:var(--accent)}
.seo-callout{background:var(--soft);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 10px 10px 0;padding:14px 18px;font-size:15.5px}
.seo-faq details{border-bottom:1px solid var(--line);padding:12px 0}
.seo-faq summary{font-weight:600;cursor:pointer;font-size:16px}
.seo-faq details>div{color:#33415a;margin-top:8px;font-size:15.5px}
.seo-cta{display:inline-block;background:var(--accent);color:#fff;font-weight:600;font-size:15px;text-decoration:none;border-radius:10px;padding:12px 20px}
.seo-foot-cta{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin:40px 0 0;padding:22px;background:var(--soft);border:1px solid var(--line);border-radius:14px}
.seo-foot-cta h2{margin:0 0 4px;font-size:19px}.seo-foot-cta p{margin:0;color:var(--muted);font-size:14.5px;max-width:48ch}
.seo-footer{max-width:760px;margin:30px auto 0;padding:18px 20px 40px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:13px}
@media (max-width:560px){.seo-article{padding:22px 16px}.seo-foot-cta{flex-direction:column;align-items:flex-start}}
`;
