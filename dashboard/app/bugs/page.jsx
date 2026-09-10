import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/session";
import { listBugReports } from "../../lib/db";
import BugsClient from "./bugs-client";

// The bug portal — staff-only. Everything filed by the site-wide "Report a bug" button lands here to
// triage and resolve. Open reports first, resolved below.
export default async function BugsPage() {
  const user = await getSessionUser();
  if (!user || !["admin", "manager"].includes(user.role)) redirect("/dashboard");
  // node:sqlite rows aren't plain objects — spread each into one so it can cross to the client component.
  const bugs = listBugReports().map((b) => ({ ...b }));
  return <BugsClient initial={bugs} />;
}
