// JSON-LD builders — PURE (no DB). Fed only `publicFacts()` (verified + public-use-cleared) so an
// unverified claim can never reach structured data. Each builder omits any field it doesn't have a
// value for, and returns null when there's nothing worth emitting. Validate before trusting output.

const SITE = "https://iot-techs.com";
const clean = (obj) => { for (const k of Object.keys(obj)) { const v = obj[k]; if (v == null || v === "" || (Array.isArray(v) && !v.length)) delete obj[k]; } return obj; };
const areaServed = (facts) => (facts["service_area.primary"] || "").split(/;|,/).map((s) => s.trim()).filter(Boolean).map((name) => ({ "@type": "AdministrativeArea", name }));

// Organization — identity only, always safe to emit when the name is known.
export function organizationLd(facts = {}) {
  if (!facts["company.brand"] && !facts["company.legal_name"]) return null;
  return clean({
    "@context": "https://schema.org", "@type": "Organization",
    name: facts["company.brand"] || facts["company.legal_name"],
    legalName: facts["company.legal_name"] || undefined,
    url: facts["company.website"] || SITE,
    logo: `${SITE}/logo.svg`,
    telephone: facts["company.phone"] || undefined,
    email: facts["company.email"] || undefined,
    slogan: facts["company.tagline"] || undefined,
  });
}

// LocalBusiness — the local-SEO anchor. Only the fields we can stand behind.
export function localBusinessLd(facts = {}) {
  if (!facts["company.brand"]) return null;
  const area = areaServed(facts);
  return clean({
    "@context": "https://schema.org", "@type": "LocalBusiness",
    "@id": `${SITE}/#business`,
    name: facts["company.brand"],
    image: `${SITE}/logo.svg`,
    url: facts["company.website"] || SITE,
    telephone: facts["company.phone"] || undefined,
    email: facts["company.email"] || undefined,
    areaServed: area.length ? area : undefined,
    description: facts["company.tagline"] || undefined,
  });
}

export function breadcrumbLd(items = []) {
  const list = items.filter((i) => i && i.name && i.slug != null);
  if (list.length < 2) return null;
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: list.map((i, idx) => ({ "@type": "ListItem", position: idx + 1, name: i.name, item: `${SITE}/${String(i.slug).replace(/^\/+|\/+$/g, "")}`.replace(/\/$/, "") })),
  };
}

// FAQPage — ONLY for FAQs actually rendered on the page (Google requires visible parity).
export function faqLd(faqs = []) {
  const qa = (faqs || []).filter((x) => x && x.q && x.a);
  if (!qa.length) return null;
  return {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  };
}

// Service — for a money page describing a service we provide.
export function serviceLd(page = {}, facts = {}) {
  if (!page.title) return null;
  const area = areaServed(facts);
  return clean({
    "@context": "https://schema.org", "@type": "Service",
    name: page.primary_topic || page.title,
    serviceType: page.service || page.primary_topic || undefined,
    provider: facts["company.brand"] ? { "@type": "LocalBusiness", name: facts["company.brand"], url: facts["company.website"] || SITE } : undefined,
    areaServed: area.length ? area : undefined,
    url: `${SITE}/${String(page.slug || "").replace(/^\/+|\/+$/g, "")}`,
    description: page.meta_description || undefined,
  });
}

// Assemble the JSON-LD graph for a page: site identity + the page-appropriate types.
export function pageLdGraph(page, facts, { breadcrumbs = [], faqs = [] } = {}) {
  const graph = [];
  const org = organizationLd(facts); if (org) graph.push(org);
  const lb = localBusinessLd(facts); if (lb) graph.push(lb);
  const bc = breadcrumbLd(breadcrumbs); if (bc) graph.push(bc);
  if (page?.page_type === "service") { const s = serviceLd(page, facts); if (s) graph.push(s); }
  const faq = faqLd(faqs); if (faq) graph.push(faq);
  return graph;
}
