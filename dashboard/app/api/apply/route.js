import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createApplication, findApplicationByEmail } from "../../../lib/db";

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
    // Phone must be a real, dialable number (≥10 digits) — it also becomes their tracking PIN.
    if (phone.replace(/\D/g, "").length < 10) return Response.json({ ok: false, error: "Enter a valid phone number (at least 10 digits)." }, { status: 400 });
    // Email is required + must be well-formed: users.email is UNIQUE NOT NULL, so without a real one
    // the hire can't mint a login, and offers/updates go there.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });

    // One application per person. If this email already applied, we don't create a second — but if
    // they prove it's them (same phone AND same address on file), we hand back their existing ID
    // instead of an error. Otherwise it's a hard block (call us).
    const existing = findApplicationByEmail(email);
    if (existing) {
      const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
      const normAddr = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const samePhone = onlyDigits(existing.phone).slice(-10) === onlyDigits(phone).slice(-10) && onlyDigits(phone).length >= 10;
      const eAddr = normAddr(existing.address);
      const sameAddr = eAddr.length > 0 && eAddr === normAddr(b.address);
      if (samePhone && sameAddr) {
        return Response.json({ ok: true, recovered: true, appId: existing.app_id, pin: existing.applicant_pin, name: (existing.name || "").split(" ")[0] || "there" });
      }
      return Response.json({ ok: false, error: "duplicate" }, { status: 409 });
    }

    // Optional résumé: a base64 data URL (PDF / Word / image), capped so a row stays sane.
    let resume_name = null, resume_data = null;
    const rn = String(b.resume_name || "").trim();
    const rd = String(b.resume_data || "");
    if (rn && rd) {
      if (!/^data:(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(png|jpe?g|heic));base64,/i.test(rd)) {
        return Response.json({ ok: false, error: "Résumé must be a PDF, Word doc, or image." }, { status: 400 });
      }
      if (rd.length > 6_000_000) return Response.json({ ok: false, error: "Résumé is too large — keep it under 4 MB." }, { status: 400 });
      resume_name = rn.slice(0, 200);
      resume_data = rd;
    }

    const app = createApplication({
      name, email, phone,
      address: b.address, position: b.position, experience: b.experience, skills: b.skills,
      has_license: b.has_license, has_vehicle: b.has_vehicle, has_tools: b.has_tools,
      availability: b.availability, start_date: b.start_date, about: b.about,
      resume_name, resume_data,
    });

    revalidatePath("/onboarding");
    return Response.json({ ok: true, appId: app.app_id, pin: app.applicant_pin, name: name.split(" ")[0] || "there" });
  } catch (e) {
    console.error("apply error", e);
    return Response.json({ ok: false, error: "Server error. Please try again." }, { status: 500 });
  }
}
