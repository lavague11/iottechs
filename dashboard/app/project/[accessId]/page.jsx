import { cookies, headers } from "next/headers";
import { getJobByAccessId, getProjectAssignments, getStaffUsers, getWorkOrdersByProject, getProjectExpenses, getProjectRequests, recordProposalView, getProposalViews, getUserById, ensureBaseAccess, getActiveProposal, getProjectPayments, surveyStageSatisfied, stageEnteredAt } from "../../../lib/db";
import { sanitizeProposal } from "../../../lib/proposal";
import { parseToken, parseAccessToken, verifyPreviewToken } from "../../../lib/auth";
import { LOGIN_VIEW } from "../../../lib/spec";
import Masthead from "../../components/Masthead";
import GatewayClient from "./gateway-client";

// A logged-in session can open a project without re-entering the PIN, as long as
// the session is actually authorized for THIS project:
//  - staff (admin/manager/sales/tech) → their role view
//  - customer → only when they own the project (contact email matches)
const STAFF_ROLES = new Set(["admin", "manager", "sales", "tech"]);

async function resolveSessionView(project, previewRole, previewToken) {
  // If a valid signed preview token is present, grant that role directly — no session required
  if (previewRole && previewToken) {
    const valid = await verifyPreviewToken(project.access_id, previewRole, previewToken);
    if (valid) return previewRole;
  }

  const jar  = await cookies();
  const tok  = jar.get("iot_session")?.value;
  const user = tok ? await parseToken(tok) : null;

  // Project-scoped PIN grant (iot_access). This is what the PIN gate mints — without reading it
  // here, a PIN visitor was bounced back to the gate on every reload, and a staff member who
  // deliberately entered a project PIN flipped back to their login role mid-flow. The PIN is
  // the most RECENT explicit grant for this project, so it wins; every login path clears it.
  const accessRaw = jar.get("iot_access")?.value;
  const access    = accessRaw ? await parseAccessToken(accessRaw) : null;
  const pinView   = access && String(access.accessId) === String(project.access_id)
    ? (LOGIN_VIEW[access.role] || access.role)
    : null;

  if (user) {
    // ?preview= is a view projection, not an auth grant — scope it tightly:
    // admin/manager may preview any role; sales only the customer view; tech none.
    if (previewRole) {
      if (["admin", "manager"].includes(user.role)) return previewRole;
      if (user.role === "sales" && previewRole === "customer") return previewRole;
    }
    if (user.role && user.role !== "customer") {
      return pinView || LOGIN_VIEW[user.role] || null;
    }
    // Customer session — owns the project when their email OR phone matches the contact.
    // (The session token only carries id/role/email, so pull the row for the phone.)
    const row = user.id ? getUserById(user.id) : null;
    const emailOwns = user.email && project.contact_email &&
      String(user.email).trim().toLowerCase() === String(project.contact_email).trim().toLowerCase();
    const digits = (s) => String(s || "").replace(/\D/g, "");
    const phoneOwns = digits(row?.phone).length >= 7 &&
      digits(row?.phone) === digits(project.contact_phone);
    if (emailOwns || phoneOwns) return "customer";
    return pinView; // logged-in customer who unlocked someone else's project with its PIN
  }
  return pinView;   // PIN-only visitor — survives reloads and navigation
}

export default async function ProjectLinkPage({ params, searchParams }) {
  const { accessId } = await params;
  const sp = await searchParams;
  const previewRole  = sp?.preview || null;
  const previewToken = sp?.pt || null;
  const p = getJobByAccessId(accessId);

  if (!p) {
    return (
      <>
        <Masthead docType="Project Access" tag="Secure Link" date="Gated" showNav={false} />
        <div className="wrap">
          <div className="section-head"><span className="sh-num">!</span> Link not found</div>
          <p className="empty">No project matches <span className="mono">{accessId}</span>.</p>
        </div>
      </>
    );
  }

  const project = {
    access_id:       p.access_id,
    customer:        p.customer,
    address:         p.address,
    service:         p.service,          // decorated by db.js (SERVICE_CODES lookup)
    service_code:    p.service_code,
    project_type:    p.project_type,
    stage:           p.stage,
    value:           p.value,
    cameras:         p.cameras,
    tech:            p.tech,
    date:            p.date,
    issue:           p.issue,
    // Intake / inquiry fields
    contact_name:    p.contact_name    || null,
    contact_email:   p.contact_email   || null,
    contact_phone:   p.contact_phone   || null,
    contact_message: p.contact_message || null,
    company_name:    p.company_name    || null,
    install_date:    p.install_date    || null,
    poc_name:        p.poc_name        || null,
    poc_phone:       p.poc_phone       || null,
    source:          p.source          || null,
    hasTechPin:      !!p.tech_pin,
    lost_reason:      p.lost_reason      || null,
    lost_at:          p.lost_at          || null,
    needs_attention:  p.needs_attention  ? 1 : 0,
    attention_note:   p.attention_note   || null,
    sales_rep:         p.sales_rep         || null,
    restricted:        p.restricted        ? 1 : 0,
    completed_at:      p.completed_at      || null,   // completion date — fine for the customer to see
  };

  const initialView  = await resolveSessionView(p, previewRole, previewToken);

  // Who's logged in — so the scheduling tool can invite "me" and so we can auto-add whoever
  // is booking. Derived from the session token (staff) — PIN visitors have no user row.
  let currentUser = null;
  {
    const jar = await cookies();
    const stok = jar.get("iot_session")?.value;
    const su = stok ? await parseToken(stok) : null;
    if (su?.id) { const row = getUserById(su.id); if (row) currentUser = { id: row.id, name: row.name, email: row.email, role: row.role }; }
  }

  // Commission is internal finance — only staff browsers ever receive it. (It was previously
  // in the project object for every role; not rendered, but visible in DevTools.)
  if (["admin", "manager", "sales"].includes(initialView)) {
    project.commission_rate   = p.commission_rate   ?? 0;
    project.commission_status = p.commission_status || "pending";
  }
  // Tech payout is compensation — office sees it to approve; the tech sees their own; never customer/sales.
  if (["admin", "manager", "tech"].includes(initialView)) {
    project.payout_amount = p.payout_amount ?? 0;
    project.payout_status = p.payout_status || "pending";
  }
  // Days in the current stage — an internal ops/aging signal. Staff only (a customer shouldn't see
  // "you've been stuck here 19 days"). Computed from the stage-transition log.
  if (["admin", "manager", "sales", "tech"].includes(initialView)) {
    const enteredAt = stageEnteredAt(p.access_id, p.stage);
    const ms = enteredAt ? new Date(String(enteredAt).replace(" ", "T")).getTime() : NaN;
    project.days_in_stage = Number.isFinite(ms) ? Math.max(0, Math.floor((Date.now() - ms) / 86400000)) : null;
  }
  ensureBaseAccess(p.access_id); // auto-grant managers + inquiry customer (once each, removable)

  // ---- Proposal: server-sanitized per role — cost/margin never reach non-admin/manager browsers.
  // No session (PIN gate ahead) ships the customer-safe variant; staff builders re-fetch on mount.
  const proposalRow = getActiveProposal(p.access_id);
  const proposal = sanitizeProposal(proposalRow, initialView || "customer");
  project.proposal_status = proposalRow?.status || null;
  project.proposal_selected_option = proposalRow?.selected_option || null;
  project.proposal_signed = !!proposalRow?.signed_name;                 // customer signed the proposal
  project.deposit_recorded = getProjectPayments(p.access_id).some((x) => (+x.amount || 0) > 0 && x.status === "confirmed"); // ≥1 CONFIRMED payment
  project.tech_accepted = !!proposalRow?.tech_signed_name;              // technician accepted the work order
  project.survey_accepted = surveyStageSatisfied(p.access_id); // data-aware: only tools with data need a current approval
  const assignments  = getProjectAssignments(p.access_id).map(r=>({...r}));
  const staffUsers   = getStaffUsers().map(r=>({...r}));
  const workOrders   = getWorkOrdersByProject(p.access_id).map(r=>({...r}));
  const expenses     = getProjectExpenses(p.access_id).map(r=>({...r}));
  const requests     = getProjectRequests(p.access_id).map(r=>({...r}));

  // ---- Proposal view tracking: log a view when someone opens a project at the proposal stage ----
  let proposalViews = [];
  if (initialView && p.stage === "proposal") {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "::1";
    let viewerName = null;
    if (initialView === "customer") {
      viewerName = p.contact_name || "Customer";
    } else {
      // staff viewer — resolve their name from the session token
      const jar = await cookies();
      const tok = jar.get("iot_session")?.value;
      const u   = tok ? await parseToken(tok) : null;
      if (u?.id) viewerName = getUserById(u.id)?.name || u.email || null;
    }
    recordProposalView(p.access_id, { role: initialView, name: viewerName, ip });
    // Role-scoped read: admin/manager see all views; sales sees only customer views; others see none.
    if (initialView === "admin" || initialView === "manager") {
      proposalViews = getProposalViews(p.access_id);
    } else if (initialView === "sales") {
      proposalViews = getProposalViews(p.access_id).filter(v => v.viewer_role === "customer");
    }
  } else if (initialView && (initialView === "admin" || initialView === "manager" || initialView === "sales")) {
    // Past the proposal stage — still let staff review the historical view log.
    const all = getProposalViews(p.access_id);
    proposalViews = initialView === "sales" ? all.filter(v => v.viewer_role === "customer") : all;
  }

  return <GatewayClient project={project} initialView={initialView} currentUser={currentUser} assignments={assignments} staffUsers={staffUsers} workOrders={workOrders} expenses={expenses} requests={requests} proposalViews={proposalViews} proposal={proposal} />;
}
