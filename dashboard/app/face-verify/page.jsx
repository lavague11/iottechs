import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import FaceVerifyClient from "./face-verify-client";

// Face Verify — staff-only. 1:1 facial verification: match a live camera face
// against a driver's-licence portrait, entirely in the browser. Lives beside
// the ID Scanner. Recognition software the office runs; customers never see it.
export default async function FaceVerifyPage() {
  const user = await getSessionUser();
  if (!user?.id) redirect("/login");

  const alerts = getNotifSummary(user.id);
  return <FaceVerifyClient user={user} alerts={alerts} />;
}
