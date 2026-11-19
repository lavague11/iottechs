import { notFound } from "next/navigation";
import { getSessionUser } from "../../../lib/session";
import { getPublishedSopBySlug } from "../../../lib/db";
import { SITE_ORIGIN } from "../../../lib/seo";
import { canEditSop } from "../../../lib/sop-model";
import SopPlayer from "./sop-player";

export const dynamic = "force-dynamic";

// A real per-guide description (the app default — "Track your project from survey to completion" — said
// nothing and matched no search). Built from the guide's own first steps, so it describes THIS guide.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const sop = getPublishedSopBySlug(slug);
  if (!sop) return { title: "Guides" };
  const steps = Array.isArray(sop.steps) ? sop.steps.filter((s) => s.title) : [];
  const lead = String(steps[0]?.instruction || "").trim();
  const description = (lead ? `${lead} ` : "") +
    `A step-by-step guide from IOT TECHS${steps.length ? ` — ${steps.length} steps, with a photo for each` : ""}.`;
  return {
    title: `${sop.title} — Guides | IOT TECHS`,
    description: description.slice(0, 300),
    alternates: { canonical: `/guides/${slug}` },
    // Internal guides already 404 for non-staff; keep them out of any index that sees one anyway.
    ...(sop.visibility === "internal" ? { robots: { index: false, follow: false } } : {}),
  };
}

// The player shows ONE step at a time, so only step 1 is ever in the DOM — roughly three quarters
// of a guide is invisible to a crawler. Rather than change how the guide reads, publish the whole
// thing as HowTo structured data: every step, its text and its photo, the way Google asks for it.
// Breadcrumbs give the /guides hub a second signal that the page belongs to it.
function guideSchema(sop, slug) {
  const steps = (Array.isArray(sop.steps) ? sop.steps : []).filter((s) => s.title || s.instruction);
  const url = `${SITE_ORIGIN}/guides/${slug}`;
  const abs = (src) => (!src ? undefined : /^https?:/i.test(src) ? src : `${SITE_ORIGIN}${src}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        "@id": `${url}#howto`,
        name: sop.title,
        description: String(steps[0]?.instruction || sop.title).slice(0, 300),
        totalTime: undefined,
        step: steps.map((s, k) => ({
          "@type": "HowToStep",
          position: k + 1,
          name: s.title || `Step ${k + 1}`,
          text: String(s.instruction || s.title || "").slice(0, 1000),
          url: `${url}#step-${k + 1}`,
          ...(abs(s.img) ? { image: abs(s.img) } : {}),
        })),
        publisher: { "@type": "Organization", name: "IOT TECHS", url: SITE_ORIGIN },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Guides", item: `${SITE_ORIGIN}/guides` },
          { "@type": "ListItem", position: 2, name: sop.title, item: url },
        ],
      },
    ],
  };
}

export default async function GuidePage({ params }) {
  const { slug } = await params;
  const sop = getPublishedSopBySlug(slug);
  if (!sop) notFound();
  // Internal guides are staff-only; a guest (or non-staff) gets a 404 rather than a redirect, so the link
  // simply doesn't resolve for them.
  if (sop.visibility === "internal") {
    const user = await getSessionUser();
    if (!user?.id || !canEditSop(user.role)) notFound();
  }
  // Internal guides are noindex (see generateMetadata) — don't hand Google schema for them either.
  const schema = sop.visibility === "internal" ? null : guideSchema(sop, slug);
  return (
    <>
      {schema && (
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      )}
      <SopPlayer sop={sop} />
    </>
  );
}
