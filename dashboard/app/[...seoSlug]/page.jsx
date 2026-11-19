import { notFound } from "next/navigation";
import { getPublishedPage, publicFacts, normalizeSlug, SITE_ORIGIN } from "../../lib/seo";
import { getContentPage, fillPage } from "../../lib/seo/content";
import { pageLdGraph } from "../../lib/seo/ld";

// Public SEO page surface. This root catch-all only ever receives paths NOT matched by a more specific
// route (every app/portal route wins first), so it serves published marketing pages at clean top-level
// slugs (e.g. /commercial-security-camera-installation). Anything without a PUBLISHED record 404s —
// drafts and in-progress pages are never reachable here. Content + metadata + schema come from the SEO
// store (lib/seo); structured data is built only from verified public facts.
export const dynamic = "force-dynamic";   // DB-backed; render at request time (ISR/caching comes later)

const slugOf = (p) => normalizeSlug((Array.isArray(p?.seoSlug) ? p.seoSlug.join("/") : p?.seoSlug) || "");

// Verified, public-use-cleared facts. Wrapped because a content page must render even if the database
// is unavailable — code pages carry their own content and only need the fact store for NAP.
function facts() {
  try { return publicFacts(); } catch { return {}; }
}

// Resolve a slug to a page record. PRECEDENCE: a PUBLISHED seo_pages row wins, so the SEO engine can
// supersede a code page without a deploy; otherwise the code-driven content page (lib/seo/content.js)
// serves. Nothing else is reachable here — drafts and opportunity rows stay invisible.
function resolve(slug, f) {
  if (!slug) return null;
  let db = null;
  try { db = getPublishedPage(slug); } catch { db = null; }
  if (db) return db;
  const code = getContentPage(slug);
  return code ? fillPage(code, f) : null;
}

export async function generateMetadata({ params }) {
  const slug = slugOf(await params);
  const page = resolve(slug, facts());
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
const HUB = { service: ["Services", "services"], industry: ["Industries", "industries"], location: ["Service Area", "locations"], "case-study": ["Case Studies", "case-studies"], resource: ["Resources", "resources"] };
function crumbs(page) {
  const out = [{ name: "Home", slug: "" }];
  const hub = HUB[page.page_type];
  if (hub) out.push({ name: hub[0], slug: hub[1] });
  out.push({ name: page.title, slug: page.slug });
  return out;
}

export default async function SeoPage({ params }) {
  const slug = slugOf(await params);
  const f = facts();
  const page = resolve(slug, f);
  if (!page) notFound();

  const faqBlocks = (page.body || []).filter((b) => b && b.type === "faq").flatMap((b) => b.items || []);
  const trail = crumbs(page);
  const graph = pageLdGraph(page, f, { breadcrumbs: trail, faqs: faqBlocks });

  // The old CTA pointed at /#contact, which does not exist — the home page's enquiry form is a
  // JS modal with no anchor, so that link silently dumped every visitor at the top of the home page.
  // Real, linkable conversion surfaces: the matching quote builder, and the phone.
  const cta = page.cta || { label: "Build a quote", href: "/build" };
  const phone = f["company.phone"] || "";
  const tel = phone ? `tel:${phone.replace(/\D/g, "")}` : null;

  return (
    <main className="seo-main">
      <style>{CSS}</style>
      {graph.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph.length === 1 ? graph[0] : graph).replace(/</g, "\\u003c") }} />
      )}

      <header className="seo-top">
        <a className="seo-brand" href="/" aria-label="IOT TECHS home">
          <img src="/logo.svg" alt="IOT TECHS" width="104" height="14" />
        </a>
        <span className="seo-top-act">
          {tel && <a className="seo-cta-sm" href={tel}>{phone}</a>}
          <a className="seo-cta-sm primary" href={cta.href}>{cta.label}</a>
        </span>
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
            <h2>Start with a site survey</h2>
            <p>We come to the property, mark every device position, and price the system from what is actually there.</p>
          </div>
          <span className="seo-foot-acts">
            <a className="seo-cta" href={cta.href}>{cta.label}</a>
            {tel && <a className="seo-cta ghost" href={tel}>{phone}</a>}
          </span>
        </aside>
      </article>

      <footer className="seo-footer">
        <span>IOT TECHS · La Vague Inc.</span>
        <span>
          {tel && <a href={tel}>{phone}</a>}
          {f["company.email"] && <> · <a href={`mailto:${f["company.email"]}`}>{f["company.email"]}</a></>}
        </span>
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
    // Internal links, rendered as real anchors with descriptive text. This is the block that keeps the
    // content set out of the orphan trap /report-issue fell into: every service and location page is
    // one click from a hub, and the hubs are linked from the home-page footer.
    case "links": return (
      <nav className="seo-links" aria-label={b.value || "Related"}>
        {b.value && <h2>{b.value}</h2>}
        <ul>
          {(b.items || []).filter((l) => l && l.to).map((l, i) => (
            <li key={i}>
              <a href={`/${String(l.to).replace(/^\/+/, "")}`}>{l.label || l.to}</a>
              {l.note && <span>{l.note}</span>}
            </li>
          ))}
        </ul>
      </nav>
    );
    // Default target is the camera quote builder, NOT the old /#contact — the home page's enquiry form
    // is a JS modal with no anchor, so /#contact silently dropped visitors at the top of the home page.
    case "cta": return <p><a className="seo-cta" href={b.href || "/build"}>{b.label || "Build a quote"}</a></p>;
    default: return b.value ? <p>{b.value}</p> : null;
  }
}

const CSS = `
.seo-main{--ink:#0d1420;--muted:#55627a;--line:#e6e9f0;--accent:#1f5fff;--paper:#fff;--soft:#f6f8fc;
  color:var(--ink);background:var(--paper);min-height:100vh;
  font-family:var(--font-sans),ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.65}
.seo-top{display:flex;align-items:center;justify-content:space-between;max-width:960px;margin:0 auto;padding:18px 20px;border-bottom:1px solid var(--line)}
.seo-brand{display:inline-flex;align-items:center;color:var(--ink);text-decoration:none}
.seo-brand img{display:block;height:14px;width:auto}
.seo-top-act{display:inline-flex;align-items:center;gap:8px}
.seo-cta-sm{font-size:13px;font-weight:600;color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:8px 13px;white-space:nowrap}
.seo-cta-sm.primary{background:var(--accent);border-color:var(--accent);color:#fff}
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
.seo-cta.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
.seo-foot-acts{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
.seo-foot-cta{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin:40px 0 0;padding:22px;background:var(--soft);border:1px solid var(--line);border-radius:14px}
.seo-foot-cta h2{margin:0 0 4px;font-size:19px}.seo-foot-cta p{margin:0;color:var(--muted);font-size:14.5px;max-width:48ch}
/* Internal-link blocks: two columns on desktop, one on a phone. */
.seo-links{margin:30px 0 16px}
.seo-links h2{font-size:23px;letter-spacing:-.01em;margin:0 0 10px}
.seo-links ul{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.seo-links li{background:var(--paper);padding:13px 15px;margin:0;display:flex;flex-direction:column;gap:3px}
.seo-links a{font-weight:600;font-size:15.5px;color:var(--accent);text-decoration:none}
.seo-links a:hover{text-decoration:underline}
.seo-links span{color:var(--muted);font-size:13.5px;line-height:1.5}
.seo-footer{max-width:760px;margin:30px auto 0;padding:18px 20px 40px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:13px}
.seo-footer a{color:var(--muted)}
/* On a phone the header keeps the PHONE, not the quote button: someone searching "security camera
   installation brooklyn" on a handset converts by tapping to call. The quote CTA is still in the body
   and in the footer block, so nothing is lost. */
@media (max-width:560px){.seo-article{padding:22px 16px}.seo-foot-cta{flex-direction:column;align-items:flex-start}
  .seo-top{padding:14px 16px}.seo-top-act .seo-cta-sm.primary{display:none}
  .seo-top-act .seo-cta-sm{background:var(--accent);border-color:var(--accent);color:#fff}
  .seo-foot-acts{width:100%}.seo-foot-acts .seo-cta{flex:1;text-align:center}}
`;
