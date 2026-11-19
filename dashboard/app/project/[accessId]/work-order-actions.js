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
  const doc = getWorkOrderDoc(accessId);
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

// Requirement 14: pull a signed proposal revision / addendum into the work order as an UNSENT revision.
// Payouts the office already set are carried across; only genuinely new lines arrive seeded.
export async function syncWorkOrderFromProposalAction(accessId) {
  const g = await gate(accessId, "wo.edit");
  if (g.error) return g;
  const r = syncWorkOrderFromProposal(accessId);
  if (r.error) return r;
  return { ok: true, changed: r.changed, doc: sanitizeWorkOrderDoc(getWorkOrderDoc(accessId), g.tok.role) };
}
