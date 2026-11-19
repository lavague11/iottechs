"use server";

// Payroll writes (docs/WORK_ORDERS.md, requirement 27 + the Mark-as-paid follow-up).
//
// Paying someone is the end of the line for that money: once a day is paid it can never be reassigned,
// split, re-locked or paid again. The guard lives in the data layer (payrollMarkPaid's `paid_at IS
// NULL`), not here — this file is the role gate and the audit trail.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { payrollMarkPaid, payrollUnmarkPaid, actorName, recordEvent } from "../../lib/db";
import { can } from "../../lib/roles";

async function office() {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") || "";
  const raw = cookie.split(";").find((c) => c.trim().startsWith("iot_session="))?.split("=").slice(1).join("=");
  if (!raw) return null;
  const { parseToken } = await import("../../lib/auth");
  const { withFreshRole } = await import("../../lib/db");
  return withFreshRole(await parseToken(raw.trim())) || null;
}

export async function markPaidAction({ userId = null, name, from, to, method = null, note = null, paidOn = null } = {}) {
  const tok = await office();
  if (!tok || !can(tok.role, "payroll.export")) return { error: "Only an admin can record a payment." };
  const r = payrollMarkPaid({ userId, name, from, to, method, note, byName: actorName(tok) });
  if (r.error) return r;
  // Paying a person is a money event; it belongs in the activity record, not only in the payroll table.
  try {
    recordEvent("payroll_paid", tok.id ?? null, null, null, null,
      `${actorName(tok)} paid ${name} $${r.total.toFixed(2)} for ${from} → ${to}${method ? ` (${method})` : ""}${paidOn ? ` on ${paidOn}` : ""}`);
  } catch { /* the day logs carry the payment either way */ }
  revalidatePath("/payroll");
  return { ok: true, batch: r.batch, days: r.days, total: r.total };
}

// Undo a payment batch — for a mistake, not a refund. Admin only, logged, and only the whole batch.
export async function unmarkPaidAction(batch) {
  const tok = await office();
  if (!tok || !can(tok.role, "payroll.export")) return { error: "Only an admin can undo a payment." };
  const r = payrollUnmarkPaid(batch, actorName(tok));
  if (r.error) return r;
  try { recordEvent("payroll_unpaid", tok.id ?? null, null, null, null, `${actorName(tok)} undid payment ${batch} (${r.days} day${r.days === 1 ? "" : "s"})`); } catch {}
  revalidatePath("/payroll");
  return { ok: true, days: r.days };
}
