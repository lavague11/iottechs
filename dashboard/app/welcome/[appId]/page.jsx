import { redirect } from "next/navigation";
import { resolveApplicationRef } from "../../../lib/db";
import AppNotFound from "../../application/[appId]/app-not-found";

// RETIRED: /welcome was a pre-redesign onboarding page that duplicated Portal 2 Compliance
// (its own profile/signed doc model, off the deck theme). New-hire onboarding now lives entirely
// at /compliance/[appId], so this route permanently redirects there. The old welcome-client.jsx /
// actions.js stay on disk (non-destructive) but are no longer reachable.
export function generateMetadata() {
  return {
    title: "IOT TECHS · Onboarding",
    description: "Secure access — authorized only.",
    robots: { index: false, follow: false },
  };
}

export default async function WelcomePage({ params }) {
  const { appId } = await params;
  const app = resolveApplicationRef(appId);
  if (!app) return <AppNotFound />;
  redirect(`/compliance/${app.app_id}`);
}
