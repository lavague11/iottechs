import { redirect } from "next/navigation";
import { getDevTasks, getAllJobs, listSecretsMeta, loginTwoFactorEnabled } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { INTEGRATIONS } from "../../lib/integrations";
import { twilioVerifyConfigured } from "../../lib/twilio-verify";
import DevClient from "./dev-client";

export default async function DevPage() {
  const user = await getSessionUser();
  if (user.role !== "admin") redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const tasks  = getDevTasks();
  const sample = getAllJobs()[0]?.access_id || null;
  // Display-safe key metadata only (masked values, source, timestamp) — never raw secrets.
  const secrets = listSecretsMeta(INTEGRATIONS);
  const twoFactor = { enabled: loginTwoFactorEnabled(), ready: twilioVerifyConfigured() };

  return <DevClient user={user} alerts={alerts} tasks={tasks} sampleProjectId={sample} secrets={secrets} twoFactor={twoFactor} />;
}
