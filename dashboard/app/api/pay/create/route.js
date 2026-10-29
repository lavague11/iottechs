import { cookies } from "next/headers";
import { parseToken, parseAccessToken, publicBase } from "../../../../lib/auth";
import { customerOwnsProjectAccount, amountDueForPayment, recordSquarePending, getJobByAccessId } from "../../../../lib/db";
import { squareConfigured, createPaymentLink } from "../../../../lib/square";

// Start a Square checkout for a project's deposit or balance. The amount is computed SERVER-SIDE from the
// canonical financial state (never trusted from the client), and a 5% convenience fee is added as its own
// line. Returns the hosted checkout URL (card / Apple Pay / Google Pay / Cash App). Dormant until Square
// keys are in the vault.
export const runtime = "nodejs";

async function mayPay(accessId) {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  const sess = raw ? await parseToken(raw) : null;
  if (sess && ["admin", "manager"].includes(sess.role)) return true;                                   // staff can hand a customer a link
  if (sess?.role === "customer" && customerOwnsProjectAccount(accessId, { userId: sess.id, email: sess.email })) return true;
  const accRaw = jar.get("iot_access")?.value;
  const acc = accRaw ? await parseAccessToken(accRaw) : null;
  return !!(acc && String(acc.accessId) === String(accessId));                                          // PIN grant for THIS project
}

// Quote: what's payable online right now (for the Pay buttons). Returns configured:false when Square is
// off or the viewer isn't authorized — the UI then renders nothing.
export async function GET(req) {
  const accessId = new URL(req.url).searchParams.get("project") || "";
  if (!accessId || !squareConfigured() || !(await mayPay(accessId))) return Response.json({ configured: false });
  const dep = amountDueForPayment(accessId, "deposit");
  const bal = amountDueForPayment(accessId, "balance");
  return Response.json({ configured: true, deposit: dep.ok ? dep.due : 0, balance: bal.ok ? bal.due : 0, feePct: 5 });
}

export async function POST(req) {
  if (!squareConfigured()) return Response.json({ error: "Online payments aren't set up yet." }, { status: 503 });
  let body = {}; try { body = await req.json(); } catch { /* empty */ }
  const accessId = String(body.accessId || "").trim();
  const kind = body.kind === "balance" ? "balance" : "deposit";
  if (!accessId) return Response.json({ error: "Missing project." }, { status: 400 });
  if (!(await mayPay(accessId))) return Response.json({ error: "Not authorized for this project." }, { status: 403 });

  const d = amountDueForPayment(accessId, kind);
  if (!d.ok) return Response.json({ error: d.error }, { status: 400 });
  if (d.due <= 0) return Response.json({ error: "Nothing is due right now." }, { status: 400 });

  const baseCents = Math.round(d.due * 100);
  const feeCents = Math.round(baseCents * 0.05);
  const proj = getJobByAccessId(accessId);
  const who = String(proj?.customer || proj?.contact_name || "").trim();
  const name = `${kind === "deposit" ? "Deposit" : "Balance"}${who ? ` — ${who}` : ` — ${accessId}`}`;

  const link = await createPaymentLink({
    name, baseCents, feeCents,
    redirectUrl: `${publicBase(req)}/api/pay/return?project=${encodeURIComponent(accessId)}`,
    note: `${kind} · ${accessId}`,
    idempotencyKey: `${accessId}:${kind}:${baseCents}:${Date.now()}`,
  });
  if (link.error) return Response.json({ error: link.error }, { status: 502 });

  // Pending ledger row (keyed on the Square order id) — reconcilable + idempotent; counts as "in flight",
  // not yet toward the balance, until Square confirms.
  recordSquarePending({ accessId, orderId: link.orderId, amount: d.due, feeAmount: feeCents / 100, kind: kind === "deposit" ? "deposit" : "final" });

  return Response.json({ ok: true, url: link.url, base: d.due, fee: Math.round(feeCents) / 100, total: Math.round(baseCents + feeCents) / 100 });
}
