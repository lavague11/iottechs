"use client";
// ONE read-only financial summary for the proposal — used by the customer proposal AND the staff
// workspace's read-only (locked) state, so both show the SAME conditional money rows with the same
// labels and styling. Progressive disclosure ([[conditional-financial-disclosure]]): a zero-modifier
// proposal shows Total alone; Subtotal / Discount / PCP / Tax rows appear only when they actually move
// the price. Staff EDIT mode keeps its own inline controls (tax/discount/PCP buttons) — this is the
// non-editable renderer only. Styled with the shared .prop-totals / .prop-trow / .prop-total-big
// classes (PROP_CSS), so it looks identical wherever it mounts under .pvx.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProposalFinancialSummary({ totals, taxRate, fin = null, addons = null, pcpPending = false }) {
  const t = totals || {};
  // Subtotal shows only when a modifier makes it differ from the total (discount / PCP / tax).
  const hasMods = (+t.discount || 0) > 0 || (+t.pcpCredit || 0) > 0 || (+t.tax || 0) > 0;
  return (
    <div className="prop-totals prop-totals-ro">
      {hasMods && <div className="prop-trow"><span>Subtotal</span><b>{money(t.sub)}</b></div>}
      {(+t.discount || 0) > 0 && <div className="prop-trow"><span>Discount</span><b className="prop-minus">−{money(t.discount)}</b></div>}
      {(+t.pcpCredit || 0) > 0 && <div className="prop-trow"><span>PCP Credit{pcpPending ? " (pending)" : ""}</span><b className="prop-minus">−{money(t.pcpCredit)}</b></div>}
      {(+t.tax || 0) > 0 && <div className="prop-trow"><span>Tax · {taxRate}%</span><b>{money(t.tax)}</b></div>}
      {fin?.hasAddons ? (
        <>
          <div className="prop-trow"><span>Original proposal</span><b>{money(fin.base)}</b></div>
          <div className="prop-trow prop-trow-addon"><span>Approved addendums{addons?.list?.length > 1 ? ` (${addons.list.length})` : ""}</span><b className="prop-plus">+{money(fin.addons)}</b></div>
          <div className="prop-total-big"><span>Current total</span><b>{money(fin.current)}</b></div>
        </>
      ) : (
        <div className="prop-total-big"><span>Total</span><b>{money(t.grand)}</b></div>
      )}
    </div>
  );
}
