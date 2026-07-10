import { redirect } from "next/navigation";
import { getExpenses, getExpenseStats, getAllJobs } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ExpensesClient from "./expenses-client";

export default async function ExpensesPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts   = getNotifSummary(user.id);
  const expenses = getExpenses();
  const stats    = getExpenseStats();
  const projects = getAllJobs().map((j) => ({ access_id: j.access_id, customer: j.customer }));

  return <ExpensesClient user={user} alerts={alerts} expenses={expenses} stats={stats} projects={projects} />;
}
