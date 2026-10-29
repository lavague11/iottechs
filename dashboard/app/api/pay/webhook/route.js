import { publicBase } from "../../../../lib/auth";
import { verifyWebhook } from "../../../../lib/square";
import { confirmSquarePaymentByOrder } from "../../../../lib/db";

// Square → us. Signature-verified. When a payment completes, credit the matching pending ledger row by its
// order id (idempotent — a re-delivered webhook never double-credits). Always 200 on a verified event so
// Square doesn't retry forever; 401 only when the signature is bad.
export const runtime = "nodejs";

export async function POST(req) {
  const raw = await req.text();
  const sig = req.headers.get("x-square-hmacsha256-signature");
  if (!verifyWebhook(sig, raw, `${publicBase(req)}/api/pay/webhook`)) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }
  let evt = {}; try { evt = JSON.parse(raw); } catch { return Response.json({ ok: true }); }
  try {
    const payment = evt?.data?.object?.payment;
    if (payment && payment.order_id && String(payment.status).toUpperCase() === "COMPLETED") {
      confirmSquarePaymentByOrder(payment.order_id);
    }
  } catch { /* never fail a verified webhook */ }
  return Response.json({ ok: true });
}
