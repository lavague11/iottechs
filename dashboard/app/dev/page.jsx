import { redirect } from "next/navigation";
import { getDevTasks, getAllJobs, listSecretsMeta, loginTwoFactorEnabled } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { INTEGRATIONS } from "../../lib/integrations";
import { smsVerifyConfigured, smsProvider } from "../../lib/sms-verify";
import DevClient from "./dev-client";

export default async function DevPage() {
  const user = await getSessionUser();
  if (user.role !== "admin") redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const tasks  = getDevTasks();
  const sample = getAllJobs()[0]?.access_id || null;
  // Display-safe key metadata only (masked values, source, timestamp) — never raw secrets.
  const secrets = listSecretsMeta(INTEGRATIONS);
  const twoFactor = { enabled: loginTwoFactorEnabled(), ready: smsVerifyConfigured(), provider: smsProvider() };

  return <DevClient user={user} alerts={alerts} tasks={tasks} sampleProjectId={sample} secrets={secrets} twoFactor={twoFactor} />;
}
