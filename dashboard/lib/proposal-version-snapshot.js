// Read-only snapshot of ONE sent proposal version (and of a single addendum) for the "Sent versions" log.
// PURE — no DB, no DOM. Every figure comes from the existing money primitives (optionTotals / itemTotal /
// planScheduleRows) and every comparison from proposalDiff; nothing here derives a number of its own.
//
// What "exactly what was sent" means:
//   • SIGNED version  → the frozen `signed_payload` (the artifact the signature binds to).
//   • UNSIGNED sent   → the row's `payload`. setProposalTechPricing may still write tech pricing onto a sent
//     row without a version bump, but tech pricing is internal and is never part of this view model, so the
//     customer-facing meaning (items, prices, discount, PCP, tax, deposit) is unaffected.
import { sanitizeProposal, proposalDiff, optionTotals, itemTotal, planScheduleRows, displayOptionName, addendumTotals, addendumSignatureCurrent } from "./proposal.js";
import { can } from "./roles.js";

const STAFF = new Set(["admin", "manager", "sales"]);
const r2 = (n) => Math.round((+n || 0) * 100) / 100;

// The row exactly as it should be read: signed → frozen snapshot, otherwise the stored payload.
export function snapshotRow(row) {
  if (!row) return null;
  const frozen = !!(row.signed_at && row.signed_payload);
  return { ...row, payload: frozen ? row.signed_payload : row.payload, frozen };
}

// Customer-safe view of a line: names, quantities, prices only — never cost / techPrice / techPay.
const viewLine = (it) => ({
  id: it.id || null, name: it.name || "", qty: +it.qty || 0, price: +it.price || 0, total: r2(itemTotal(it)), waived: !!it.waived,
  sub: (it.sub || []).map((x) => ({ name: x.name || "", qty: +x.qty || 0, price: +x.price || 0, total: r2(itemTotal(x)), waived: !!x.waived })),
});

// Mark snapshot lines against the diff: removed since / changed since; lines added since are listed apart.
function markOption(opt, od) {
  // Match by item id first (ids are distinct even when names repeat); svc|name only for legacy id-less lines.
  const nameKey = (svc, name) => `${svc || ""}|${name || ""}`;
  const byId = (list) => new Map((list || []).filter((x) => x.id).map((x) => [x.id, x]));
  const byName = (list) => { const m = new Map(); (list || []).filter((x) => !x.id).forEach((x) => { const k = nameKey(x.svc, x.name); (m.get(k) || m.set(k, []).get(k)).push(x); }); return m; };
  const rmId = byId(od?.removed), chId = byId(od?.changed), rmName = byName(od?.removed), chName = byName(od?.changed);
  const services = opt.services.map((s) => ({
    ...s,
    items: s.items.map((it) => {
      if (it.id) {
        if (rmId.has(it.id)) return { ...it, mark: "removed" };
        if (chId.has(it.id)) return { ...it, mark: "changed", now: chId.get(it.id).to };
        return it;
      }
      const k = nameKey(s.name, it.name);
      if (rmName.get(k)?.length) { rmName.get(k).shift(); return { ...it, mark: "removed" }; }
      if (chName.get(k)?.length) return { ...it, mark: "changed", now: chName.get(k).shift().to };
      return it;
    }),
  }));
  return { ...opt, services, addedSince: od?.added || [], optionAdded: !!od?.optionAdded, optionRemoved: !!od?.optionRemoved, discountNow: od?.discount || null, pcpNow: od?.pcp || null, totalNow: od?.total && od.total.from !== od.total.to ? od.total.to : null };
}

// → null when the row isn't a sent version a staff role may read.
export function buildVersionSnapshot(row, role, currentRow = null) {
  if (!row || !row.sent_at || !STAFF.has(role)) return null;
  const src = snapshotRow(row);
  const p = sanitizeProposal(src, role);
  if (!p || p.workOrder || !p.payload) return null;
  const pl = p.payload;
  const options = (pl.options || []).map((o) => {
    const t = optionTotals(o, p.tax_rate, pl.discount, p.deposit_pct, pl.pcp_credit);
    return {
      id: o.id, name: displayOptionName(o.name || ""), selected: row.selected_option != null && String(row.selected_option) === String(o.id),
      services: (o.services || []).filter((s) => (s.items || []).length).map((s) => ({ name: s.name || "", items: s.items.map(viewLine) })),
      totals: t,
      plan: planScheduleRows(pl.payment_plan || "custom", pl.custom_plan?.rows, t.grand, pl.full_date || null),
    };
  });
  // Compare against the CURRENT working proposal (staff truth). Nothing to compare when this IS the working row.
  let compare = null;
  if (currentRow && currentRow.id !== row.id) {
    const diff = proposalDiff(src, currentRow);
    if (diff.any) {
      const byId = new Map(diff.options.map((d) => [d.id, d]));
      compare = { currentVersion: currentRow.version, tax: diff.tax, deposit: diff.deposit, discount: diff.discount, pcp: diff.pcp, optionsAddedSince: diff.options.filter((d) => d.optionAdded).map((d) => d.name) };
      options.forEach((o, i) => { options[i] = markOption(o, byId.get(o.id)); });
    }
  }
  return {
    kind: "proposal", version: row.version, status: row.status, frozen: src.frozen, notFrozen: !!(row.signed_at && !row.signed_payload),
    sentAt: row.sent_at, sentBy: row.sent_by_name || null,
    taxRate: +p.tax_rate || 0, depositPct: +p.deposit_pct || 0,
    discount: pl.discount && +pl.discount.value ? pl.discount : null,
    pcp: pl.pcp_credit && +pl.pcp_credit.value ? pl.pcp_credit : null,
    options,
    signature: row.signed_at ? { name: row.signed_name || null, at: row.signed_at, data: row.signature_data || null } : null,
    compare,
    pdf: p,   // the sanitized row the PDF renderer already accepts (it swaps in signedPayload itself)
  };
}

// ---- Addenda ------------------------------------------------------------------------------------
// One entry of the addendum blob as a read-only snapshot. Money comes from the shared addendumTotals. The
// signature is shown ONLY while it still matches the content (addendumSignatureCurrent); an add-on edited
// after approval reports `edited` instead, so a signature never sits beside figures it didn't cover.
// Prices only for roles that may see retail; tech payout is never included. No version history exists for
// addenda (one mutable record), so no compare.
export function buildAddendumSnapshot(a, role) {
  if (!a || !STAFF.has(role) || a.needsPricing) return null;
  const retail = can(role, "addendum.retail.view");
  const t = addendumTotals(a);
  const signedOnce = !!(a.signedName || a.signedFingerprint || a.signedAt);
  const current = addendumSignatureCurrent(a);
  return {
    kind: "addendum", id: a.id, title: a.title || "Add-on", status: a.status || "pending", sentAt: a.emailSentAt || a.at || null,
    items: (a.items || []).map((it) => ({ name: it.name || "", qty: +it.qty || 0, ...(retail ? { price: +it.price || 0, total: r2(itemTotal(it)) } : {}) })),
    totals: retail ? t : null,
    signature: current && a.signedName ? { name: a.signedName, at: a.signedAt || null, data: a.signatureData || null } : null,
    edited: signedOnce && a.status === "approved" && !current,
    voidedAt: a.voidedAt || null,
  };
}
