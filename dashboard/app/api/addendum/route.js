import { cookies } from "next/headers";
import {
  getToolData, saveToolData, actorName, logProjectEvent, notifyRoles, customerOwnsProjectAccount,
} from "../../../lib/db";
import { addendumFingerprint } from "../../../lib/proposal";
import { can } from "../../../lib/roles";

// Stable JSON endpoint for the job-site ADDENDUM flow — READ the add-on list and the customer's SIGN
// approval. This lives on /api/addendum instead of the per-page server actions (getToolDataAction /
// signAddendumAction) because server-action POSTs go to /project/<id> and are keyed by build-specific
// action ids. On the deploy host those intermittently return 404 — deploy skew (a page open across a
// redeploy holds a stale action id) and the CDN/LiteSpeed mishandling of server-action POSTs — which left
// the customer unable to SEE the add-on (its read 404'd → the panel rendered nothing) OR approve it
// (BUG #50). A plain API route is a fixed path the host/CDN route like any other request. The access
// control and per-role money stripping below mirror the server actions exactly; nothing is weakened.
export const runtime = "nodejs";

async function caller() {
  const jar = await cookies();
  const { parseToken, parseAccessToken } = await import("../../../lib/auth");
  const raw = jar.get("iot_session")?.value;
  if (raw) { const tok = await parseToken(raw); if (tok?.role) return tok; }
  const acc = jar.get("iot_access")?.value;                                   // PIN-scoped customer/tech grant
  if (acc) { const at = await parseAccessToken(acc); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}
function ownsProject(tok, accessId) {
  if (!tok) return false;
  if (tok.viaPin) return String(tok.accessId).toUpperCase() === String(accessId).toUpperCase();
  return customerOwnsProjectAccount(accessId, { userId: tok.id, email: tok.email });
}
// Same read gate as proposal-actions.canReadProject: staff anywhere; customer/tech only their own project.
function canRead(tok, accessId) {
  if (!tok) return false;
  if (["admin", "manager", "sales"].includes(tok.role)) return true;
  if (tok.viaPin) return String(tok.accessId).toUpperCase() === String(accessId).toUpperCase();
  if (tok.role === "customer") return ownsProject(tok, accessId);
  return tok.role === "tech";
}
function listOf(accessId) {
  try { const d = JSON.parse(getToolData(accessId, "addendum")?.data || "{}"); return Array.isArray(d.addendums) ? d : { addendums: [] }; }
  catch { return { addendums: [] }; }
}
// Per-role money stripping — mirrors sanitizeToolRead("addendum"): customer/sales never see tech payout,
// tech never sees retail price/discount. Server-side, so the wire itself is clean (CLAUDE.md rule #4).
function sanitize(list, role) {
  const seePayout = can(role, "addendum.payout.view"), seeRetail = can(role, "addendum.retail.view");
  return (list || []).map((a) => {
    const out = { ...a, items: (a.items || []).map((it) => { const c = { ...it }; if (!seePayout) delete c.techPay; if (!seeRetail) delete c.price; return c; }) };
    if (!seeRetail) delete out.discount;
    return out;
  });
}

// GET /api/addendum?project=ASC0049 → { ok, addendums } for the caller (sanitized by role).
export async function GET(req) {
  const tok = await caller();
  if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const accessId = new URL(req.url).searchParams.get("project");
  if (!accessId) return Response.json({ ok: false, error: "no project" }, { status: 400 });
  if (!canRead(tok, accessId)) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  return Response.json({ ok: true, addendums: sanitize(listOf(accessId).addendums, tok.role) });
}

// POST /api/addendum { project, addendumId, sign:{ name, data } } → the customer signs one add-on.
// Binds the signature to the add-on's content fingerprint, exactly like the old signAddendumAction.
export async function POST(req) {
  const tok = await caller();
  if (!tok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad body" }, { status: 400 }); }
  const accessId = String(body.project || "");
  const addendumId = String(body.addendumId || "");
  const sign = body.sign || {};
  if (!accessId || !addendumId) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });
  if (!can(tok.role, "addendum.sign")) return Response.json({ ok: false, error: "the customer signs add-ons" }, { status: 403 });
  if (!ownsProject(tok, accessId)) return Response.json({ ok: false, error: "not your project" }, { status: 403 });
  const name = String(sign.name || "").trim();
  if (!name) return Response.json({ ok: false, error: "type your name to sign" }, { status: 400 });

  const d = listOf(accessId);
  const list = d.addendums;
  const a = list.find((x) => x.id === addendumId);
  if (!a) return Response.json({ ok: false, error: "add-on not found" }, { status: 404 });
  if (a.needsPricing) return Response.json({ ok: false, error: "this add-on hasn't been priced yet" }, { status: 409 });
  if (a.status === "voided") return Response.json({ ok: false, error: "this add-on was voided" }, { status: 409 });

  const at = new Date().toISOString();
  const wasResign = !!a.signedFingerprint;
  Object.assign(a, {
    status: "approved", signedName: name, signedAt: at, signatureData: sign.data || null,
    signedFingerprint: addendumFingerprint(a), resignRequired: undefined,
    history: [...(a.history || []), { verb: wasResign ? "re-signed" : "approved", at, by: name }],
  });
  saveToolData(accessId, "addendum", JSON.stringify(d), actorName(tok));
  const total = Math.max(0, (a.items || []).reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0) - (+a.discount || 0));
  try { logProjectEvent(accessId, { kind: "sign", label: `Add-on ${wasResign ? "re-signed" : "approved"} · ${a.title || "Job-site add-on"} — $${total.toFixed(2)}`, actor: name }); } catch { /* non-fatal */ }
  try { notifyRoles(["admin", "manager"], { type: "signature", title: `Add-on ${wasResign ? "re-signed" : "signed"}`, body: `${name} signed "${a.title || "Job-site add-on"}" (${accessId}) — $${total.toFixed(2)}.`, link: `/project/${accessId}` }); } catch { /* non-fatal */ }
  try { const { revalidatePath } = await import("next/cache"); revalidatePath(`/project/${accessId}`); } catch { /* non-fatal */ }
  return Response.json({ ok: true, addendums: sanitize(list, tok.role) });
}
