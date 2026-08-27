import { redirect } from "next/navigation";

// The flat hiring list moved to the three-portal board at /hiring (Phase 0). The per-candidate
// detail still lives at /onboarding/[appId]; only this bare list route redirects.
export default async function OnboardingPage() {
  redirect("/hiring");

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
