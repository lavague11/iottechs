import { cookies, headers } from "next/headers";
import { resolveApplicationRef } from "../../../lib/db";
import { makeSvcToken, SVC_ACCESS_TTL_MS } from "../../../lib/auth";

// A 4-digit PIN dies to an unthrottled guesser — cap attempts per IP+application, PLUS a global
// per-application cap so rotating IPs can't grind one target, PLUS a per-IP cap on lookups so
// sequential APP ids can't be enumerated (security audit findings #2/#3).
const ATTEMPTS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
function bump(key, max) {
  const now = Date.now();
  const rec = ATTEMPTS.get(key);
  if (!rec || now > rec.resetAt) { ATTEMPTS.set(key, { n: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.n += 1;
  if (ATTEMPTS.size > 10000) ATTEMPTS.clear();
  return rec.n > max;
}

// Applicant gate. Reuses the signed scoped-token helper (the payload is just an id + timestamp),
// stored in its own iot_app cookie so it can't be confused with a service-call grant.
export async function POST(request) {
  try {
    const { appId, pin } = await request.json();
    if (!appId) return Response.json({ ok: false, error: "Enter an Application ID." }, { status: 400 });

    // Throttle BEFORE any lookup — existence probing counts as an attempt too (IDs are sequential,
    // so an unthrottled "does APPxxxx exist" oracle would enumerate the whole roster).
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "local";
    if (bump(`ip:${ip}`, 20)) return Response.json({ ok: false, error: "too_many" }, { status: 429 });

    const app = resolveApplicationRef(appId);
    if (!app) {
      // Cross-IP backstop on FAILED lookups only: the per-IP cap dies to X-Forwarded-For spoofing
      // on direct-origin hits (verified in QC), so misses also feed a global counter. Enumeration
      // is entirely a not-found activity, so capping misses at 100 / 10 min across all IPs stops
      // roster-scraping while a VALID ID lookup (below) is never blocked — real applicants checking
      // a real ID are unaffected even during an active enumeration attack.
      if (bump("probe:misses", 100)) return Response.json({ ok: false, error: "too_many" }, { status: 429 });
      return Response.json({ ok: false, error: "no_app" }, { status: 404 });
    }

    if (!pin) return Response.json({ ok: true, appId: app.app_id });

    // PIN guesses: 5 per IP+app, and 15 per app across ALL IPs (defeats IP rotation).
    if (bump(`${ip}:${app.app_id}`, 5) || bump(`app:${app.app_id}`, 15))
      return Response.json({ ok: false, error: "too_many" }, { status: 429 });

    if (!app.applicant_pin || !String(app.applicant_pin).trim())
      return Response.json({ ok: false, error: "no_pin" }, { status: 401 });
    if (String(app.applicant_pin).trim() !== String(pin).trim())
      return Response.json({ ok: false, error: "wrong_pin" }, { status: 401 });

    const jar = await cookies();
    jar.set("iot_app", await makeSvcToken(app.app_id), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.floor(SVC_ACCESS_TTL_MS / 1000), secure: process.env.NODE_ENV === "production",
    });
    return Response.json({ ok: true, appId: app.app_id });
  } catch (e) {
    console.error("app-pin-check error", e);
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
