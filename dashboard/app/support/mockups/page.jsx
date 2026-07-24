import { redirect } from "next/navigation";
import { getMockupLibrary } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import MockupLibraryClient from "./mockups-client";

// Mockup library — every project's camera mockup in one searchable place. Admin/manager only.
export default async function MockupLibraryPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const rows   = getMockupLibrary();
  return <MockupLibraryClient user={user} alerts={alerts} rows={rows} />;
}
