import { notFound } from "next/navigation";
import { getSessionUser } from "../../../lib/session";
import { getPublishedSopBySlug } from "../../../lib/db";
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
  return <SopPlayer sop={sop} />;
}
