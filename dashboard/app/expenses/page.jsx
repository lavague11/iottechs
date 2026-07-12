import { redirect } from "next/navigation";
import { getExpenses, getExpenseStats, getAllJobs } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import ExpensesClient from "./expenses-client";

const ROLE_HOME = { tech: "/tech", sales: "/sales", customer: "/login" };

export default async function ExpensesPage() {
  const user = await getSessionUser();
  // Expense approval is admin/manager only. Send others to their own home — never the admin
  // dashboard, which would expose users/inventory/payroll to a tech or sales rep.
  if (!["admin", "manager"].includes(user.role)) redirect(ROLE_HOME[user.role] || "/login");

  const alerts   = getNotifSummary(user.id);
  const expenses = getExpenses();
  const stats    = getExpenseStats();
  const projects = getAllJobs().map((j) => ({ access_id: j.access_id, customer: j.customer }));

  return <ExpensesClient user={user} alerts={alerts} expenses={expenses} stats={stats} projects={projects} />;
}
