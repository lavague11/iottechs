import { cookies, headers } from "next/headers";
import { resolveServiceCallRef } from "../../../lib/db";
import { makeSvcToken, SVC_ACCESS_TTL_MS } from "../../../lib/auth";

// A 4-digit PIN dies to an unthrottled guesser in seconds — cap attempts per IP+call. In-memory
// is fine here: a restart resets it, but so does it reset the attacker's session; the window is
// what matters. (The client gate also locks at 3 misses; this is the server-side backstop.)
const ATTEMPTS = new Map();   // key -> { n, resetAt }
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;
function throttled(key) {
  const now = Date.now();
  const rec = ATTEMPTS.get(key);
  if (!rec || now > rec.resetAt) { ATTEMPTS.set(key, { n: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.n += 1;
  if (ATTEMPTS.size > 5000) ATTEMPTS.clear();   // memory backstop
  return rec.n > MAX_TRIES;
}

// Public gate for the customer service-call tracker. Validates a Service Call ID + PIN and, on a
// match, mints a signed cookie scoped to THAT call so the tracker page opens without a login. No
// PIN supplied = resolve-only (turn a last-4 short code into the canonical SVC id for the URL).
export async function POST(request) {
  try {
    const { svcId, pin } = await request.json();
    if (!svcId) return Response.json({ ok: false, error: "Enter a Service Call ID." }, { status: 400 });

    const call = resolveServiceCallRef(svcId);
    if (!call) return Response.json({ ok: false, error: "no_call" }, { status: 404 });

    if (!pin) return Response.json({ ok: true, svcId: call.svc_id });

    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "local";
    if (throttled(`${ip}:${call.svc_id}`))
      return Response.json({ ok: false, error: "too_many" }, { status: 429 });

    if (!call.customer_pin || !String(call.customer_pin).trim())
      return Response.json({ ok: false, error: "no_pin" }, { status: 401 });
    if (String(call.customer_pin).trim() !== String(pin).trim())
      return Response.json({ ok: false, error: "wrong_pin" }, { status: 401 });

    const jar = await cookies();
    jar.set("iot_svc", await makeSvcToken(call.svc_id), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.floor(SVC_ACCESS_TTL_MS / 1000),
    });
    return Response.json({ ok: true, svcId: call.svc_id });
  } catch (e) {
    console.error("svc-pin-check error", e);
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
