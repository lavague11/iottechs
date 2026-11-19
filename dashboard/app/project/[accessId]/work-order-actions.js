"use server";

// Server actions for THE WORK ORDER DOCUMENT (docs/WORK_ORDERS.md). Separate from proposal-actions.js
// on purpose: nothing in this file may write the proposal row, and keeping them apart makes that
// reviewable at a glance. Every write re-derives the caller's role from the session token — the `view`
// prop the client passes is display-only — and gates on lib/roles.js, never a role string comparison.
import { headers } from "next/headers";
import {
  getJobByAccessId, customerOwnsProjectAccount,
  getWorkOrderDoc, createWorkOrderDoc, saveWorkOrderDraft, setWorkOrderNotesDoc,
  setWorkOrderShowPayouts, reseedWorkOrderPayouts, sanitizeWorkOrderDoc,
  sendWorkOrderVersion, cancelWorkOrderRevision, signWorkOrder, voidWorkOrderSignature,
  syncWorkOrderFromProposal, getUserById, userEffectivePin,
  woCheckIn, setWoLineStatus, addWoLineMedia, removeWoLineMedia, applyWoFieldQueue,
  woEventsFor, woRow, notifyRoles, woIsAssigned, woDecideCheckin,
  getProjectAssignments, addProjectAssignment,
  getEffectiveRates, actorName,
} from "../../../lib/db";
import { can } from "../../../lib/roles";

// Same resolution as proposal-actions.js: a staff session cookie first (with a fresh DB role so a role
// change takes effect without re-login), then a project-scoped PIN grant.
async function getSessionRole() {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") || "";
  const getC = (name) => cookie.split(";").find((c) => c.trim().startsWith(name + "="))?.split("=").slice(1).join("=");
  const { parseToken, parseAccessToken } = await import("../../../lib/auth");
  const { withFreshRole } = await import("../../../lib/db");
  const raw = getC("iot_session");
  if (raw) { const tok = withFreshRole(await parseToken(raw.trim())); if (tok?.role) return tok; }
  const acc = getC("iot_access");
  if (acc) { const at = await parseAccessToken(acc.trim()); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}
async function revalidate(accessId) {
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
}

// Admitted to this project at all — the same rule the page loader and proposal-actions.js use. It lets
// in any logged-in tech, the owning customer and a PIN holder, so it is NOT a money gate on its own:
// the capability check that follows it is what separates reading a work order from writing one.
function admitted(tok, accessId) {
  if (["admin", "manager", "sales", "readonly"].includes(tok.role)) return true;
  if (tok.viaPin) return String(tok.accessId) === String(accessId);
  if (tok.role === "customer") return customerOwnsProjectAccount(accessId, { userId: tok.id, email: tok.email });
  return tok.role === "tech";
}
// One gate for every call here: a real session, a project that exists, the caller admitted to it, and
// the capability.
async function gate(accessId, cap) {
  const tok = await getSessionRole();
  if (!tok?.role) return { error: "Sign in to continue." };
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return { error: "Not your project." };
  const job = getJobByAccessId(accessId);
  if (!job) return { error: "Project not found." };
  if (!admitted(tok, accessId)) return { error: "Not your project." };
  if (!can(tok.role, cap)) return { error: "You don't have access to that." };
  return { tok, job };
}

// Read. A customer never gets a work order at all; a technician gets it payout-stripped when the
// office has turned payouts off for this job.
export async function getWorkOrderAction(accessId) {
  const g = await gate(accessId, "wo.view");
  if (g.error) return g;
  // The actor is passed in so the document can answer "have I checked in today?" for THIS person —
  // the gate the field popup reads. It is never taken from the client.
  const doc = getWorkOrderDoc(accessId, { actorId: g.tok.id ?? null, actorName: actorName(g.tok) });
  if (!doc) return { ok: true, doc: null };
  return { ok: true, doc: sanitizeWorkOrderDoc(doc, g.tok.role), role: g.tok.role };
}

// Create it from the published proposal. Idempotent — calling it twice never re-snapshots over the
// office's payout edits.
export async function createWorkOrderDocAction(accessId) {
  const g = await gate(accessId, "wo.edit");
  if (g.error) return g;
  const r = createWorkOrderDoc(accessId, { byName: actorName(g.tok) });
  if (r.error) return r;
  await revalidate(accessId);
  const doc = getWorkOrderDoc(accessId);
  return { ok: true, created: !r.existed, doc: sanitizeWorkOrderDoc(doc, g.tok.role) };
}

// Save the working draft (scope + payout). Validated in saveWorkOrderDraft; the proposal is untouched.
export async function saveWorkOrderDraftAction(accessId, payload) {
  const g = await gate(accessId, "wo.edit");
  if (g.error) return g;
  const r = saveWorkOrderDraft(accessId, payload, actorName(g.tok));
  if (r.error) return r;
  const doc = getWorkOrderDoc(accessId);
  return { ok: true, doc: sanitizeWorkOrderDoc(doc, g.tok.role) };
}

export async function setWorkOrderNotesAction(accessId, notes) {
  const g = await gate(accessId, "wo.edit");
  if (g.error) return g;
  const r = setWorkOrderNotesDoc(accessId, notes);
  if (r.error) return r;
  return { ok: true };
}

// Requirement 7. Flipping this changes only what the tech's copy shows — payroll keeps every figure.
export async function setWorkOrderPayoutVisibilityAction(accessId, on) {
  const g = await gate(accessId, "wo.payout.edit");
  if (g.error) return g;
  const r = setWorkOrderShowPayouts(accessId, !!on);
  if (r.error) return r;
  await revalidate(accessId);
  const doc = getWorkOrderDoc(accessId);
  return { ok: true, doc: sanitizeWorkOrderDoc(doc, g.tok.role) };
}

// "Reset to standard" — re-pull the rate book onto every line, overriding manual edits.
export async function reseedWorkOrderPayoutsAction(accessId, techName = null) {
  const g = await gate(accessId, "wo.payout.edit");
  if (g.error) return g;
  const r = reseedWorkOrderPayouts(accessId, techName);
  if (r.error) return r;
  const doc = getWorkOrderDoc(accessId);
  return { ok: true, doc: sanitizeWorkOrderDoc(doc, g.tok.role) };
}

// The standard rates behind the payout placeholders, so the editor can show what a line WOULD pay.
export async function getWorkOrderRatesAction(accessId, techName = null) {
  const g = await gate(accessId, "wo.payout.view");
  if (g.error) return g;
  return { ok: true, rates: getEffectiveRates(techName) };
}

// ---- Stage 2: send, revise, sign ------------------------------------------------------------

// Send the draft as the next version. Every earlier signature is voided by sendWorkOrderVersion —
// a technician agreed to a scope and a payout that no longer exist.
export async function sendWorkOrderVersionAction(accessId) {
  const g = await gate(accessId, "wo.send");
  if (g.error) return g;
  const r = sendWorkOrderVersion(accessId, actorName(g.tok));
  if (r.error) return r;
  await revalidate(accessId);
  return { ok: true, version: r.version, doc: sanitizeWorkOrderDoc(getWorkOrderDoc(accessId), g.tok.role) };
}

// Cancel Revision — discard the unsent draft, restore the version the technician last received.
export async function cancelWorkOrderRevisionAction(accessId) {
  const g = await gate(accessId, "wo.edit");
  if (g.error) return g;
  const r = cancelWorkOrderRevision(accessId);
  if (r.error) return r;
  return { ok: true, doc: sanitizeWorkOrderDoc(getWorkOrderDoc(accessId), g.tok.role) };
}

// The technician accepts the current version (owner's rule, 2026-11-19): they re-enter THEIR OWN PIN
// first, and the event records the account, the device and the IP alongside the timestamp.
//
// The PIN is verified here and discarded — it is never passed to the database layer, never logged, and
// never returned. It is checked against this signed-in user's own effective PIN (`userEffectivePin`:
// their custom PIN, else the last 4 of their phone), so it confirms the person holding the phone is the
// account that is signing. It is NOT a login: a wrong PIN refuses the signature and nothing else.
export async function signWorkOrderAction(accessId, { name, signatureData = null, pin = "" } = {}) {
  const g = await gate(accessId, "wo.sign");
  if (g.error) return g;
  const me = g.tok.id != null ? getUserById(g.tok.id) : null;
  if (!me) return { error: "Sign in with your own account to sign a work order." };
  const expected = userEffectivePin(me);
  const entered = String(pin || "").replace(/\D/g, "");
  if (!expected) return { error: "Your account has no PIN yet — ask the office to set one." };
  if (entered.length !== 4 || entered !== String(expected)) return { error: "That PIN doesn't match your account." };

  const hdrs = await headers();
  const { parseUserAgent } = await import("../../../lib/device");
  const { trustedClientIp } = await import("../../../lib/esign/client-ip");
  const device = parseUserAgent(hdrs.get("user-agent"))?.label || null;
  const ip = trustedClientIp((h) => hdrs.get(h));

  const r = signWorkOrder(accessId, { userId: me.id, name: String(name || me.name || "").trim(), signatureData, device, ip, pinVerified: true });
  if (r.error) return r;
  await revalidate(accessId);
  return { ok: true, doc: sanitizeWorkOrderDoc(getWorkOrderDoc(accessId), g.tok.role) };
}

export async function voidWorkOrderSignatureAction(accessId, sigId) {
  const g = await gate(accessId, "wo.sign.void");
  if (g.error) return g;
  const r = voidWorkOrderSignature(accessId, sigId, actorName(g.tok));
  if (r.error) return r;
  await revalidate(accessId);
  return { ok: true, doc: sanitizeWorkOrderDoc(getWorkOrderDoc(accessId), g.tok.role) };
}

// ---- Stage 3: the field --------------------------------------------------------------------
// Every one of these re-derives WHO is acting from the session. The client never sends an actor, so a
// technician cannot mark a line "as" someone else, and the log cannot be forged from the browser.
const who = (tok) => ({ actorId: tok.id ?? null, actorName: actorName(tok) });
const freshDoc = (accessId, tok) => sanitizeWorkOrderDoc(getWorkOrderDoc(accessId, who(tok)), tok.role);

// IDENTITY (owner's rule, 2026-11-19): every field act is recorded under the logged-in person, never
// under the link that got them there. A staff PIN login already mints that person's own session, so
// `tok.id` / `tok.name` are theirs. What this refuses is the OTHER kind of grant: a project-scoped
// tech PIN from the link itself, which is anonymous — it proves someone has the code, not who they
// are. Work recorded under "Staff" is work nobody can be paid for, so it is not allowed to start.
function identified(tok) {
  if (tok.viaPin && tok.id == null) {
    return "Sign in with your own PIN so this is recorded under your name.";
  }
  return null;
}

// Requirement 16 — "I'm on site". Location is optional and only recorded if the device offers it.
// A technician who is NOT on this job's crew may still check in: the work is real and we want it in
// the record. It is flagged instead, their money is held pending, and the office is told at once.
export async function checkInAction(accessId, { lat = null, lng = null } = {}) {
  const g = await gate(accessId, "wo.checkin");
  if (g.error) return g;
  const anon = identified(g.tok);
  if (anon) return { error: anon };
  // woCheckIn names its fields userId/name (it predates `who`), so spread would silently pass neither.
  const me = who(g.tok);
  const assigned = woIsAssigned(accessId, { userId: me.actorId, name: me.actorName, role: g.tok.role });
  const hdrs = await headers();
  const { parseUserAgent } = await import("../../../lib/device");
  const device = parseUserAgent(hdrs.get("user-agent"))?.label || null;

  const r = woCheckIn(accessId, { userId: me.actorId, name: me.actorName, lat, lng, assigned, device });
  if (r.error) return r;
  // Only the FIRST arrival of the day raises the prompt — a second tap is the same arrival, and the
  // office should not be pinged twice for it.
  if (!assigned && r.first) {
    const job = g.job;
    notifyRoles(["admin", "manager"], {
      type: "wo_unassigned_checkin",
      title: `${me.actorName} checked in — not assigned`,
      body: `${me.actorName} checked in at ${job?.company_name || job?.customer || accessId} but isn't on the crew. Assign them?`,
      link: `/project/${accessId}?view=workorder`,
    }, me.actorId);
  }
  return { ok: true, day: r.day, assigned, doc: freshDoc(accessId, g.tok) };
}

// The office's answer to an unassigned arrival: assign · not now · reject. Assign puts them on the
// crew, which is also what adds them to the installation event (the scheduler invites from the
// assignments it is handed), and releases the money they have already earned.
export async function decideCheckinAction(accessId, checkinId, decision) {
  const g = await gate(accessId, "assignment.edit");
  if (g.error) return g;
  const r = woDecideCheckin(accessId, checkinId, decision, actorName(g.tok));
  if (r.error) return r;
  if (decision === "assign" && r.techId != null) {
    // Put them on the crew, which is also what puts them on the installation event. Guarded so a
    // second press (or someone assigning them by hand meanwhile) is a no-op, not an error.
    const already = getProjectAssignments(accessId).some((a) => a.role === "tech" && String(a.user_id) === String(r.techId));
    if (!already) {
      const u = getUserById(r.techId);
      addProjectAssignment(accessId, { userId: r.techId, userName: r.techName || u?.name || null, userEmail: u?.email || null, role: "tech", grantedBy: g.tok.id ?? null });
    }
  }
  await revalidate(accessId);
  return { ok: true, decision, doc: freshDoc(accessId, g.tok) };
}

// Requirement 17–20. The gate (checked in today · a note or photo for Needs attention · before+after
// on a key line) lives in lib/work-order-field.js and runs HERE, not only in the popup.
export async function setLineStatusAction(accessId, { lineKey, status, pickStep = null, note = "", clientAt = null } = {}) {
  const g = await gate(accessId, "wo.line.status");
  if (g.error) return g;
  const anon = identified(g.tok);
  if (anon) return { error: anon };
  const r = setWoLineStatus(accessId, { lineKey, status, pickStep, note, clientAt, ...who(g.tok) });
  if (r.error) return r;
  // Requirement 18: a flagged line notifies the OFFICE only. The customer is never told a line is in
  // trouble — that is the office's call to make, with the facts in front of them.
  if (status === "attention" && !r.replayed) {
    const job = g.job;
    notifyRoles(["admin", "manager"], {
      type: "wo_attention",
      title: "Needs attention on a work order",
      body: `${actorName(g.tok)} flagged a line on ${job?.company_name || job?.customer || accessId}.`,
      link: `/project/${accessId}?view=workorder`,
    }, g.tok.id ?? null);
  }
  return { ok: true, replayed: !!r.replayed, doc: freshDoc(accessId, g.tok) };
}

// A photo is uploaded to /api/media first and only its URL arrives here — a data: URL is refused.
export async function addLinePhotoAction(accessId, { lineKey, slot, mediaUrl } = {}) {
  const g = await gate(accessId, "wo.line.status");
  if (g.error) return g;
  const anon = identified(g.tok);
  if (anon) return { error: anon };
  const r = addWoLineMedia(accessId, { lineKey, slot, mediaUrl, byName: actorName(g.tok) });
  if (r.error) return r;
  return { ok: true, doc: freshDoc(accessId, g.tok) };
}
export async function removeLinePhotoAction(accessId, mediaId) {
  const g = await gate(accessId, "wo.line.status");
  if (g.error) return g;
  const r = removeWoLineMedia(accessId, mediaId);
  if (r.error) return r;
  return { ok: true, doc: freshDoc(accessId, g.tok) };
}

// Requirement 21 — the phone's offline queue, replayed oldest first. Each op is idempotent on the
// device clock, so a retry can never double-pay; the result says which ops landed so the phone knows
// what to drop and what to keep.
export async function syncFieldQueueAction(accessId, ops) {
  const g = await gate(accessId, "wo.line.status");
  if (g.error) return g;
  const anon = identified(g.tok);
  if (anon) return { error: anon };
  const r = applyWoFieldQueue(accessId, ops, who(g.tok));
  return { ok: true, results: r.results, doc: freshDoc(accessId, g.tok) };
}

// Requirement 20 — the action trail. Staff only; it names who did what, and when.
export async function getWorkOrderEventsAction(accessId, limit = 200) {
  const g = await gate(accessId, "wo.view");
  if (g.error) return g;
  const row = woRow(accessId);
  if (!row) return { ok: true, events: [] };
  return { ok: true, events: woEventsFor(row.id, Math.min(500, Math.max(1, +limit || 200))) };
}

// Requirement 14: pull a signed proposal revision / addendum into the work order as an UNSENT revision.
// Payouts the office already set are carried across; only genuinely new lines arrive seeded.
export async function syncWorkOrderFromProposalAction(accessId) {
  const g = await gate(accessId, "wo.edit");
  if (g.error) return g;
  const r = syncWorkOrderFromProposal(accessId);
  if (r.error) return r;
  return { ok: true, changed: r.changed, doc: sanitizeWorkOrderDoc(getWorkOrderDoc(accessId), g.tok.role) };
}
