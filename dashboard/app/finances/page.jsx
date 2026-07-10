import { redirect } from "next/navigation";
import { getAllJobs, getExpenses, getExpenseStats, getInventoryStats } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import FinancesClient from "./finances-client";

const CLOSED = new Set(["payment", "completion"]);

export default async function FinancesPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts   = getNotifSummary(user.id);
  const jobs     = getAllJobs();
  const expenses = getExpenses();
  const expStats = getExpenseStats();
  const inv      = getInventoryStats();

  const completed = jobs.filter((j) => j.category === "completed");
  const revenue   = completed.reduce((s, j) => s + (j.value || 0), 0);
  const pipeline  = jobs.filter((j) => !CLOSED.has(j.stage)).reduce((s, j) => s + (j.value || 0), 0);
  const payrollEst = Math.round(jobs.filter((j) => j.tech).reduce((s, j) => s + (j.value || 0), 0) * 0.10);
  const net = revenue - expStats.total;

  // Recent transactions: payments in (completed projects) + expenses out
  const txn = [
    ...completed.filter((j) => j.value).map((j) => ({ kind: "in", label: j.customer, detail: j.service || j.service_code, amount: j.value, date: j.date, category: "Payment", link: `/project/${j.access_id}` })),
    ...expenses.map((e) => ({ kind: "out", label: e.description, detail: e.vendor || e.category || "", amount: e.amount, date: e.spent_on, category: e.category || "Expense", link: e.access_id ? `/project/${e.access_id}` : null })),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 14);

  const stats = {
    revenue, pipeline, expenses: expStats.total, net, payrollEst,
    inventoryValue: inv.value,
    completedCount: completed.length,
    avgProject: completed.length ? Math.round(revenue / completed.length) : 0,
    byCat: Object.entries(expStats.byCat).sort((a, b) => b[1] - a[1]),
  };

  return <FinancesClient user={user} alerts={alerts} stats={stats} txn={txn} />;
}
