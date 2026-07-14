"use server";

import { headers } from "next/headers";
import {
  getJobByAccessId, getActiveProposal, saveProposalDraft, markProposalSent,
  reviseProposal, selectProposalOption, requestProposalChanges,
  getPriceBook, setPriceBook, setProposalTechPricing, setProposalCustomerFlags,
  signProposal, acceptWorkOrder, getProjectPayments, addProjectPayment, deleteProjectPayment,
  confirmProjectPayment, voidProposalSignature,
  getStageAcceptances, acceptStage, unacceptStage, updateStage,
  declineOption, resolveCustomerFlag,
  getProjectNotes, getScopedNotes, addProjectNote, setProjectPoc, maybeAutoAdvance,
  getToolData, saveToolData, TOOL_KEYS, getToolMeta,
  getRateBook, saveRateScope, getEffectiveRates, DEFAULT_RATES,
  getApprovedAddons, submitRequest,
  approvePcpAgreement, finalizePcp,
} from "../../../lib/db";
import { sanitizeProposal, validatePayload } from "../../../lib/proposal";
import { fetchTracking } from "../../../lib/tracking";
import { emailProposalReady } from "../../../lib/email";

const STAFF_EDIT = new Set(["admin", "manager", "sales"]);

// Session-token role resolution — same pattern as actions.js updateProjectInfoAction.
// The client's `view` prop is display-only; every write re-verifies here.
async function getSessionRole() {
  const hdrs   = await headers();
  const cookie = hdrs.get("cookie") || "";
  const getC   = (name) => cookie.split(";").find((c) => c.trim().startsWith(name + "="))?.split("=").slice(1).join("=");
  const { parseToken, parseAccessToken } = await import("../../../lib/auth");
  const raw = getC("iot_session");
  if (raw) { const tok = await parseToken(raw.trim()); if (tok?.role) return tok; }
  // Fall back to a PIN-scoped access cookie (customer/tech who unlocked via project PIN).
  const acc = getC("iot_access");
  if (acc) { const at = await parseAccessToken(acc.trim()); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}

function customerOwnsProject(tok, accessId) {
  if (tok?.viaPin) return String(tok.accessId) === String(accessId);  // PIN is project-scoped
  const proj = getJobByAccessId(accessId);
  return proj && String(proj.contact_email || "").toLowerCase() === String(tok.email || "").toLowerCase();
}

async function revalidate(accessId) {
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
}

export async function getProposalAction(accessId) {
  const tok = await getSessionRole();
  const role = tok?.role || "customer";
  return { ok: true, proposal: sanitizeProposal(getActiveProposal(accessId), role) };
}

// ---- Company-wide price book (shared across devices/users) ----
// Shape: { prices, names, hidden, custom } — see lib/db.js getPriceBook/setPriceBook.
export async function getPriceBookAction() {
  const tok = await getSessionRole();
  if (!tok || !STAFF_EDIT.has(tok.role)) return { ok: false, book: { prices: {}, names: {}, hidden: {}, custom: {} } };
  return { ok: true, book: getPriceBook() };
}
export async function savePriceBookAction(book) {
  const tok = await getSessionRole();
  if (!tok || !["admin", "manager"].includes(tok.role)) return { error: "Only Admin & Manager can set default pricing." };
  const saved = setPriceBook(book, tok.name || tok.email || tok.role);
  return { ok: true, book: saved };
}

// ---- Technician work-order pricing (admin/manager only, set at the install stage) ----
// `techMap` = { itemId: techPrice }. Updates the active proposal's payload in place — no new
// version, no change to the customer-facing numbers. Returns the admin-sanitized proposal.
export async function saveTechPricingAction(accessId, techMap) {
  const tok = await getSessionRole();
  if (!tok || !["admin", "manager"].includes(tok.role)) return { error: "Only Admin & Manager can set tech pricing." };
  if (!techMap || typeof techMap !== "object") return { error: "Bad tech pricing." };
  for (const v of Object.values(techMap)) {
    if (!(+v >= 0 && +v <= 1000000)) return { error: "Bad tech price value." };
  }
  const row = setProposalTechPricing(accessId, techMap);
  if (!row) return { error: "No proposal to price." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

export async function saveProposalDraftAction(accessId, { payload, taxRate, depositPct }) {
  const tok = await getSessionRole();
  if (!tok || !STAFF_EDIT.has(tok.role)) return { error: "Unauthorized." };
  const err = validatePayload(payload);
  if (err) return { error: err };
  if (!(+taxRate >= 0 && +taxRate <= 30)) return { error: "Bad tax rate." };
  if (!(+depositPct >= 0 && +depositPct <= 100)) return { error: "Bad deposit %." };

  // Sales can never write (or probe) cost — overwrite incoming cost with stored values.
  if (tok.role === "sales") {
    const walk = (p, fn) => p.options?.forEach((o) =>
      o.services?.forEach((s) => s.items?.forEach((it) => { fn(it); it.sub?.forEach(fn); }))
    );
    const stored = getActiveProposal(accessId);
    const storedCost = new Map();
    if (stored) {
      try { walk(JSON.parse(stored.payload), (it) => storedCost.set(it.id, it.cost)); } catch {}
    }
    walk(payload, (it) => { it.cost = storedCost.get(it.id) ?? 0; });
  }

  const row = saveProposalDraft(accessId, { payload, taxRate, depositPct }, tok.name || tok.email || tok.role);
  if (!row) return { error: "Proposal was already sent — revise it to make changes." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

export async function sendProposalAction(accessId) {
  const tok = await getSessionRole();
  if (!tok || !STAFF_EDIT.has(tok.role)) return { error: "Unauthorized." };
  const cur = getActiveProposal(accessId);
  if (!cur || cur.status !== "draft") return { error: "No draft to send." };
  let payload;
  try { payload = JSON.parse(cur.payload); } catch { return { error: "Malformed proposal." }; }
  const hasItems = payload.options?.some((o) => o.services?.some((s) => s.items?.length));
  if (!hasItems) return { error: "Add at least one line item first." };
  const row = markProposalSent(accessId, tok.name || tok.email || tok.role);
  // Notify the customer their proposal is ready — fire-and-forget so a slow/failed
  // email never blocks or fails the send. No-op until RESEND_API_KEY is configured.
  emailProposalReady(accessId).catch(() => {});
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

export async function reviseProposalAction(accessId) {
  const tok = await getSessionRole();
  if (!tok || !STAFF_EDIT.has(tok.role)) return { error: "Unauthorized." };
  const row = reviseProposal(accessId, tok.name || tok.email || tok.role);
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

// Accept (toggle) an option. When accepting (not un-accepting), the client also passes the
// customer's signature (typed name + drawn data URL) so acceptance is signed in one step; the
// signature is stored on the proposal and rendered on-screen + in the downloadable PDF.
export async function selectOptionAction(accessId, optKey, sign) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Session expired — unlock the project again to accept." };
  if (tok.role === "customer") {
    if (!customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  } else if (!["admin", "manager"].includes(tok.role)) {
    return { error: `Accepting is for the customer (you're signed in as ${tok.role}).` };
  }
  if (!["A", "B", "C"].includes(optKey)) return { error: "Bad option." };
  let row = selectProposalOption(accessId, optKey);
  if (!row) return { error: "Proposal isn't open for selection." };
  // If this was an ACCEPT (option now in the set) and a signature was supplied, record it.
  const nowAccepted = (() => { try { return JSON.parse(row.accepted_options || "[]").includes(optKey); } catch { return false; } })();
  if (nowAccepted && sign && sign.name) {
    const signed = signProposal(accessId, sign.name, sign.data || null);
    if (signed) row = signed;
  }
  const stage = maybeAutoAdvance(accessId);
  await revalidate(accessId);
  return { ok: true, stage, proposal: sanitizeProposal(row, tok.role) };
}

// Customer declines ONE option (with a short reason). Independent of accepted options — declining
// B never un-accepts A. Toggling the same option again un-declines it.
export async function declineOptionAction(accessId, optKey, reason) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Session expired — unlock the project again to decline." };
  if (tok.role === "customer") {
    if (!customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  } else if (!["admin", "manager"].includes(tok.role)) {
    return { error: `Declining is for the customer (you're signed in as ${tok.role}).` };
  }
  if (!["A", "B", "C"].includes(optKey)) return { error: "Bad option." };
  const row = declineOption(accessId, optKey, reason);
  if (!row) return { error: "Proposal isn't open for a decision." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

// Staff resolve (clear) one customer change-request flag — Mark done or Discard.
export async function resolveFlagAction(accessId, itemId) {
  const tok = await getSessionRole();
  if (!tok || !["admin", "manager", "sales"].includes(tok.role)) return { error: "Unauthorized." };
  const row = resolveCustomerFlag(accessId, itemId);
  if (!row) return { error: "No proposal." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

export async function requestChangesAction(accessId, note) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  const row = requestProposalChanges(accessId, note);
  if (!row) return { error: "Proposal isn't open for change requests." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

// Per-line customer revision flags: { itemId: { type:"remove"|"change", note } }. Customer (own
// project) or staff previewing may submit; flips the proposal to changes_requested for our review.
export async function submitProposalFlagsAction(accessId, flags, note) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  if (flags && typeof flags === "object") {
    for (const f of Object.values(flags)) {
      if (!f || !["remove", "change"].includes(f.type)) return { error: "Bad flag." };
    }
  }
  const row = setProposalCustomerFlags(accessId, flags || {}, note);
  if (!row) return { error: "Proposal isn't open for change requests." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

// Lightweight polling endpoint — a compact, diffable snapshot of everything that can change
// out from under whoever's looking at this page (staff moves the stage, or the other party
// signs / pays / approves while it's open). The client polls this on an interval and diffs it
// against its last snapshot to auto-refresh state and surface a toast — no full page reload,
// no dependence on a real activity-log table (the project doesn't have one).
export async function getLiveSnapshotAction(accessId) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  const p = getJobByAccessId(accessId);
  if (!p) return { error: "Not found." };
  const proposal = getActiveProposal(accessId);
  const payments = getProjectPayments(accessId);
  const acceptances = getStageAcceptances(accessId);
  const confirmed = payments.filter((x) => x.status !== "pending");
  return {
    ok: true,
    stage: p.stage,
    completed_at: p.completed_at || null,
    proposal: proposal ? {
      status: proposal.status,
      signed_name: proposal.signed_name,
      signed_at: proposal.signed_at,
      pcp_status: proposal.pcp_status,
      pcp_agreed_at: proposal.pcp_agreed_at,
      accepted_options: (() => { try { return JSON.parse(proposal.accepted_options || "[]"); } catch { return []; } })(),
      tech_signed_name: proposal.tech_signed_name,
    } : null,
    paymentsCount: payments.length,
    paymentsConfirmedTotal: confirmed.reduce((s, x) => s + (+x.amount || 0), 0),
    acceptances: Object.fromEntries(Object.entries(acceptances || {}).map(([k, v]) => [k, !!v])),
  };
}

// ---- PCP (Performance Credit Program) ----
// Customer acknowledges the PCP agreement in one click (records their signature). Staff
// previewing the customer view may also trigger it. Credit stays pending until admin finalizes.
export async function approvePcpAction(accessId, name, signature) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Session expired — unlock the project again." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  const row = approvePcpAgreement(accessId, name, signature);
  if (!row) return { error: "No proposal to attach the PCP agreement to." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}
// Admin/manager finalizes or adjusts the discretionary credit (approve + attribute grant source).
export async function finalizePcpAction(accessId, patch) {
  const tok = await getSessionRole();
  if (!tok || !["admin", "manager"].includes(tok.role)) return { error: "Unauthorized." };
  const row = finalizePcp(accessId, patch || {});
  if (!row) return { error: "No proposal." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}

// ---- Approval & Deposit stage: signing, payments, acceptances, work order ----
const STAFF = new Set(["admin", "manager"]);

// Bundle the approval page needs in one round-trip: sanitized proposal + payments + acceptances.
export async function getApprovalDataAction(accessId) {
  const tok = await getSessionRole();
  const role = tok?.role || "customer";
  return {
    ok: true,
    proposal: sanitizeProposal(getActiveProposal(accessId), role),
    payments: getProjectPayments(accessId),
    acceptances: getStageAcceptances(accessId),
    addons: getApprovedAddons(accessId),  // approved job-site add-ons fold into the amount owed
  };
}

// Customer (or staff previewing) signs the accepted proposal.
export async function signProposalAction(accessId, name, signatureData) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  if (!String(name || "").trim()) return { error: "A name is required to sign." };
  const row = signProposal(accessId, name, signatureData);
  if (!row) return { error: "Accept the proposal before signing." };
  const stage = maybeAutoAdvance(accessId);
  await revalidate(accessId);
  return { ok: true, stage, proposal: sanitizeProposal(row, tok.role) };
}

// Technician accepts the work order (signs the same way the customer does). On success the tech
// is assigned to the project. Only techs (via PIN or a tech-role session) may accept, and only
// their own project when PIN-scoped.
export async function acceptWorkOrderAction(accessId, name, signatureData) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role !== "tech") return { error: "Only a technician can accept a work order." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your work order." };
  if (!String(name || "").trim()) return { error: "A name is required to sign." };
  // Any tech may accept — no pre-assignment needed (owner, 2026-07-13). Accepting IS what
  // assigns them the job; a prior office assignment is simply superseded by whoever signs.
  const row = acceptWorkOrder(accessId, name, signatureData);
  if (!row) return { error: "This work order isn't available to accept yet." };
  const stage = maybeAutoAdvance(accessId);
  await revalidate(accessId);
  return { ok: true, stage, proposal: sanitizeProposal(row, "tech") };
}

// A tech who isn't the assigned technician asks the office to assign them this job. Logged as a
// pending request the office can approve from the project's Requests panel.
export async function requestAssignmentAction(accessId, techName) {
  const tok = await getSessionRole();
  if (!tok || tok.role !== "tech") return { error: "Only a technician can request assignment." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your project." };
  const who = String(techName || "").trim() || "A technician";
  submitRequest(accessId, {
    requestType: "assignment",
    description: `${who} requests to be assigned this job.`,
    notes: null,
    submittedById: null,
    submittedByName: who,
  });
  await revalidate(accessId);
  return { ok: true };
}

// Staff record a received payment; customer records an acknowledgement (source tags who).
export async function recordPaymentAction(accessId, payment) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  const isCustomer = tok.role === "customer";
  if (isCustomer && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  if (!isCustomer && !STAFF.has(tok.role)) return { error: "Unauthorized." };
  if (!(+payment?.amount > 0)) return { error: "Enter an amount." };
  const payments = addProjectPayment(accessId, {
    amount: payment.amount, method: payment.method, kind: payment.kind,
    source: isCustomer ? "customer" : "staff", note: payment.note,
  }, tok.name || tok.email || tok.role);
  const stage = maybeAutoAdvance(accessId);
  await revalidate(accessId);
  return { ok: true, stage, payments };
}
export async function deletePaymentAction(accessId, id) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer") {
    // A customer may cancel ONLY their own still-pending submission — never a confirmed payment
    // or a staff entry. Re-check server-side (client gating isn't trusted).
    if (!customerOwnsProject(tok, accessId)) return { error: "Not your project." };
    const p = (getProjectPayments(accessId) || []).find((x) => String(x.id) === String(id));
    if (!p || p.source !== "customer" || p.status !== "pending")
      return { error: "You can only cancel a pending payment you submitted." };
  } else if (!STAFF.has(tok.role)) {
    return { error: "Only Admin & Manager can remove payments." };
  }
  const payments = deleteProjectPayment(accessId, id, { id: tok.id ?? null, name: tok.name || tok.email || tok.role });
  await revalidate(accessId);
  return { ok: true, payments };
}
// Admin/manager correction: void a customer signature so the agreement can be re-signed.
// The proposal record is preserved (signature fields cleared only).
export async function voidProposalSignatureAction(accessId) {
  const tok = await getSessionRole();
  if (!tok || !["admin", "manager"].includes(tok.role)) return { error: "Only Admin & Manager can void a signature." };
  const row = voidProposalSignature(accessId);
  if (!row) return { error: "No proposal to void." };
  await revalidate(accessId);
  return { ok: true, proposal: sanitizeProposal(row, tok.role) };
}
// Staff confirm a customer-submitted payment (money actually received) — it then counts
// toward the balance and the deposit gate.
export async function confirmPaymentAction(accessId, id) {
  const tok = await getSessionRole();
  if (!tok || !STAFF.has(tok.role)) return { error: "Only Admin & Manager can confirm payments." };
  const payments = confirmProjectPayment(accessId, id);
  const stage = maybeAutoAdvance(accessId);
  await revalidate(accessId);
  return { ok: true, stage, payments };
}

// Reads are gated too: a project's acceptance state and its notes thread are private to the
// people on the project (staff, or the customer/tech whose session/PIN matches it).
async function canReadProject(accessId) {
  const tok = await getSessionRole();
  if (!tok) return false;
  if (["admin", "manager", "sales"].includes(tok.role)) return true;
  if (tok.viaPin) return String(tok.accessId) === String(accessId);
  if (tok.role === "customer") return customerOwnsProject(tok, accessId);
  return tok.role === "tech";   // logged-in tech account (project scoping via assignment)
}
// Live shipment status from the tracking aggregator. Anyone who can see the project can refresh
// it (package status isn't sensitive); returns { ok:false, reason } when no API key is configured
// so the caller falls back to the manually-set status.
export async function trackPackageAction(accessId, number, carrier, force = false) {
  if (!(await canReadProject(accessId))) return { ok: false, reason: "unauthorized" };
  return await fetchTracking(number, carrier, { force });
}
// Rate library — internal only (rates are technician payout figures, never shown to customers).
export async function getRatesAction(accessId, techName) {
  const tok = await getSessionRole();
  if (!tok || tok.role === "customer") return { ok: false };
  if (!(await canReadProject(accessId))) return { ok: false };
  return { ok: true, book: getRateBook(), defaults: DEFAULT_RATES, effective: getEffectiveRates(techName || null) };
}
export async function saveRatesAction(scope, data) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (!["admin", "manager"].includes(tok.role)) return { error: "Only the office can edit rates." };
  const ok = saveRateScope(scope, data || {}, tok.name || tok.email || tok.role);
  if (!ok) return { error: "Bad rate scope." };
  return { ok: true, book: getRateBook() };
}
export async function getAcceptancesAction(accessId) {
  if (!(await canReadProject(accessId))) return { ok: false, acceptances: {}, toolMeta: null };
  // toolMeta = per-tool { has, fingerprint } so the client knows which tools need approval and
  // whether a prior approval was voided by a later change (accepted fingerprint ≠ current).
  return { ok: true, acceptances: getStageAcceptances(accessId), toolMeta: getToolMeta(accessId) };
}

// ---- Browser-tool data backup: survey / mockup / schedule ----
// The tools draft in localStorage; these actions keep an authoritative server copy so a cleared
// cache or a new device never loses work. Reads use the same project-read gate as notes.
// Per-role read views. Reads used to hand the raw payload to anyone on the project, which let a
// customer pull tech payout data out of the install/addendum blobs (and the crew list) even though
// the UI hid it. The wire itself has to be clean, so the payload is filtered here.
function sanitizeToolRead(tool, role, saved) {
  if (!saved?.data || (role !== "customer" && role !== "tech")) return saved;
  try {
    if (tool === "addendum") {
      const j = JSON.parse(saved.data);
      j.addendums = (j.addendums || []).map((a) => {
        const out = { ...a, items: (a.items || []).map((it) => {
          const c = { ...it };
          if (role === "customer") delete c.techPay;   // customer never sees the tech payout
          if (role === "tech") delete c.price;         // tech never sees the retail price
          return c;
        }) };
        if (role === "tech") delete out.discount;
        return out;
      });
      return { ...saved, data: JSON.stringify(j) };
    }
    if (tool === "install" && role === "customer") {
      // Customer's install view is progress-only: steps + item shape. Notes, payouts, EODs,
      // requests, and the work log are internal.
      const j = JSON.parse(saved.data);
      const keep = {
        steps: j.steps || {},
        removed: j.removed || [],
        custom: (j.custom || []).map(({ payout, techPay, price, ...rest }) => rest),
      };
      return { ...saved, data: JSON.stringify(keep) };
    }
  } catch { /* unparseable blob — fall through unfiltered only for staff; safest is empty */
    if (role === "customer" || role === "tech") return { ...saved, data: "" };
  }
  return saved;
}

export async function getToolDataAction(accessId, tool) {
  if (!TOOL_KEYS.has(tool)) return { ok: false };
  const tok = await getSessionRole();
  if (!tok || !(await canReadProject(accessId))) return { ok: false };
  // Crew assignments are internal — the customer's page never renders them, so don't send them.
  if (tool === "techs" && tok.role === "customer") return { ok: false };
  return { ok: true, saved: sanitizeToolRead(tool, tok.role, getToolData(accessId, tool)) };
}
export async function saveToolDataAction(accessId, tool, data) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Session expired." };
  if (!TOOL_KEYS.has(tool)) return { error: "Unknown tool." };
  // 8MB ceiling (matches next.config serverActions.bodySizeLimit): the mockup's photo grid is
  // data-URL images and a real job easily passes 2MB — localStorage caps the blob near ~5MB.
  if (typeof data !== "string" || data.length > 8_000_000) return { error: "Bad payload." };
  // Who may write each tool: survey/mockup = office; schedule = office + customer; install
  // checklist = office + the technician doing the work.
  const editors = tool === "schedule" ? ["admin", "manager", "sales", "customer"]
    : tool === "install" ? ["admin", "manager", "tech"]
    : tool === "addendum" ? ["admin", "manager", "sales", "customer"]  // office builds, customer approves
    : tool === "receiving" ? ["admin", "manager", "sales", "tech"]     // office/tech mark gear received
    : tool === "techs" ? ["admin", "manager"]                          // crew assignment — admin/manager only, not sales
    : tool === "qc" ? ["admin", "manager", "tech"]                     // office + installing tech run QC
    : ["admin", "manager", "sales"];
  if (!editors.includes(tok.role)) return { error: "Read-only for your role." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your project." };
  // A customer's addendum write is a signature, nothing more: their copy came over the wire
  // without techPay (see sanitizeToolRead), so saving it verbatim would wipe payout data — and
  // trusting it verbatim would let a tampered client rewrite prices. Reduce the write to
  // sign/decline fields applied over the stored record.
  let payload = data;
  if (tool === "addendum" && tok.role === "customer") {
    payload = mergeCustomerAddendumWrite(accessId, data);
    if (payload == null) return { error: "Bad payload." };
  }
  const saved = saveToolData(accessId, tool, payload, tok.name || tok.email || tok.role);
  return { ok: true, saved: { updated_at: saved.updated_at } };
}

function mergeCustomerAddendumWrite(accessId, data) {
  let incoming;
  try { incoming = JSON.parse(data); } catch { return null; }
  let stored = {};
  try { stored = JSON.parse(getToolData(accessId, "addendum")?.data || "{}"); } catch { /* fresh */ }
  const inMap = new Map((incoming.addendums || []).map((a) => [a.id, a]));
  const merged = (stored.addendums || []).map((a) => {
    const inc = inMap.get(a.id);
    // Only a pending addendum can change, and only to approved/declined with signature fields.
    if (!inc || a.status !== "pending" || !["approved", "declined"].includes(inc.status)) return a;
    const out = { ...a, status: inc.status };
    if (inc.signedName != null) out.signedName = String(inc.signedName).slice(0, 200);
    if (inc.signedAt != null) out.signedAt = String(inc.signedAt).slice(0, 40);
    if (inc.signatureData != null) out.signatureData = String(inc.signatureData).slice(0, 500000);
    return out;
  });
  return JSON.stringify({ ...stored, addendums: merged });
}

// ---- Inquiry stage: notes thread + appointment point-of-contact ----
export async function getNotesAction(accessId) {
  if (!(await canReadProject(accessId))) return { ok: false, notes: [] };
  return { ok: true, notes: getProjectNotes(accessId) };
}
export async function addNoteAction(accessId, body) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Session expired — unlock the project again." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  if (!String(body || "").trim()) return { error: "Write a note first." };
  const notes = addProjectNote(accessId, { role: tok.role, name: tok.name || tok.email || tok.role, body: body.trim() });
  await revalidate(accessId);
  return { ok: true, notes };
}
// Survey comments — a customer can't edit the read-only survey, but they can leave quick notes
// ("move this", "remove that"). Scoped to 'survey' so they show under the survey for staff.
export async function addSurveyNoteAction(accessId, body) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Session expired — unlock the project again." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  const text = String(body || "").trim();
  if (!text) return { error: "Write a note first." };
  const notes = addProjectNote(accessId, { role: tok.role, name: tok.name || tok.email || tok.role, body: text, scope: "survey" });
  await revalidate(accessId);
  return { ok: true, notes };
}
export async function getSurveyNotesAction(accessId) {
  const tok = await getSessionRole();
  if (!tok) return { notes: [] };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { notes: [] };
  return { notes: getScopedNotes(accessId, "survey") };
}
export async function setPocAction(accessId, { name, phone }) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Session expired — unlock the project again." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  setProjectPoc(accessId, { name, phone });
  await revalidate(accessId);
  return { ok: true };
}

// Customer accepts a stage's deliverable (site survey / mockup) to unlock forward progress.
export async function acceptStageAction(accessId, stage, on = true) {
  const tok = await getSessionRole();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer" && !customerOwnsProject(tok, accessId)) return { error: "Not your project." };
  if (!["site_survey", "mockup"].includes(stage)) return { error: "Bad stage." };
  // Capture the CURRENT data fingerprint server-side so a later change voids this approval.
  const meta = getToolMeta(accessId);
  const fp = stage === "site_survey" ? meta.survey.fingerprint : meta.mockup.fingerprint;
  const acceptances = on
    ? acceptStage(accessId, stage, tok.name || tok.email || tok.role, fp)
    : unacceptStage(accessId, stage);
  const newStage = maybeAutoAdvance(accessId);
  await revalidate(accessId);
  return { ok: true, stage: newStage, acceptances };
}

// Office submits the survey / mockup for the customer to review. Recorded under a `submit_<tool>`
// key (reusing the acceptance store) with the tool's current fingerprint — so if the office edits
// the tool afterward, the fingerprint changes and the submission reads as "changed, re-submit",
// and the customer can't approve a draft that hasn't been submitted at its current state.
export async function submitToolAction(accessId, tool, on = true) {
  const tok = await getSessionRole();
  if (!tok || !STAFF_EDIT.has(tok.role)) return { error: "Only the office can submit this for review." };
  if (!["site_survey", "mockup"].includes(tool)) return { error: "Bad tool." };
  const meta = getToolMeta(accessId);
  const has  = tool === "site_survey" ? meta.survey.has : meta.mockup.has;
  if (on && !has) return { error: "Add something to the tool before submitting it." };
  const fp   = tool === "site_survey" ? meta.survey.fingerprint : meta.mockup.fingerprint;
  const key  = `submit_${tool}`;
  const acceptances = on
    ? acceptStage(accessId, key, tok.name || tok.email || tok.role, fp)
    : unacceptStage(accessId, key);
  await revalidate(accessId);
  return { ok: true, acceptances };
}

// Staff create the work order (advance approval → schedule) once a deposit is on file.
export async function createWorkOrderAction(accessId) {
  const tok = await getSessionRole();
  if (!tok || !STAFF.has(tok.role)) return { error: "Only Admin & Manager can create the work order." };
  // Pipeline order is accepted → signed → deposit → work order; enforce it server-side too.
  const cur = getActiveProposal(accessId);
  if (!cur || cur.status !== "accepted") return { error: "The customer hasn't accepted a proposal option yet." };
  if (!cur.signed_name) return { error: "The customer hasn't signed the agreement yet." };
  const paid = getProjectPayments(accessId).some((p) => p.kind === "deposit" && +p.amount > 0 && p.status === "confirmed");
  if (!paid) return { error: "A confirmed deposit is required before creating the work order." };
  const updated = updateStage(accessId, "schedule");
  if (!updated) return { error: "Could not advance the project." };
  await revalidate(accessId);
  return { ok: true, stage: "schedule" };
}
