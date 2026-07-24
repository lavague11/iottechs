import { redirect } from "next/navigation";
import { getSurveyLibrary } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import SurveyLibraryClient from "./surveys-client";

// Site-survey library — every project's survey in one searchable place. Admin/manager only.
export default async function SurveyLibraryPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const rows   = getSurveyLibrary();
  return <SurveyLibraryClient user={user} alerts={alerts} rows={rows} />;
}
