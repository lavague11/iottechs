import { redirect } from "next/navigation";
import { publicBase } from "../../../../lib/auth";
import { getPendingSquareOrders, getPendingSvcSquareOrders, confirmSquarePaymentByOrder } from "../../../../lib/db";
import { orderIsPaid } from "../../../../lib/square";

// Where Square sends the customer back after checkout. We verify each of this project's pending orders
// with Square directly and credit any that are paid — so the payment lands immediately even if the webhook
// is slow or not configured. The webhook stays the primary, out-of-band source of truth; both are
// idempotent. Then we bounce the customer to their project portal.
export const runtime = "nodejs";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const accessId = sp.get("project") || "";
  const svc = sp.get("svc") || "";
  let paid = false;
  try {
    const orders = svc ? getPendingSvcSquareOrders(svc) : (accessId ? getPendingSquareOrders(accessId) : []);
    for (const orderId of orders) {
      if (await orderIsPaid(orderId)) { confirmSquarePaymentByOrder(orderId); paid = true; }
    }
  } catch { /* fall through to the portal regardless */ }
  const base = publicBase(req);
  const dest = svc ? `${base}/service-call/${encodeURIComponent(svc)}?paid=${paid ? "1" : "0"}`
    : accessId ? `${base}/project/${encodeURIComponent(accessId)}?paid=${paid ? "1" : "0"}` : base;
  redirect(dest);
}
