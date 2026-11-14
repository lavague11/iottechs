import { redirect } from "next/navigation";
import { getSessionUser } from "../../../lib/session";
import { secretValue } from "../../../lib/db";
import { canEditSop } from "../../../lib/sop-model";
import SopBuilder from "./sop-builder";

// Staff-only tool, gated by the SOP_BUILDER flag (Dev ▸ Feature flags). Off or non-staff → back to the
// dashboard. The AI + persistence are server-side (/api/sop/*, server actions), re-checked there.
export const dynamic = "force-dynamic";

export default async function SopBuilderPage() {
  const user = await getSessionUser();
  if (!user?.id || !canEditSop(user.role)) redirect("/dashboard");
  if (secretValue("SOP_BUILDER") !== "on") redirect("/dashboard");
  const canManage = ["admin", "manager"].includes(user.role);
  return (
    <main style={{ minHeight: "100dvh", background: "#000" }}>
      <SopBuilder canManage={canManage} />
    </main>
  );
}
