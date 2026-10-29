import crypto from "node:crypto";
import { secretValue } from "./db.js";

// Square online-payments integration (hosted Payment Links / Checkout). Card, Apple Pay, Google Pay and
// Cash App all work on Square's own secure page — no card data ever touches this server (PCI-safe). The
// whole thing is DORMANT until the vault holds SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID (set at /dev).
// Keys live only server-side (never shipped to the browser). SQUARE_ENV = sandbox (default) | production.
const SQUARE_VERSION = "2024-10-17";

export function squareEnv() {
  return (secretValue("SQUARE_ENV") || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
}
function apiBase() {
  return squareEnv() === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}
export function squareConfigured() {
  return !!(secretValue("SQUARE_ACCESS_TOKEN") || "").trim() && !!(secretValue("SQUARE_LOCATION_ID") || "").trim();
}
function headers() {
  return { "Content-Type": "application/json", "Square-Version": SQUARE_VERSION, Authorization: `Bearer ${secretValue("SQUARE_ACCESS_TOKEN").trim()}` };
}

// Create a hosted checkout link for a base amount + a separate 5% convenience-fee line item. Amounts are in
// CENTS. Returns { url, id, orderId } or { error }.
export async function createPaymentLink({ name, baseCents, feeCents = 0, redirectUrl, note, idempotencyKey }) {
  if (!squareConfigured()) return { error: "Square isn't set up yet." };
  const location = secretValue("SQUARE_LOCATION_ID").trim();
  const line_items = [{ name: String(name || "Payment").slice(0, 255), quantity: "1", base_price_money: { amount: Math.max(1, Math.round(baseCents)), currency: "USD" } }];
  if (feeCents > 0) line_items.push({ name: "Convenience fee (5%)", quantity: "1", base_price_money: { amount: Math.round(feeCents), currency: "USD" } });
  const body = {
    idempotency_key: (idempotencyKey || crypto.randomUUID()).slice(0, 192),
    order: { location_id: location, line_items },
    checkout_options: { redirect_url: redirectUrl, ask_for_shipping_address: false },
    ...(note ? { payment_note: String(note).slice(0, 500) } : {}),
  };
  try {
    const res = await fetch(apiBase() + "/v2/online-checkout/payment-links", { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.payment_link) {
      console.error("square payment-link error", res.status, JSON.stringify(j.errors || j).slice(0, 300));
      return { error: (j.errors && j.errors[0] && (j.errors[0].detail || j.errors[0].code)) || "Couldn't start the Square checkout." };
    }
    return { url: j.payment_link.url, id: j.payment_link.id, orderId: j.payment_link.order_id };
  } catch (e) {
    console.error("square payment-link exception", e?.message);
    return { error: "Couldn't reach Square." };
  }
}

// Authoritative paid-check: ask Square whether an order is fully paid. Used by the return handler so a
// completed payment is credited immediately even if the webhook is slow/unconfigured. True only when paid.
export async function orderIsPaid(orderId) {
  if (!orderId || !squareConfigured()) return false;
  try {
    const res = await fetch(apiBase() + `/v2/orders/${encodeURIComponent(orderId)}`, { headers: headers() });
    const j = await res.json().catch(() => ({}));
    const o = j.order;
    if (!o) return false;
    if (o.state === "COMPLETED") return true;
    const due = o.net_amount_due_money ? (+o.net_amount_due_money.amount || 0) : null;
    return due === 0;
  } catch { return false; }
}

// Verify a Square webhook signature: HMAC-SHA256 over (notificationUrl + rawBody), base64, vs the header.
export function verifyWebhook(signatureHeader, rawBody, notificationUrl) {
  const key = (secretValue("SQUARE_WEBHOOK_SIGNATURE_KEY") || "").trim();
  if (!key || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", key).update(String(notificationUrl) + String(rawBody)).digest("base64");
  try {
    const a = Buffer.from(expected), b = Buffer.from(String(signatureHeader));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
