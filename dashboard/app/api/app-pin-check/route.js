import { cookies, headers } from "next/headers";
import { resolveApplicationRef } from "../../../lib/db";
import { makeSvcToken, SVC_ACCESS_TTL_MS } from "../../../lib/auth";

// A 4-digit PIN dies to an unthrottled guesser — cap attempts per IP+application (same backstop
// as the service-call gate; the client also locks after 3 misses).
const ATTEMPTS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;
function throttled(key) {
  const now = Date.now();
  const rec = ATTEMPTS.get(key);
  if (!rec || now > rec.resetAt) { ATTEMPTS.set(key, { n: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.n += 1;
  if (ATTEMPTS.size > 5000) ATTEMPTS.clear();
  return rec.n > MAX_TRIES;
}

// Applicant gate. Reuses the signed scoped-token helper (the payload is just an id + timestamp),
// stored in its own iot_app cookie so it can't be confused with a service-call grant.
export async function POST(request) {
  try {
    const { appId, pin } = await request.json();
    if (!appId) return Response.json({ ok: false, error: "Enter an Application ID." }, { status: 400 });

    const app = resolveApplicationRef(appId);
    if (!app) return Response.json({ ok: false, error: "no_app" }, { status: 404 });

    if (!pin) return Response.json({ ok: true, appId: app.app_id });

    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "local";
    if (throttled(`${ip}:${app.app_id}`)) return Response.json({ ok: false, error: "too_many" }, { status: 429 });

    if (!app.applicant_pin || !String(app.applicant_pin).trim())
      return Response.json({ ok: false, error: "no_pin" }, { status: 401 });
    if (String(app.applicant_pin).trim() !== String(pin).trim())
      return Response.json({ ok: false, error: "wrong_pin" }, { status: 401 });

    const jar = await cookies();
    jar.set("iot_app", await makeSvcToken(app.app_id), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.floor(SVC_ACCESS_TTL_MS / 1000),
    });
    return Response.json({ ok: true, appId: app.app_id });
  } catch (e) {
    console.error("app-pin-check error", e);
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
