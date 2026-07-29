import { redirect } from "next/navigation";
import { getProposalLibrary } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import ProposalLibraryClient from "./proposals-client";

// Proposal library — every project's proposal in one searchable place. Admin/manager only.
export default async function ProposalLibraryPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const rows   = getProposalLibrary();
  return <ProposalLibraryClient user={user} alerts={alerts} rows={rows} />;
}
