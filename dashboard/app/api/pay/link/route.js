import { cookies } from "next/headers";
import { parseToken, publicBase } from "../../../../lib/auth";
import { recordSquarePending } from "../../../../lib/db";
import { squareConfigured, createPaymentLink } from "../../../../lib/square";

// Staff-only "pay any amount" — generate a Square checkout link for an arbitrary amount + label, to text
// or email anyone. 5% convenience fee added on top (consistent with every other online payment). When a
// project is supplied, the base amount credits THAT project's balance on payment (pending→confirmed via
// the shared webhook/return); without a project it's a standalone charge (lands in Square, not a ledger).
export const runtime = "nodejs";

async function staff() {
  const jar = await cookies();
  const t = jar.get("iot_session")?.value;
  const s = t ? await parseToken(t) : null;
  return s && ["admin", "manager"].includes(s.role) ? s : null;
}

export async function POST(req) {
  if (!squareConfigured()) return Response.json({ error: "Online payments aren't set up yet." }, { status: 503 });
  if (!(await staff())) return Response.json({ error: "Staff only." }, { status: 403 });
  let body = {}; try { body = await req.json(); } catch { /* empty */ }
  const amount = Math.round((+body.amount || 0) * 100) / 100;
  if (!(amount > 0)) return Response.json({ error: "Enter an amount." }, { status: 400 });
  if (amount > 100000) return Response.json({ error: "That amount is too large." }, { status: 400 });
  const label = String(body.label || "Payment").trim().slice(0, 120) || "Payment";
  const accessId = body.accessId ? String(body.accessId).trim() : null;

  const baseCents = Math.round(amount * 100), feeCents = Math.round(baseCents * 0.05);
  const link = await createPaymentLink({
    name: label, baseCents, feeCents,
    redirectUrl: accessId ? `${publicBase(req)}/api/pay/return?project=${encodeURIComponent(accessId)}` : `${publicBase(req)}/`,
    note: label, idempotencyKey: `link:${accessId || "adhoc"}:${baseCents}:${Date.now()}`,
  });
  if (link.error) return Response.json({ error: link.error }, { status: 502 });
  if (accessId) recordSquarePending({ accessId, orderId: link.orderId, amount, feeAmount: feeCents / 100, kind: "other", note: label });

  return Response.json({ ok: true, url: link.url, base: amount, fee: Math.round(feeCents) / 100, total: Math.round(baseCents + feeCents) / 100 });
}
