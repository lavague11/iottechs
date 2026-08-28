import { cookies, headers } from "next/headers";
import { resolveApplicationRef, secretValue, getStaffUsers, logApplicationEvent } from "../../../lib/db";
import { makeToken } from "../../../lib/auth";

// Staff access from an application PIN gate: a long pass-phrase (vault key STAFF_ACCESS_PASSPHRASE,
// Development ▸ API Keys) mints a real admin session and drops the holder into the admin view of
// that application. Deliberately NOT the 4-digit pad — this is a full credential, so it must be a
// real pass-phrase (8+ chars) and it's throttled hard per IP.
const ATTEMPTS = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 5;
function throttled(ip) {
  const now = Date.now();
  const rec = ATTEMPTS.get(ip);
  if (!rec || now > rec.resetAt) { ATTEMPTS.set(ip, { n: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.n += 1;
  if (ATTEMPTS.size > 5000) ATTEMPTS.clear();
  return rec.n > MAX_TRIES;
}

// Constant-time-ish comparison — don't leak prefix length through timing.
function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}

export async function POST(request) {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "local";
    if (throttled(ip)) return Response.json({ ok: false, error: "Too many attempts — wait a few minutes." }, { status: 429 });

    const { appId, passphrase } = await request.json().catch(() => ({}));
    const secret = secretValue("STAFF_ACCESS_PASSPHRASE");
    if (!secret || String(secret).length < 8) {
      // Unset (or unusably short) → the feature is off. Same message as a miss — don't advertise.
      return Response.json({ ok: false, error: "wrong" }, { status: 401 });
    }
    if (!passphrase || !safeEqual(String(passphrase), String(secret))) {
      console.warn(`[staff-access] failed attempt from ${ip}${appId ? ` on ${String(appId).slice(0, 12)}` : ""}`);
      return Response.json({ ok: false, error: "wrong" }, { status: 401 });
    }

    // Mint the session as the site's primary admin account (oldest admin) so every subsequent
    // action attributes to a real user, exactly as if they'd logged in.
    const admin = getStaffUsers().filter((u) => u.role === "admin").sort((a, b) => a.id - b.id)[0];
    if (!admin) return Response.json({ ok: false, error: "wrong" }, { status: 401 });

    const jar = await cookies();
    jar.set("iot_session", await makeToken({ id: admin.id, role: admin.role, email: admin.email }), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8, secure: process.env.NODE_ENV === "production",
    });

    // Land on the admin view of that application when one was in play; else the hiring board.
    const app = appId ? resolveApplicationRef(appId) : null;
    console.log(`[staff-access] granted to ${ip}${app ? ` for ${app.app_id}` : ""}`);
    if (app) {
      try { logApplicationEvent(app.app_id, { kind: "note", detail: `Staff access via pass-phrase (application gate, IP ${ip})`, actor_role: "admin", actor_name: admin.name }); } catch {}
    }
    return Response.json({ ok: true, redirect: app ? `/onboarding/${app.app_id}` : "/hiring" });
  } catch (e) {
    console.error("staff-access error", e);
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
