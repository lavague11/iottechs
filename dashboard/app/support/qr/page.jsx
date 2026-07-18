import { redirect } from "next/navigation";
import { getSystemQrLibrary } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import QrLibraryClient from "./qr-library-client";

// Admin System-QR library — every project's System QR in one searchable place. Admin/manager only.
export default async function QrLibraryPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const codes  = getSystemQrLibrary();
  return <QrLibraryClient user={user} alerts={alerts} codes={codes} />;
}
