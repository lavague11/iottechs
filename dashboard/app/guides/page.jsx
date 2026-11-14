import { getSessionUser } from "../../lib/session";
import { listPublishedSops, secretValue } from "../../lib/db";
import { canEditSop } from "../../lib/sop-model";
import GuidesClient from "./guides-client";

// SOP Guides library — published how-to guides built with the SOP Builder. Public guides are visible to
// anyone (shareable link, no login); internal guides only to signed-in staff. (Distinct from /support,
// which is the internal FAQ knowledge base.) Staff see a "Build guide" entry only when SOP_BUILDER is on.
export const dynamic = "force-dynamic";

export default async function GuidesPage() {
  const user = await getSessionUser();
  const staff = !!user?.id && canEditSop(user.role);
  const sops = listPublishedSops({ includeInternal: staff });
  const canBuild = staff && secretValue("SOP_BUILDER") === "on";
  return <GuidesClient sops={sops} staff={staff} canBuild={canBuild} />;
}
