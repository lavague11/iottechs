// Server-side invoice figures + PDF bytes for the customer invoice email. Mirrors what the staff
// "Download invoice" button builds (app/project/[accessId]/approval-panel.jsx), but computed server-side
// from the PUBLISHED proposal + the canonical financial state, so the emailed invoice always matches the
// numbers on screen. Pure of side effects. The due date is Net 14 from the send date by default.

import { getPublishedProposal, getJobByAccessId, getProjectFinancialState, getApprovedAddons, getProjectPayments } from "./db.js";
import { optionTotals } from "./proposal.js";
import { projectFileBase } from "./doc-filename.js";
import { downloadInvoicePdf } from "./invoice-pdf.js";

export const NET_DAYS = 14;
const pad = (n) => String(n).padStart(2, "0");
export function defaultDueDate(from = new Date(), days = NET_DAYS) {
  const d = new Date(from); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// { meta, figs, payments, invoiceNo, balance } — or null when there's no published proposal to bill.
export function buildInvoiceFigures(accessId) {
  const row = getPublishedProposal(accessId);
  if (!row) return null;
  const fin = getProjectFinancialState(accessId);
  let payload; try { payload = JSON.parse(row.payload || "{}"); } catch { payload = {}; }
  let accepted = []; try { accepted = JSON.parse(row.accepted_options || "[]"); } catch { accepted = []; }
  const opts = payload.options || [];
  const chosen = accepted.length ? opts.filter((o) => accepted.includes(o.id))
    : (row.selected_option ? opts.filter((o) => o.id === row.selected_option) : opts.slice(0, 1));
  const lines = chosen.map((o) => ({
    label: `Security System${o.name ? ` — ${o.name}` : ""}`,
    amount: optionTotals(o, row.tax_rate, payload.discount, row.deposit_pct, payload.pcp_credit).grand,
  }));
  const addons = getApprovedAddons(accessId);
  (addons?.list || []).forEach((a) => lines.push({ label: `Add-on · ${a.title}`, amount: a.total }));

  const p = getJobByAccessId(accessId);
  const meta = {
    customerName: p?.business_name || p?.contact_name || p?.customer || "Customer",
    customerAddress: p?.address || "", customerPhone: p?.contact_phone || "", customerEmail: p?.contact_email || "",
    projectId: accessId, depositPct: row.deposit_pct, fileBase: projectFileBase(p || { access_id: accessId }),
    invoiceNo: `INV-${String(row.id).padStart(4, "0")}-v${row.version || 1}`,
  };
  const figs = { lines, grandWithAddons: +fin?.total || 0, paidTotal: +fin?.paid || 0, balance: +fin?.balance || 0 };
  return { meta, figs, payments: getProjectPayments(accessId) || [], invoiceNo: meta.invoiceNo, balance: figs.balance };
}

// The invoice PDF bytes (Buffer), with the due date stamped. Null when there's nothing to bill.
export function buildInvoicePdfBytes(accessId, { dueDate } = {}) {
  const f = buildInvoiceFigures(accessId);
  if (!f) return null;
  const doc = downloadInvoicePdf({ ...f.meta, __return: true, dueDate }, f.figs, f.payments);
  return Buffer.from(doc.output("arraybuffer"));
}
