"use server";

import { headers, cookies } from "next/headers";
import { getJobByAccessId, updateStage, verifyUserByCredential, recordLogin, recordEvent, updateProjectContact, markProjectLost, setProjectAttention, setCommission, setProjectRestricted, submitProjectExpense, payProjectExpense, declineProjectExpense, submitRequest, approveRequest, rejectRequest, getCustomerUserForProject, setCustomerPinCustom, resetCustomerPinToPhone, markInfoConfirmed, markTourSeen } from "../../../lib/db";
import { LOGIN_VIEW, PIN_VIEW, STAGES, stageLabel, stagesForType } from "../../../lib/spec";
import { makePreviewToken } from "../../../lib/auth";
import { emailStageAdvance } from "../../../lib/email";

export async function getPreviewTokenAction(accessId, role) {
  // Preview tokens grant a role's view of a project. Scope minting by who's asking:
  // admin/manager → any role; sales → the customer view only (never admin/manager/tech).
  const tok = await getAnyTok();
  if (!tok) return null;
  const can = ["admin", "manager"].includes(tok.role) || (tok.role === "sales" && role === "customer");
  if (!can) return null;
  return makePreviewToken(accessId, role);
}

// Dev-only master PINs for quick role preview on any project.
// Auto-disabled in production so they can never become a live backdoor.
const DEV_PINS_ENABLED = process.env.NODE_ENV !== "production";
const GLOBAL_PINS = DEV_PINS_ENABLED ? {
  "1111": "customer",
  "2222": "manager",
  "3333": "tech",
  "4444": "sales",
} : {};

// Master admin PIN — grants admin on ANY project, in production too (unlike the dev PINs above).
// Configurable via ADMIN_MASTER_PIN; defaults to 8965. NOTE: a short numeric PIN is brute-forceable,
// so set a longer ADMIN_MASTER_PIN in production for real security.
const ADMIN_MASTER_PIN = String(process.env.ADMIN_MASTER_PIN || "8965").trim();

async function getRequestMeta() {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "127.0.0.1";
  const ua = hdrs.get("user-agent") || null;
  return { ip, ua };
}

export async function resolveAccess(accessId, { loginRole, pin, emailOrPhone, password } = {}) {
  const p = getJobByAccessId(accessId);
  if (!p) return { ok: false, error: "Project not found." };

  const { ip, ua } = await getRequestMeta();

  // Mint a project-scoped access cookie so the granted VIEW and the server-side auth for writes
  // always agree — without this the shell can show "admin" while actions see no token and reject
  // every write ("Only Admin & Manager can move steps").
  const grantPin = async (role) => {
    const { makeAccessToken, accessTtlFor } = await import("../../../lib/auth");
    const jar = await cookies();
    // Cookie maxAge mirrors the token's own role-based expiry (lib/auth.js ACCESS_TTL_MS) —
    // no point letting the browser hold onto a cookie longer than the token inside it is valid.
    jar.set("iot_access", await makeAccessToken(p.access_id, role), { httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.ceil(accessTtlFor(role) / 1000) });
  };

  // Dev-only quick role switch (no credentials) — must never work in production.
  if (loginRole && LOGIN_VIEW[loginRole] && DEV_PINS_ENABLED) {
    const view = LOGIN_VIEW[loginRole];
    await grantPin(view);
    return { ok: true, view, via: "login" };
  }

  if (emailOrPhone != null && password != null) {
    const user = verifyUserByCredential(emailOrPhone, password);
    if (user?.disabled) return { ok: false, error: "This account has been disabled." };
    if (!user) return { ok: false, error: "Invalid email / phone or password." };
    recordLogin(user.id, ip, ua);
    const view = LOGIN_VIEW[user.role] || "customer";
    // A real staff account gets a full (cross-project) session, same as the /login page — so they
    // aren't re-prompted per project and their writes are authorized everywhere.
    const { makeToken } = await import("../../../lib/auth");
    const jar = await cookies();
    jar.set("iot_session", await makeToken(user), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
    // A fresh login is the newest explicit grant — drop any lingering project PIN cookie so
    // the page doesn't keep rendering a previously-PIN'd role ("view keeps flipping" bug).
    jar.delete("iot_access");
    return { ok: true, view, via: "login", name: user.name };
  }

  if (pin != null && pin !== "") {
    const entered = String(pin).trim();
    // Master admin PIN — works everywhere, including production.
    if (ADMIN_MASTER_PIN && entered === ADMIN_MASTER_PIN) {
      recordEvent("pin_access", null, ip, ua, p.id, `Master admin PIN on ${p.access_id}`);
      await grantPin("admin");
      return { ok: true, view: LOGIN_VIEW.admin || "admin", via: "pin" };
    }
    if (GLOBAL_PINS[entered]) {
      const role = GLOBAL_PINS[entered];
      recordEvent("pin_access", null, ip, ua, p.id, `Global PIN → ${role} on ${p.access_id}`);
      const view = LOGIN_VIEW[role] || role;
      // Mint the project-scoped cookie for EVERY dev-PIN role (not just customer/tech) — the
      // shell renders the granted view, so server actions must see the same role or every
      // write comes back "Unauthorized". GLOBAL_PINS is empty in production, so staff roles
      // via this path are dev-only by construction.
      await grantPin(view);
      return { ok: true, view, via: "pin" };
    }
    if (p.customer_pin && entered === String(p.customer_pin).trim()) {
      // A correct project PIN is proof the visitor is this project's customer. If that customer
      // has a real account, log them in fully (identity + dashboard access) — the PIN is a
      // shortcut for logging in, not a lesser guest pass. Leads with no account yet keep the
      // project-scoped PIN grant (short-lived; see lib/auth ACCESS_TTL_MS).
      const owner = getCustomerUserForProject(p);
      if (owner && !owner.disabled) {
        recordEvent("pin_access", owner.id, ip, ua, p.id, `Customer PIN → ${owner.name} on ${p.access_id}`);
        const { makeToken } = await import("../../../lib/auth");
        const jar = await cookies();
        jar.set("iot_session", await makeToken(owner), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
        jar.delete("iot_access");
        return { ok: true, view: PIN_VIEW.customer, via: "pin", name: owner.name };
      }
      recordEvent("pin_access", null, ip, ua, p.id, `Customer PIN on ${p.access_id} (${p.contact_name || p.customer || "guest"})`);
      await grantPin("customer");
      return { ok: true, view: PIN_VIEW.customer, via: "pin", name: p.contact_name || p.customer || null };
    }
    if (p.tech_pin && entered === p.tech_pin) {
      recordEvent("pin_access", null, ip, ua, p.id, `Tech PIN on ${p.access_id}`);
      await grantPin("tech");
      return { ok: true, view: PIN_VIEW.tech, via: "pin" };
    }
    return { ok: false, error: "Invalid PIN." };
  }

  return { ok: false, error: "Enter a PIN or log in." };
}

// Proactively drop the PIN-scoped grant for a project — the client-side inactivity timer
// calls this after the idle window elapses so a customer who leaves the tab open (rather
// than reloading, which the token's own expiry already catches) is re-gated immediately.
export async function lockProjectAction(accessId) {
  const jar = await cookies();
  const raw = jar.get("iot_access")?.value;
  if (raw) {
    const { parseAccessToken } = await import("../../../lib/auth");
    const grant = await parseAccessToken(raw);
    if (grant && String(grant.accessId) === String(accessId)) jar.delete("iot_access");
  }
  return { ok: true };
}

// Admin/manager override the customer PIN. A 4-digit value is set as a CUSTOM pin (survives the
// last-4-phone normalizer); an empty value resets the project back to following the phone.
export async function setCustomerPinAction(accessId, pin) {
  const tok = await getAnyTok();
  if (!tok || !["admin", "manager"].includes(tok.role)) return { error: "Only Admin & Manager can set the PIN." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your project." };
  const clean = String(pin ?? "").replace(/\D/g, "");
  const proj = clean.length >= 4
    ? setCustomerPinCustom(accessId, clean.slice(0, 4))
    : resetCustomerPinToPhone(accessId);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, pin: proj?.customer_pin || "", custom: !!proj?.pin_custom };
}

// First-login welcome: the customer confirms (optionally edits) their contact details. Saves any
// edits, then stamps info_confirmed_at so the modal never reappears. Customer-owned or staff.
export async function confirmInfoAction(accessId, fields) {
  const tok = await getAnyTok();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer") {
    const proj = getJobByAccessId(accessId);
    if (!proj || (tok.viaPin ? String(tok.accessId) !== String(accessId)
                             : String(proj.contact_email || "").toLowerCase() !== String(tok.email || "").toLowerCase()))
      return { error: "Not your project." };
  } else if (!["admin", "manager", "sales", "tech"].includes(tok.role)) {
    return { error: "Unauthorized." };
  }
  if (fields && Object.keys(fields).length) updateProjectContact(accessId, fields);
  markInfoConfirmed(accessId);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

// Stamp the first-time guided tour as seen (once), so it never auto-opens again. Customer-owned.
export async function markTourSeenAction(accessId) {
  const tok = await getAnyTok();
  if (!tok) return { error: "Not authenticated." };
  if (tok.role === "customer") {
    const proj = getJobByAccessId(accessId);
    if (!proj || (tok.viaPin ? String(tok.accessId) !== String(accessId)
                             : String(proj.contact_email || "").toLowerCase() !== String(tok.email || "").toLowerCase()))
      return { error: "Not your project." };
  } else if (!["admin", "manager", "sales", "tech"].includes(tok.role)) {
    return { error: "Unauthorized." };
  }
  markTourSeen(accessId);
  return { ok: true };
}

export async function updateProjectInfoAction(accessId, fields) {
  const hdrs   = await headers();
  const cookie = hdrs.get("cookie") || "";
  const raw    = cookie.split(";").find(c => c.trim().startsWith("iot_session="))?.split("=").slice(1).join("=");
  if (!raw) return { error: "Not authenticated." };
  const { parseToken } = await import("../../../lib/auth");
  const tok = await parseToken(raw.trim());
  if (!tok?.role) return { error: "Not authenticated." };
  if (tok.role === "customer") {
    const proj = getJobByAccessId(accessId);
    if (!proj || String(proj.contact_email||"").toLowerCase() !== String(tok.email||"").toLowerCase())
      return { error: "Not your project." };
  } else if (!["admin","manager","sales","tech"].includes(tok.role)) {
    return { error: "Unauthorized." };
  }
  updateProjectContact(accessId, fields);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

// `viewRole` is display-only legacy — the role that authorizes the move comes from the
// session/PIN cookie, never from the client (a forged parameter must not move stages).
export async function setStage(accessId, viewRole, stageKey) {
  const tok = await getAnyTok();
  if (!tok || !["admin", "manager"].includes(tok.role)) {
    return { ok: false, error: "Only Admin & Manager can move steps." };
  }
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) {
    return { ok: false, error: "Not your project." };
  }
  const p = getJobByAccessId(accessId);
  if (!p) return { ok: false, error: "Project not found." };

  const allowed = new Set(stagesForType(p.project_type).map((s) => s.key));
  if (!STAGES.some((s) => s.key === stageKey) || !allowed.has(stageKey)) {
    return { ok: false, error: "That stage does not apply to this project." };
  }

  const changed = p.stage !== stageKey;
  const updated = updateStage(accessId, stageKey);
  if (!updated) return { ok: false, error: "Could not update the project." };
  // Notify the customer when they've entered a stage that needs their action — only on a real
  // move (not re-setting the same stage). Fire-and-forget; no-op until email is configured.
  if (changed) emailStageAdvance(accessId, stageKey).catch(() => {});
  // Bust the cached render so a reload reflects the new stage (not just the in-session update).
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, stage: stageKey, label: stageLabel(stageKey) };
}

export async function addAssignmentAction(accessId, { userId, userName, userEmail, role }) {
  const hdrs   = await headers();
  const cookie = hdrs.get("cookie") || "";
  const raw    = cookie.split(";").find(c => c.trim().startsWith("iot_session="))?.split("=").slice(1).join("=");
  if (!raw) return { error: "Not authenticated." };
  const { parseToken } = await import("../../../lib/auth");
  const tok = await parseToken(raw.trim());
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { addProjectAssignment } = await import("../../../lib/db");
  const result = addProjectAssignment(accessId, { userId, userName, userEmail, role, grantedBy: tok.id ?? null });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, ...result };
}

export async function removeAssignmentAction(accessId, assignmentId) {
  const hdrs   = await headers();
  const cookie = hdrs.get("cookie") || "";
  const raw    = cookie.split(";").find(c => c.trim().startsWith("iot_session="))?.split("=").slice(1).join("=");
  if (!raw) return { error: "Not authenticated." };
  const { parseToken } = await import("../../../lib/auth");
  const tok = await parseToken(raw.trim());
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { removeProjectAssignment } = await import("../../../lib/db");
  removeProjectAssignment(assignmentId);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

async function getSessionTok() {
  const hdrs   = await headers();
  const cookie = hdrs.get("cookie") || "";
  const raw    = cookie.split(";").find(c => c.trim().startsWith("iot_session="))?.split("=").slice(1).join("=");
  if (!raw) return null;
  const { parseToken } = await import("../../../lib/auth");
  return parseToken(raw.trim());
}

// Session token OR the project-scoped PIN cookie (same resolution order as proposal-actions):
// the shell's view and the actions' auth must always agree.
async function getAnyTok() {
  const tok = await getSessionTok();
  if (tok?.role) return tok;
  const hdrs   = await headers();
  const cookie = hdrs.get("cookie") || "";
  const raw    = cookie.split(";").find(c => c.trim().startsWith("iot_access="))?.split("=").slice(1).join("=");
  if (!raw) return null;
  const { parseAccessToken } = await import("../../../lib/auth");
  const at = await parseAccessToken(raw.trim());
  return at?.role ? { role: at.role, accessId: at.accessId, viaPin: true } : null;
}

// Customer asks to reopen a closed/lost project — opens a ticket for the office to action,
// rather than silently un-closing it. Any authenticated viewer of this project (session or PIN)
// may file it. Deduped: if an open reopen ticket already exists, we don't stack another.
export async function requestProjectReopenAction(accessId) {
  const tok = await getAnyTok();
  if (!tok) return { error: "Please unlock the project first." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your project." };
  const p = getJobByAccessId(accessId);
  if (!p) return { error: "Project not found." };

  const { createTicket, hasOpenReopenTicket } = await import("../../../lib/db");
  if (hasOpenReopenTicket(accessId)) return { ok: true, already: true };

  const who = p.contact_name || p.customer || "Customer";
  createTicket({
    access_id: accessId,
    subject: `Reopen request — ${p.customer || accessId}`,
    priority: "medium",
    opened_by_name: who,
    opened_by_role: "customer",
    audience: "admin,manager",
    body: `${who} requested to reopen this closed project${p.lost_reason ? ` (was closed: ${p.lost_reason})` : ""}. Review and reopen from the project if appropriate.`,
  });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/tickets");
  return { ok: true };
}

// Tech-only stage advances: schedule→install (accept) and install→qc (complete)
const TECH_TRANSITIONS = { schedule: "install", install: "qc" };
export async function techAdvanceStageAction(accessId, fromStage) {
  const tok = await getAnyTok();
  if (!tok || tok.role !== "tech") return { ok: false, error: "Only technicians can perform this action." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { ok: false, error: "Not your project." };
  const toStage = TECH_TRANSITIONS[fromStage];
  if (!toStage) return { ok: false, error: "That transition is not allowed." };
  const p = getJobByAccessId(accessId);
  if (!p) return { ok: false, error: "Project not found." };
  if (p.stage !== fromStage) return { ok: false, error: "Project stage has already changed." };
  const updated = updateStage(accessId, toStage);
  if (!updated) return { ok: false, error: "Could not update the project." };
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, stage: toStage };
}

export async function updateWorkOrderNotesAction(accessId, workOrderId, notes) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { updateWorkOrderNotes } = await import("../../../lib/db");
  updateWorkOrderNotes(workOrderId, notes);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

export async function submitWorkOrderAction(accessId, { notes }) {
  const tok = await getSessionTok();
  if (!tok?.role) return { error: "Not authenticated." };
  if (!["admin", "manager", "tech"].includes(tok.role)) return { error: "Unauthorized." };
  const { createWorkOrder } = await import("../../../lib/db");
  const result = createWorkOrder(accessId, { submittedById: tok.id ?? null, submittedByName: tok.name ?? tok.email ?? "Tech", notes });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, id: result.id };
}

export async function approveWorkOrderAction(accessId, workOrderId) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { approveWorkOrder } = await import("../../../lib/db");
  approveWorkOrder(workOrderId, { reviewedById: tok.id ?? null, reviewedByName: tok.name ?? tok.email ?? "Admin" });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

export async function rejectWorkOrderAction(accessId, workOrderId, reason) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { rejectWorkOrder } = await import("../../../lib/db");
  rejectWorkOrder(workOrderId, { reviewedById: tok.id ?? null, reviewedByName: tok.name ?? tok.email ?? "Admin", reviewNotes: reason });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

export async function setAttentionAction(accessId, needsAttention, note) {
  const tok = await getSessionTok();
  if (!["admin","manager","sales"].includes(tok?.role)) return { error: "Unauthorized." };
  setProjectAttention(accessId, needsAttention, note);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

export async function submitExpenseAction(accessId, { description, category, amount, vendor }) {
  const tok = await getSessionTok();
  if (!tok?.role || !["admin","manager","tech"].includes(tok.role)) return { error: "Unauthorized." };
  if (!description?.trim()) return { error: "Description required." };
  if (!amount || Number(amount) <= 0) return { error: "Valid amount required." };
  const result = submitProjectExpense(accessId, { description, category, amount: Number(amount), vendor, submittedById: tok.id ?? null, submittedByName: tok.name ?? tok.email ?? "Tech" });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, id: result.id };
}
export async function payExpenseAction(accessId, expenseId, { paymentDate, paymentMethod }) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  payProjectExpense(expenseId, { reviewedById: tok.id ?? null, reviewedByName: tok.name ?? tok.email ?? "Admin", paymentDate, paymentMethod });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}
export async function declineExpenseAction(accessId, expenseId, reason) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  declineProjectExpense(expenseId, { reviewedById: tok.id ?? null, reviewedByName: tok.name ?? tok.email ?? "Admin", reviewNotes: reason });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

export async function submitRequestAction(accessId, { requestType, description, notes }) {
  const tok = await getSessionTok();
  if (!tok?.role || !["admin","manager","tech"].includes(tok.role)) return { error: "Unauthorized." };
  if (!description?.trim()) return { error: "Description required." };
  const result = submitRequest(accessId, { requestType, description, notes, submittedById: tok.id ?? null, submittedByName: tok.name ?? tok.email ?? "Tech" });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, id: result.id };
}
export async function approveRequestAction(accessId, requestId) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  approveRequest(requestId, { reviewedById: tok.id ?? null, reviewedByName: tok.name ?? tok.email ?? "Admin" });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}
export async function rejectRequestAction(accessId, requestId, reason) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  rejectRequest(requestId, { reviewedById: tok.id ?? null, reviewedByName: tok.name ?? tok.email ?? "Admin", reviewNotes: reason });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

export async function setRestrictedAction(accessId, restricted) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  setProjectRestricted(accessId, restricted);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

export async function setCommissionAction(accessId, { rate, status, salesRep }) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  setCommission(accessId, { rate, status, salesRep });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

// Record / approve the technician payout for the job. Admin/manager only.
export async function setPayoutAction(accessId, { amount, status }) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { setProjectPayout } = await import("../../../lib/db");
  const row = setProjectPayout(accessId, { amount, status });
  if (!row) return { error: "Project not found." };
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, payout_amount: row.payout_amount ?? 0, payout_status: row.payout_status || "pending" };
}

// Stamp / clear the completion date (job closed & handed off). Admin/manager only.
export async function completeProjectAction(accessId, done = true, date = null) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { markProjectCompleted, reopenProjectCompletion } = await import("../../../lib/db");
  const row = done ? markProjectCompleted(accessId, date) : reopenProjectCompletion(accessId);
  if (!row) return { error: "Project not found." };
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, completed_at: row.completed_at || null };
}

// Save the branded system QR card (PNG data URL) to the project. Admin/manager/tech.
export async function setSystemQrAction(accessId, dataUrl) {
  const tok = await getSessionTok();
  if (!["admin", "manager", "tech"].includes(tok?.role)) return { error: "Unauthorized." };
  const s = String(dataUrl || "");
  if (s && !(s.startsWith("data:image/") && s.length < 3000000)) return { error: "Bad image." };
  const { setSystemQr } = await import("../../../lib/db");
  const row = setSystemQr(accessId, s || null);
  if (!row) return { error: "Project not found." };
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

// Warranty term (6 / 12 / 24 months). Admin/manager only.
export async function setWarrantyAction(accessId, months) {
  const tok = await getSessionTok();
  if (!["admin","manager"].includes(tok?.role)) return { error: "Unauthorized." };
  const { setWarrantyMonths } = await import("../../../lib/db");
  const row = setWarrantyMonths(accessId, months);
  if (!row) return { error: "Project not found." };
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, warranty_months: row.warranty_months || 6 };
}

export async function closeProjectAction(accessId, reason) {
  const tok = await getAnyTok();   // real session OR master-PIN admin (iot_access)
  if (!["admin","manager","sales"].includes(tok?.role)) return { error: "Unauthorized." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your project." };
  if (!reason) return { error: "Reason required." };
  markProjectLost(accessId, reason);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return { ok: true };
}

// Reactivate a closed/lost project (staff) — the other side of closeProjectAction, and where a
// customer's reopen ticket gets actioned.
export async function reactivateProjectAction(accessId) {
  const tok = await getAnyTok();   // real session OR master-PIN admin (iot_access)
  if (!["admin","manager","sales"].includes(tok?.role)) return { error: "Unauthorized." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your project." };
  const { reactivateProject } = await import("../../../lib/db");
  reactivateProject(accessId);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  revalidatePath("/tickets");
  return { ok: true };
}
