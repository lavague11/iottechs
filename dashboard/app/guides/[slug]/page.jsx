import { notFound } from "next/navigation";
import { getSessionUser } from "../../../lib/session";
import { getPublishedSopBySlug } from "../../../lib/db";
import { canEditSop } from "../../../lib/sop-model";
import SopPlayer from "./sop-player";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const sop = getPublishedSopBySlug(slug);
  return { title: sop ? `${sop.title} — Guides` : "Guides" };
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
