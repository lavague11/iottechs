import { redirect } from "next/navigation";
import { getReceivables } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ReceivablesClient from "./receivables-client";

// Accounts Receivable — outstanding balances across every billed project. Admin/manager only.
export default async function ReceivablesPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const rows   = getReceivables();
  return <ReceivablesClient user={user} alerts={alerts} rows={rows} />;
}
