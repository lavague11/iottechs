import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/session";
import { aiUsageSummary, recentAiActivity, listMayaUnanswered, secretValue } from "../../lib/db";
import MayaAdminClient from "./maya-admin-client";

// Admin ▸ Maya — train, manage and watch the AI assistant. Admin-only.
export default async function MayaAdminPage() {
  const user = await getSessionUser().catch(() => null);
  if (!user || user.role !== "admin") redirect("/dashboard");
  const initial = {
    usage: aiUsageSummary(),
    activity: recentAiActivity(40),
    unanswered: listMayaUnanswered({ limit: 60 }),
    flags: { commands: secretValue("AI_COMMANDS") === "on", customer: secretValue("AI_CUSTOMER") === "on", hasKey: !!secretValue("ANTHROPIC_API_KEY") },
  };
  return <MayaAdminClient initial={initial} />;
}
