import { cookies } from "next/headers";
import { resolveApplicationRef, getApplicationCompliance, sanitizeCompliance } from "../../../lib/db";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import SvcGate from "../../service-call/[svcId]/svc-gate";
import AppNotFound from "../../application/[appId]/app-not-found";
import ComplianceClient from "./compliance-client";

export function generateMetadata() {
  return { title: "IOT TECHS · Requirements", description: "Secure access — authorized only.", robots: { index: false, follow: false },
    openGraph: { title: "IOT TECHS", description: "Secure access link — authorized only.", type: "website" } };
}

async function authorize(app) {
  const user = await getSessionUser();
  if (user?.id && ["admin", "manager"].includes(user.role)) return { ok: true, staff: true };
  const jar = await cookies();
  const tok = jar.get("iot_app")?.value;
  const parsed = tok ? await parseSvcToken(tok) : null;
  if (parsed?.svcId && String(parsed.svcId).toUpperCase() === String(app.app_id).toUpperCase()) return { ok: true, staff: false };
  return { ok: false };
}

export default async function CompliancePage({ params }) {
  const { appId } = await params;
  const app = resolveApplicationRef(appId);
  if (!app) return <AppNotFound />;

  const auth = await authorize(app);
  if (!auth.ok) {
    return <SvcGate svcId={app.app_id} endpoint="/api/app-pin-check" idField="appId" kicker="Requirements"
      grantedLine="Opening your requirements" altHref="/apply" altLabel="Start a new application" />;
  }

  const compliance = sanitizeCompliance(getApplicationCompliance(app.app_id));
  return (
    <ComplianceClient
      appId={app.app_id}
      firstName={(app.name || "").trim().split(/\s+/)[0] || ""}
      status={app.status}
      compliance={compliance}
      staff={!!auth.staff}
    />
  );
}
