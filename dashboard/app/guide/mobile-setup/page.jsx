import { cookies } from "next/headers";
import { parseToken, parseAccessToken, parseGuideToken } from "../../../lib/auth";
import { getGuideArticle, getProjectsWithSystemQr, getProjectsByContactEmail, getJobByAccessId, getUserById } from "../../../lib/db";
import GuidePageClient from "./guide-client";

export const metadata = {
  title: "Set up your app — IOT TECHS",
  description: "Step-by-step setup for the Annke Vision app on your phone.",
};

// PUBLIC page — deliberately not in middleware's PROTECTED list. The instructions contain no
// customer data, so anyone with the link can follow them. The one thing that IS sensitive is the
// System QR (it grants camera access), so that alone is gated, resolved in this order:
//   1. iot_access cookie  — they already unlocked this project's PIN gate
//   2. ?t= guide token    — a signed, expiring link we texted them
//   3. iot_session        — a logged-in customer sees every system they own
//   4. nothing            — the guide still runs; the QR step asks for project ID + PIN
export default async function MobileSetupGuidePage({ searchParams }) {
  const sp   = await searchParams;
  const ref  = String(sp?.project || "").trim();
  const tok  = String(sp?.t || "").trim();
  const jar  = await cookies();

  let projects = [];

  // 1 + 2 — a single project, by cookie or by token. Both must match the requested project.
  const access = jar.get("iot_access")?.value;
  const grant  = access ? await parseAccessToken(access) : null;
  const linked = tok ? await parseGuideToken(tok) : null;
  const unlockedId =
    (grant && (!ref || grant.accessId.toLowerCase() === ref.toLowerCase()) && grant.accessId) ||
    (linked && (!ref || linked.accessId.toLowerCase() === ref.toLowerCase()) && linked.accessId) ||
    null;

  if (unlockedId) {
    const row = getJobByAccessId(unlockedId);
    if (row) projects = getProjectsWithSystemQr([row]);
  }

  // 3 — a logged-in customer gets all of their own systems, so they never have to remember which
  // project ID a given camera belongs to.
  if (projects.length === 0) {
    const session = jar.get("iot_session")?.value;
    const user    = session ? await parseToken(session) : null;
    if (user?.email) {
      const dbUser = user.id ? getUserById(user.id) : null;
      const rows   = getProjectsByContactEmail(dbUser?.email || user.email);
      if (rows.length) projects = getProjectsWithSystemQr(rows);
    }
  }

  const article = getGuideArticle();
  const guide   = article ? JSON.parse(article.body) : { steps: [] };

  return (
    <GuidePageClient
      title={article?.title || "Mobile App Setup"}
      steps={guide.steps || []}
      projects={projects}
      projectRef={ref}
    />
  );
}
