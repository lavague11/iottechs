// Reuse a previous proposal — the pure half (no DB, no React). Two sources feed the SAME editor:
//   clonePayload()          structured copy of an existing proposal's payload (Path A)
//   importCandidateToPayload()  a reviewed extraction from an old PDF (Path B)
// Both hand back a fresh payload the normal proposal flow owns from then on. An old proposal is a
// STARTING POINT, never the current proposal: copy structure, reset identity / signature / money.
import { newItemId, PROPOSAL_SERVICES, serviceLabel, priceOf, allCatalogEntries, optionTotals, PAYMENT_PLANS } from "./proposal.js";

const parse = (v) => { if (v == null) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };
const r2 = (n) => Math.round((+n || 0) * 100) / 100;

// Internal-only fields on a line item — copied only when the actor may see them.
const INTERNAL_ITEM_KEYS = ["cost", "techPrice"];

// Deep-copy the selected options with NEW item ids. `sub` bundles keep their relative structure;
// camera_id/cid links are dropped (they point at the SOURCE project's survey cameras).
export function clonePayload(sourcePayload, opts = {}) {
  const src = parse(sourcePayload) || {};
  const {
    optionIds = null,           // null = every option
    includeInternal = false,    // cost / techPrice (admin+manager only — the action decides)
    includeNotes = true,        // option/service notes (customer-facing)
    includePaymentPlan = true,  // payment_plan + custom_plan structure (amounts derive from the new total)
    includeDiscount = true,     // discount + PCP credit structure
    addendumItems = [],         // [{name,type,qty,price,techPay}] the caller chose to fold in (already sanitized)
  } = opts;
  const pickItem = (it) => {
    const out = { id: newItemId(), name: it?.name || "", qty: +it?.qty || 1, price: r2(it?.price) };
    if (it?.waived) out.waived = true;
    if (it?.outdoor) out.outdoor = true;
    if (it?.unit) out.unit = it.unit;
    if (it?.description) out.description = it.description;
    if (it?.category) out.category = it.category;
    if (includeInternal) for (const k of INTERNAL_ITEM_KEYS) if (it?.[k] != null) out[k] = +it[k] || 0;
    if (Array.isArray(it?.sub) && it.sub.length) out.sub = it.sub.map((x) => ({ id: newItemId(), name: x?.name || "", qty: +x?.qty || 1, price: r2(x?.price), ...(includeInternal && x?.techPrice != null ? { techPrice: +x.techPrice || 0 } : {}), ...(includeInternal && x?.cost != null ? { cost: +x.cost || 0 } : {}) }));
    return out;
  };
  const wanted = (src.options || []).filter((o) => !optionIds || optionIds.includes(o.id));
  const options = (wanted.length ? wanted : (src.options || []).slice(0, 1)).map((o, i) => ({
    id: ["A", "B", "C"][i],
    name: o?.name || `Option ${["A", "B", "C"][i]}`,
    services: (o?.services || []).map((s) => ({ key: s?.key || "custom", label: s?.label || serviceLabel(s?.key || "custom"), items: (s?.items || []).map(pickItem), note: includeNotes ? (s?.note || "") : "" })),
    note: includeNotes ? (o?.note || "") : "",
    includeMockup: false, includeSurvey: false,   // those attach to the SOURCE project's tools
  }));
  if (addendumItems.length && options[0]) {
    let svc = options[0].services.find((s) => s.key === "custom");
    if (!svc) { svc = { key: "custom", label: serviceLabel("custom"), items: [], note: "" }; options[0].services.push(svc); }
    for (const a of addendumItems) svc.items.push({ id: newItemId(), name: a?.name || "", qty: +a?.qty || 1, price: r2(a?.price), ...(includeInternal && a?.techPay != null ? { techPrice: +a.techPay || 0 } : {}) });
  }
  const out = { options: options.length ? options : [{ id: "A", name: "Option A", services: [], note: "", includeMockup: false, includeSurvey: false }] };
  out.discount = includeDiscount && src.discount ? { ...src.discount } : { type: "flat", value: 0 };
  out.pcp_credit = includeDiscount && src.pcp_credit ? (typeof src.pcp_credit === "object" ? { ...src.pcp_credit } : src.pcp_credit) : { type: "flat", value: 0 };
  out.payment_plan = includePaymentPlan && src.payment_plan ? src.payment_plan : "50_50";
  if (includePaymentPlan && src.custom_plan) out.custom_plan = { ...src.custom_plan, rows: (src.custom_plan.rows || []).map((r) => ({ pct: +r.pct || 0 })) };   // structure only — no dates, no paid amounts
  return out;
}

// Per-item price differences between a (copied) payload and today's catalog. Only items whose
// name resolves to a catalog entry are compared; custom names (survey locations etc.) are skipped.
// Never mutates — the caller decides Keep copied / Use current.
export function pricingReview(payload, book) {
  const pl = parse(payload) || {};
  const catalog = new Map(allCatalogEntries(book).map((c) => [c.name.toLowerCase(), c]));
  const diffs = [];
  for (const o of pl.options || []) for (const s of o.services || []) for (const it of s.items || []) {
    const c = catalog.get(String(it?.name || "").toLowerCase());
    if (!c) continue;
    const current = r2(priceOf(c.baseName, book));
    if (current !== r2(it.price)) diffs.push({ itemId: it.id, option: o.id, name: it.name, copied: r2(it.price), current });
  }
  return diffs;
}
export function applyPrices(payload, updates) {   // updates: { [itemId]: newPrice }
  const pl = JSON.parse(JSON.stringify(parse(payload) || {}));
  for (const o of pl.options || []) for (const s of o.services || []) for (const it of s.items || []) if (it.id in updates) it.price = r2(updates[it.id]);
  return pl;
}

// A compact summary for the picker / preview (no payload leaves the server).
export function summarizeProposalRow(row) {
  const pl = parse(row?.payload) || {};
  const accepted = (() => { try { return JSON.parse(row?.accepted_options || "[]"); } catch { return []; } })();
  const opt = (pl.options || []).find((o) => accepted.includes(o.id)) || (pl.options || [])[0];
  const items = opt ? (opt.services || []).reduce((n, s) => n + (s.items || []).length, 0) : 0;
  const total = opt ? optionTotals(opt, row.tax_rate, pl.discount, row.deposit_pct, pl.pcp_credit).grand : 0;
  const services = [...new Set((pl.options || []).flatMap((o) => (o.services || []).map((s) => s.key)))];
  return {
    id: row.id, version: row.version, status: row.status, items, total: r2(total), options: (pl.options || []).map((o) => ({ id: o.id, name: o.name, accepted: accepted.includes(o.id), items: (o.services || []).reduce((n, s) => n + (s.items || []).length, 0) })),
    services, plan: PAYMENT_PLANS[pl.payment_plan]?.label || pl.payment_plan || null,
    signed: !!row.signed_name, date: row.signed_at || row.sent_at || row.updated_at || row.created_at || null,
  };
}

// ---- Path B: an extraction candidate (from the PDF reader) → a payload the editor owns ----------
// Candidate shape (what the reader returns and the review screen edits):
//   { customer, date, proposal_number, items:[{ name, description, qty, unit_price, total, section, confidence:"high"|"low" }],
//     subtotal, tax, total, discount, payment_terms, notes, exclusions, warranty, uncertain:[field,...] }
export function importCandidateToPayload(candidate, opts = {}) {
  const c = candidate || {};
  const serviceKey = PROPOSAL_SERVICES.some((s) => s.key === opts.serviceKey) ? opts.serviceKey : "custom";
  const items = (c.items || []).filter((it) => String(it?.name || "").trim()).map((it) => {
    const out = { id: newItemId(), name: String(it.name).trim().slice(0, 120), qty: Math.max(0, Math.min(9999, +it.qty || 1)), price: r2(Math.max(0, Math.min(1000000, +it.unit_price || 0))) };
    if (it.description) out.description = String(it.description).slice(0, 400);
    return out;
  });
  const bySection = new Map();
  for (const it of items) { const k = "all"; if (!bySection.has(k)) bySection.set(k, []); bySection.get(k).push(it); }
  const payload = {
    options: [{ id: "A", name: "Option A", services: [{ key: serviceKey, label: serviceLabel(serviceKey), items, note: [c.notes, c.exclusions ? `Exclusions: ${c.exclusions}` : null, c.warranty ? `Warranty: ${c.warranty}` : null].filter(Boolean).join("\n").slice(0, 2000) }], note: "", includeMockup: false, includeSurvey: false }],
    discount: +c.discount > 0 ? { type: "flat", value: r2(c.discount) } : { type: "flat", value: 0 },
    pcp_credit: { type: "flat", value: 0 },
    payment_plan: guessPlan(c.payment_terms),
  };
  return payload;
}
function guessPlan(terms) {
  const t = String(terms || "").toLowerCase();
  if (/100\s*%|paid in full|full payment/.test(t)) return "100";
  if (/50.{0,12}30.{0,12}20/.test(t)) return "50_30_20";
  return "50_50";
}
// Sum of the extracted lines vs. what the document says. `ok` is false when they disagree by more
// than a dollar (or the document total is unknown) — the review screen shows "Totals need review".
export function reconcileTotals(candidate) {
  const c = candidate || {};
  const lines = r2((c.items || []).reduce((s, it) => s + (Math.max(0, +it?.qty || 0) * Math.max(0, +it?.unit_price || 0)), 0));
  const subtotal = c.subtotal != null ? r2(c.subtotal) : null;
  const tax = c.tax != null ? r2(c.tax) : 0;
  const total = c.total != null ? r2(c.total) : null;
  const expectTotal = subtotal != null ? r2(subtotal - r2(c.discount || 0) + tax) : null;
  const ok = (subtotal == null || Math.abs(subtotal - lines) <= 1) && (total == null || subtotal == null || Math.abs(expectTotal - total) <= 1);
  return { lines, subtotal, tax, total, ok };
}
// Turn "$1,250.00" / "1250" / "$ 300" into a number; null when it isn't one.
export function parseMoney(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? r2(v) : null;
  const m = String(v).replace(/[,$\s]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? r2(+m[0]) : null;
}
// Normalize whatever the model returned into the candidate shape above (never fabricate: a field
// the document didn't carry stays null / goes on the uncertain list).
export function normalizeCandidate(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const items = (Array.isArray(c.items) ? c.items : []).map((it) => {
    const qty = it?.qty != null && String(it.qty).trim() !== "" ? +String(it.qty).replace(/[^\d.]/g, "") : null;
    const unit = parseMoney(it?.unit_price);
    const tot = parseMoney(it?.total);
    // Fill a missing side from the other two only when arithmetic makes it unambiguous.
    const q = qty != null && qty > 0 ? qty : (unit && tot && unit > 0 ? r2(tot / unit) : null);
    const u = unit != null ? unit : (q && tot != null ? r2(tot / q) : null);
    const low = it?.confidence === "low" || u == null || q == null;
    return { name: String(it?.name || "").trim(), description: it?.description ? String(it.description) : "", qty: q ?? 1, unit_price: u, total: tot ?? (q != null && u != null ? r2(q * u) : null), section: it?.section || null, confidence: low ? "low" : "high" };
  }).filter((it) => it.name);
  return {
    customer: c.customer || null, date: c.date || null, proposal_number: c.proposal_number || null,
    items, subtotal: parseMoney(c.subtotal), tax: parseMoney(c.tax), total: parseMoney(c.total), discount: parseMoney(c.discount),
    payment_terms: c.payment_terms || null, notes: c.notes || null, exclusions: c.exclusions || null, warranty: c.warranty || null,
    uncertain: Array.isArray(c.uncertain) ? c.uncertain.map(String) : [],
  };
}
