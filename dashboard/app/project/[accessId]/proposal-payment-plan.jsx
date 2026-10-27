"use client";
// ONE read-only payment-plan presentation for the proposal — used by the customer proposal AND the
// staff workspace's read-only state, so both show the identical compact schedule: a "PAYMENT PLAN"
// label + the plan signature (e.g. "50 / 50") and one column per milestone (percent + trigger + amount).
// Staff EDIT mode keeps its own plan picker (buttons / custom rows) — this is the non-editable renderer.
// Takes the already-computed `sched` (planScheduleRows output) so each caller uses its own total; falls
// back to a one-line terms + deposit when there's no renderable schedule. Styled with the shared
// .prop-plan classes (PROP_CSS) under .pvx.
import { PAYMENT_PLANS } from "../../../lib/proposal";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (d) => { if (!d) return ""; try { return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };

export default function ProposalPaymentPlan({ sched = [], plan, grand = 0, deposit = 0, fullDate = null }) {
  const sig = sched.length === 1 ? sched[0].pctLabel : sched.map((r) => r.pctLabel.replace("%", "")).join(" / ");
  const payFull = plan === "100" || plan === "100_end";
  return (
    <div className="prop-plan">
      <div className="prop-plan-head">
        <span className="prop-plan-lbl">Payment plan</span>
        {sched.length > 0 && <span className="prop-plan-sig">{sig}</span>}
      </div>
      {sched.length > 0 ? (
        <div className="prop-plan-cols">
          {sched.map((r, i) => (
            <div className="prop-plan-col" key={i}>
              <span className="prop-plan-term"><b>{r.pctLabel}</b>{r.when ? ` ${/begin/i.test(r.when) ? "due before we begin" : r.when}` : ""}</span>
              {r.amount != null && <span className="prop-plan-amt">{money(r.amount)}</span>}
            </div>
          ))}
        </div>
      ) : (() => {
        // Fallback: no renderable schedule — one terms line + the up-front amount, never silent.
        const whenLabel = fullDate ? `by ${shortDate(fullDate)}` : payFull ? "upon completion" : "before we begin";
        const termsText = payFull ? `Paid in full ${whenLabel}.` : (plan !== "custom" ? PAYMENT_PLANS[plan]?.terms : null);
        return (
          <>
            {termsText && <div className="prop-plan-terms">{termsText}</div>}
            <div className="prop-trow"><span>{payFull ? `Due ${whenLabel}` : "Deposit due"}</span><b>{money(payFull ? grand : deposit)}</b></div>
          </>
        );
      })()}
    </div>
  );
}
