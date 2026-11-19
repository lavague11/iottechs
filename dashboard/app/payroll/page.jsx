import { redirect } from "next/navigation";
import { payrollForPeriod } from "../../lib/db";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { can } from "../../lib/roles";
import PayrollClient from "./payroll-client";

const ROLE_HOME = { tech: "/tech", sales: "/sales", customer: "/login" };

// Payroll (docs/WORK_ORDERS.md, requirement 27) — the locked daily logs, per technician, per pay
// period. Admin and manager only: this is every technician's pay, so it never reaches a tech's own
// page, let alone a customer's. The period defaults to the fortnight ending today.
function defaultPeriod() {
  const to = new Date();
  const from = new Date(to.getTime() - 13 * 86400000);
  const iso = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return { from: iso(from), to: iso(to) };
}

export default async function PayrollPage({ searchParams }) {
  const user = await getSessionUser();
  if (!can(user.role, "payroll.view")) redirect(ROLE_HOME[user.role] || "/login");

  const sp = (await searchParams) || {};
  const d = defaultPeriod();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from : d.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to : d.to;

  return (
    <PayrollClient
      user={user}
      alerts={getNotifSummary(user.id)}
      data={payrollForPeriod({ from, to })}
      canExport={can(user.role, "payroll.export")}
    />
  );
}
