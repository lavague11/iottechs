import { cookies } from "next/headers";
import { parseToken, parseAccessToken, publicBase } from "../../../../lib/auth";
import { customerOwnsProjectAccount, amountDueForPayment, recordSquarePending, getJobByAccessId,
  resolveServiceCallRef, ensureSvcProject, svcAmountDue, recordSvcSquarePending } from "../../../../lib/db";
import { squareConfigured, createPaymentLink } from "../../../../lib/square";

// Start a Square checkout for a project's deposit/balance OR a service-call invoice. Amounts are computed
// SERVER-SIDE from the canonical record (never the client); a 5% convenience fee is added as its own line.
// Returns the hosted checkout URL (card / Apple Pay / Google Pay / Cash App). Dormant until Square keys.
export const runtime = "nodejs";
const FEE = 0.05;

async function mayPay(accessId) {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  const sess = raw ? await parseToken(raw) : null;
  if (sess && ["admin", "manager"].includes(sess.role)) return true;
  if (sess?.role === "customer" && customerOwnsProjectAccount(accessId, { userId: sess.id, email: sess.email })) return true;
  const accRaw = jar.get("iot_access")?.value;
  const acc = accRaw ? await parseAccessToken(accRaw) : null;
  return !!(acc && String(acc.accessId) === String(accessId));
}

// Resolve a service call → its canonical id + companion project (for auth). Null when not found.
function svcContext(svcId) {
  const call = resolveServiceCallRef(svcId);
  if (!call) return null;
  const proj = ensureSvcProject(call.svc_id);
  return proj?.access_id ? { svcId: call.svc_id, accessId: proj.access_id, name: proj.customer || proj.contact_name || call.svc_id } : null;
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const svc = sp.get("svc");
  if (svc) {
    if (!squareConfigured()) return Response.json({ configured: false });
    const ctx = svcContext(svc);
    if (!ctx || !(await mayPay(ctx.accessId))) return Response.json({ configured: false });
    const d = svcAmountDue(ctx.svcId);
    return Response.json({ configured: true, invoice: d.ok ? d.due : 0, feePct: 5 });
  }
  const accessId = sp.get("project") || "";
  if (!accessId || !squareConfigured() || !(await mayPay(accessId))) return Response.json({ configured: false });
  const dep = amountDueForPayment(accessId, "deposit");
  const bal = amountDueForPayment(accessId, "balance");
  return Response.json({ configured: true, deposit: dep.ok ? dep.due : 0, balance: bal.ok ? bal.due : 0, feePct: 5 });
}

export async function POST(req) {
  if (!squareConfigured()) return Response.json({ error: "Online payments aren't set up yet." }, { status: 503 });
  let body = {}; try { body = await req.json(); } catch { /* empty */ }
  const base = publicBase(req);

  // ---- Service-call invoice ----
  if (body.svcId) {
    const ctx = svcContext(String(body.svcId).trim());
    if (!ctx) return Response.json({ error: "Service call not found." }, { status: 404 });
    if (!(await mayPay(ctx.accessId))) return Response.json({ error: "Not authorized." }, { status: 403 });
    const d = svcAmountDue(ctx.svcId);
    if (!d.ok) return Response.json({ error: d.error }, { status: 400 });
    if (d.due <= 0) return Response.json({ error: "Nothing is due on this invoice." }, { status: 400 });
    const baseCents = Math.round(d.due * 100), feeCents = Math.round(baseCents * FEE);
    const link = await createPaymentLink({
      name: `Service invoice — ${ctx.name}`, baseCents, feeCents,
      redirectUrl: `${base}/api/pay/return?svc=${encodeURIComponent(ctx.svcId)}`,
      note: `invoice · ${ctx.svcId}`, idempotencyKey: `${ctx.svcId}:invoice:${baseCents}:${Date.now()}`,
    });
    if (link.error) return Response.json({ error: link.error }, { status: 502 });
    recordSvcSquarePending({ svcId: ctx.svcId, orderId: link.orderId, amount: d.due, feeAmount: feeCents / 100 });
    return Response.json({ ok: true, url: link.url, base: d.due, fee: Math.round(feeCents) / 100, total: Math.round(baseCents + feeCents) / 100 });
  }

  // ---- Proposal deposit / balance ----
  const accessId = String(body.accessId || "").trim();
  const kind = body.kind === "balance" ? "balance" : "deposit";
  if (!accessId) return Response.json({ error: "Missing project." }, { status: 400 });
  if (!(await mayPay(accessId))) return Response.json({ error: "Not authorized for this project." }, { status: 403 });
  const d = amountDueForPayment(accessId, kind);
  if (!d.ok) return Response.json({ error: d.error }, { status: 400 });
  if (d.due <= 0) return Response.json({ error: "Nothing is due right now." }, { status: 400 });
  const baseCents = Math.round(d.due * 100), feeCents = Math.round(baseCents * FEE);
  const proj = getJobByAccessId(accessId);
  const who = String(proj?.customer || proj?.contact_name || "").trim();
  const link = await createPaymentLink({
    name: `${kind === "deposit" ? "Deposit" : "Balance"}${who ? ` — ${who}` : ` — ${accessId}`}`, baseCents, feeCents,
    redirectUrl: `${base}/api/pay/return?project=${encodeURIComponent(accessId)}`,
    note: `${kind} · ${accessId}`, idempotencyKey: `${accessId}:${kind}:${baseCents}:${Date.now()}`,
  });
  if (link.error) return Response.json({ error: link.error }, { status: 502 });
  recordSquarePending({ accessId, orderId: link.orderId, amount: d.due, feeAmount: feeCents / 100, kind: kind === "deposit" ? "deposit" : "final" });
  return Response.json({ ok: true, url: link.url, base: d.due, fee: Math.round(feeCents) / 100, total: Math.round(baseCents + feeCents) / 100 });
}
