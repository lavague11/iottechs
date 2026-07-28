import { redirect } from "next/navigation";
import { listApplications } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import OnboardingClient from "./onboarding-client";

// Hiring portal — every application in one place. Admin/manager only (hiring is not a tech function).
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const rows = listApplications().map((a) => ({
    app_id: a.app_id,
    name: a.name,
    position: a.position,
    position_label: a.position_label,
    stage: a.stage,
    stage_label: a.stage_label,
    experience: a.experience,
    phone: a.phone,
    email: a.email,
    address: a.address,
    rating: a.rating,
    reviewer_name: a.reviewer_name,
    interview_at: a.interview_at,
    created_at: a.created_at,
  }));

  return <OnboardingClient user={user} alerts={alerts} rows={rows} />;
}
