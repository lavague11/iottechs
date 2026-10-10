import { redirect } from "next/navigation";
import { getSessionUser } from "../../../lib/session";
import { can } from "../../../lib/roles";
import { listPages, allFacts, listCaseStudies, listBacklinks, countsByStatus, orphanPublishedPages } from "../../../lib/seo";
import SeoClient from "./seo-client";

// SEO working queue — staff-only operational control center (master plan §AE). Not a marketing
// dashboard; a backlog you move through. Everything server-gated by the seo.* capabilities.
export const dynamic = "force-dynamic";

export default async function SeoAdminPage() {
  const user = await getSessionUser();
  if (!user?.id || !can(user.role, "seo.view")) redirect("/dashboard");
  const data = {
    pages: listPages(),
    facts: allFacts(),
    cases: listCaseStudies(),
    backlinks: listBacklinks(),
    counts: countsByStatus(),
    orphans: orphanPublishedPages(),
  };
  const caps = { edit: can(user.role, "seo.edit"), approve: can(user.role, "seo.approve"), publish: can(user.role, "seo.publish"), admin: can(user.role, "seo.admin") };
  return <SeoClient data={data} caps={caps} />;
}
