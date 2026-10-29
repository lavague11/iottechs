import { redirect } from "next/navigation";
import { publicBase } from "../../../../lib/auth";
import { getPendingSquareOrders, confirmSquarePaymentByOrder } from "../../../../lib/db";
import { orderIsPaid } from "../../../../lib/square";

// Where Square sends the customer back after checkout. We verify each of this project's pending orders
// with Square directly and credit any that are paid — so the payment lands immediately even if the webhook
// is slow or not configured. The webhook stays the primary, out-of-band source of truth; both are
// idempotent. Then we bounce the customer to their project portal.
export const runtime = "nodejs";

export async function GET(req) {
  const accessId = new URL(req.url).searchParams.get("project") || "";
  let paid = false;
  if (accessId) {
    try {
      for (const orderId of getPendingSquareOrders(accessId)) {
        if (await orderIsPaid(orderId)) { confirmSquarePaymentByOrder(orderId); paid = true; }
      }
    } catch { /* fall through to the portal regardless */ }
  }
  const base = publicBase(req);
  redirect(accessId ? `${base}/project/${encodeURIComponent(accessId)}?paid=${paid ? "1" : "0"}` : base);
}
