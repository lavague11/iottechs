import { cookies } from "next/headers";
import { resolveApplicationRef, getApplicationEvents } from "../../../lib/db";
import { didPass } from "../../../lib/assessment-bank";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import SvcGate from "../../service-call/[svcId]/svc-gate";
import ApplicationClient from "./application-client";
import AppNotFound from "./app-not-found";

// Neutral preview — a shared application link must never leak the applicant's name or status.
export function generateMetadata() {
  return {
    title: "IOT TECHS · Application",
    description: "Secure access — authorized only.",
    robots: { index: false, follow: false },
    openGraph: { title: "IOT TECHS", description: "Secure access link — authorized only.", type: "website" },
  };
}

// The applicant holds an iot_app grant for THIS application (minted by the PIN gate). Staff
// reviewing from the office get read access too. Everyone else meets the gate — nothing about
// the application crosses to the client until authorized.
async function authorize(app) {
  const user = await getSessionUser();
  if (user?.id && ["admin", "manager"].includes(user.role)) {
    return { ok: true, staff: true, name: user.name };
  }
  const jar = await cookies();
  const tok = jar.get("iot_app")?.value;
  const parsed = tok ? await parseSvcToken(tok) : null;
  if (parsed?.svcId && String(parsed.svcId).toUpperCase() === String(app.app_id).toUpperCase()) {
    return { ok: true, staff: false, name: app.name };
  }
  return { ok: false };
}

export default async function ApplicationPage({ params }) {
  const { appId } = await params;
  const app = resolveApplicationRef(appId);
  if (!app) return <AppNotFound />;

  const auth = await authorize(app);
  if (!auth.ok) {
    return (
      <SvcGate
        svcId={app.app_id}
        endpoint="/api/app-pin-check"
        idField="appId"
        kicker="Application"
        grantedLine="Opening your application"
        altHref="/apply"
        altLabel="Start a new application"
      />
    );
  }

  // Applicant-safe slim: their own submission and status. Never the office's rating, reviewer,
  // or internal notes — those stay in the hiring portal.
  const safe = {
    app_id: app.app_id,
    name: app.name,
    position: app.position,
    position_label: app.position_label,
    stage: app.stage,
    stage_label: app.stage_label,
    experience: app.experience,
    skills: app.skills,
    availability: app.availability,
    start_date: app.start_date,
    about: app.about,
    has_license: app.has_license,
    has_vehicle: app.has_vehicle,
    has_tools: app.has_tools,
    phone: app.phone,
    email: app.email,
    address: app.address,
    interview_at: app.interview_at,
    decline_reason: app.decline_reason,
    created_at: app.created_at,
    onboarding: app.onboarding || null,
    assessment_status: app.assessment?.status || null,   // null | in_progress | submitted | graded
    // Candidate sees only pass/fail once graded — never the number, tier, or profile.
    assessment_pass: app.assessment?.status === "graded" ? didPass(app.assessment) : null,
    // Retake request state (they wrote the reason themselves, so it's safe to echo back).
    retake: app.assessment?.retake ? { status: app.assessment.retake.status, reason: app.assessment.retake.reason, note: app.assessment.retake.note || null } : null,
    portal: app.portal, status: app.status,
  };

  // The applicant sees their own milestones — not the office's private notes or ratings.
  const events = getApplicationEvents(app.app_id)
    .filter((e) => auth.staff || !["note"].includes(e.kind))
    .map((e) => ({ id: e.id, at: e.at, kind: e.kind, detail: e.detail }));

  return <ApplicationClient app={safe} events={events} staff={!!auth.staff} viewerName={auth.name} />;
}
