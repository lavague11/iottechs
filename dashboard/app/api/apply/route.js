import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createApplication } from "../../../lib/db";

// Applications create real rows from an anonymous endpoint — throttle per IP, same as the
// service-call intake. In-memory; a restart resets it, which is fine (so does the attacker's run).
const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX = 4;
function throttled(ip) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || now > rec.resetAt) { HITS.set(ip, { n: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.n += 1;
  if (HITS.size > 5000) HITS.clear();
  return rec.n > MAX;
}

function capitalize(s) {
  return String(s || "").trim().split(/\s+/).map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "")).join(" ");
}

// Public job application intake. Creates the application, returns its ID + PIN so the applicant
// can track it — same convention as a service call (PIN = last 4 of their phone).
export async function POST(request) {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "local";
    if (throttled(ip)) return Response.json({ ok: false, error: "Too many applications — give us a call instead." }, { status: 429 });

    const b = await request.json().catch(() => null) || {};
    const name  = capitalize(b.name);
    const phone = String(b.phone || "").trim();
    const email = String(b.email || "").trim();
    if (!name)  return Response.json({ ok: false, error: "Tell us your name." }, { status: 400 });
    if (!phone) return Response.json({ ok: false, error: "We need a phone number to reach you — it also becomes your PIN." }, { status: 400 });
    // Email is required: users.email is UNIQUE NOT NULL, so without one the hire can't mint a login.
    if (!email || !email.includes("@")) return Response.json({ ok: false, error: "We need your email — that's how we send offers and set up your login." }, { status: 400 });

    const app = createApplication({
      name, email, phone,
      address: b.address, position: b.position, experience: b.experience, skills: b.skills,
      has_license: b.has_license, has_vehicle: b.has_vehicle, has_tools: b.has_tools,
      availability: b.availability, start_date: b.start_date, about: b.about,
    });

    revalidatePath("/onboarding");
    return Response.json({ ok: true, appId: app.app_id, pin: app.applicant_pin, name: name.split(" ")[0] || "there" });
  } catch (e) {
    console.error("apply error", e);
    return Response.json({ ok: false, error: "Server error. Please try again." }, { status: 500 });
  }
}
