import { cookies } from "next/headers";
import { resolveApplicationRef } from "../../../lib/db";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import SvcGate from "../../service-call/[svcId]/svc-gate";
import WelcomeClient from "./welcome-client";
import AppNotFound from "../../application/[appId]/app-not-found";

// Neutral preview — a shared onboarding link must never leak the new hire's details.
export function generateMetadata() {
  return {
    title: "IOT TECHS · Onboarding",
    description: "Secure access — authorized only.",
    robots: { index: false, follow: false },
    openGraph: { title: "IOT TECHS", description: "Secure access link — authorized only.", type: "website" },
  };
}

async function authorize(app) {
  const user = await getSessionUser();
  if (user?.id && ["admin", "manager"].includes(user.role)) return { ok: true, staff: true, name: user.name };
  const jar = await cookies();
  const tok = jar.get("iot_app")?.value;
  const parsed = tok ? await parseSvcToken(tok) : null;
  if (parsed?.svcId && String(parsed.svcId).toUpperCase() === String(app.app_id).toUpperCase()) {
    return { ok: true, staff: false, name: app.name };
  }
  return { ok: false };
}

export default async function WelcomePage({ params }) {
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
        kicker="Onboarding"
        grantedLine="Opening your onboarding"
        altHref="/apply"
        altLabel="Start a new application"
      />
    );
  }

  const ob = app.onboarding || {};
  const safe = {
    app_id: app.app_id,
    name: app.name,
    email: app.email,
    phone: app.phone,
    address: app.address,
    position_label: app.position_label,
    stage: app.stage,
    stage_label: app.stage_label,
    start_date: app.start_date,
    profile: ob.profile || null,
    signed: ob.signed || {},
    emergency_verified: ob.emergency_verified || null,
  };

  return <WelcomeClient app={safe} staff={!!auth.staff} />;
}
