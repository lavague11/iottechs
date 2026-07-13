import { redirect } from "next/navigation";
import { getPcpLedger } from "../../lib/db";
import { optionTotals } from "../../lib/proposal";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import PcpClient from "./pcp-client";

// PCP ledger — every active proposal that carries a Performance Credit, with the credit amount
// computed from its selected (or first) option. Admin/manager only.
export default async function PcpPage() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const alerts = getNotifSummary(user.id);
  const credits = [];
  for (const r of getPcpLedger()) {
    let payload;
    try { payload = JSON.parse(r.payload); } catch { continue; }
    const opts = payload.options || [];
    const opt = opts.find((o) => o.id === r.selected_option) || opts[0];
    if (!opt) continue;
    const t = optionTotals(opt, r.tax_rate, payload.discount, r.deposit_pct, payload.pcp_credit);
    if (!(t.pcpCredit > 0)) continue;
    const pc = payload.pcp_credit;
    credits.push({
      accessId: r.project_access_id,
      customer: r.customer || r.project_access_id,
      stage: r.stage || null,
      amount: t.pcpCredit,
      subtotal: t.sub,
      pct: (pc && pc.type === "pct") ? +pc.value || 0 : null,
      status: r.pcp_status || "pending",
      agreedAt: r.pcp_agreed_at || null,
      approvedAt: r.pcp_approved_at || null,
      agreementNo: r.pcp_agreement_no || null,
      grantSource: r.pcp_grant_source || null,
      updatedAt: r.updated_at,
    });
  }

  return <PcpClient user={user} alerts={alerts} credits={credits} />;
}
