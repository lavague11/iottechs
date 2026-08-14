import { cookies, headers } from "next/headers";
import { makeToken } from "../../../lib/auth";
import { listEnrolledFaces, recordLogin, logIdentityEvent, recordUnauthorizedFace } from "../../../lib/db";

// Face-first login (1:N). The client sends a live face embedding; we cosine-match
// it against every verified enrolled face, and — the two-step the owner asked for
// — also confirm the same live face matches that user's ID portrait. On a clean,
// unambiguous match we mint the SAME session a password login would, so the rest
// of the app treats it identically. Password login always remains available.
//
// Honest limits (documented, not hidden): a single-frame embedding is spoofable
// by a photo/video until hardware depth liveness exists (native-app-plan.md), so
// this is a convenience factor, not a vault key. Thresholds are deliberately
// stricter than enrolment, and we require the top match to beat the runner-up by
// a margin to avoid look-alike false-accepts.
export const runtime = "nodejs";

const FACE_THRESHOLD = 0.45;   // live ↔ enrolled face (strict)
const ID_THRESHOLD   = 0.30;   // live ↔ ID portrait (looser; ID photos are low-res)
const MARGIN         = 0.05;   // top match must beat 2nd-best by this
const MAX_PER_WINDOW = 12;     // attempts per IP per window
const WINDOW_MS      = 5 * 60 * 1000;

// Best-effort in-memory throttle (single instance; resets on redeploy).
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now); hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

function vecOf(e) { return Array.isArray(e) ? e : Array.isArray(e?.vec) ? e.vec : null; }
function kindOf(e) { return e?.kind || "arcface"; }
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb); return d ? s / d : -1;
}

export async function POST(request) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "127.0.0.1";
  if (throttled(ip)) return Response.json({ ok: false, error: "Too many attempts — wait a few minutes, or use your PIN." }, { status: 429 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Invalid request" }, { status: 400 }); }
  const live = vecOf(body.embedding);
  const kind = kindOf(body.embedding);
  if (!live || !live.length) return Response.json({ ok: false, error: "No face captured — try again." }, { status: 400 });

  // Only verified enrollments can authenticate.
  const pool = listEnrolledFaces().filter((r) => r.status === "verified");
  if (!pool.length) return Response.json({ ok: false, error: "No enrolled faces yet. Use your PIN, or enroll first." }, { status: 404 });

  // Rank each USER by their best-matching face (multi-face: a user can have several enrolled
  // faces — glasses, hat, a claimed capture). The margin below is between distinct users, so two
  // faces of the same person don't cancel each other out.
  const perUser = new Map();
  for (const r of pool) {
    const fv = vecOf(r.face_embedding);
    if (!fv || fv.length !== live.length) continue;             // different embedding space — skip
    const score = cosine(fv, live);
    const cur = perUser.get(r.user_id);
    if (!cur || score > cur.score) perUser.set(r.user_id, { r, score });
  }
  let best = null, second = -1;
  for (const u of perUser.values()) {
    if (!best || u.score > best.score) { second = best ? best.score : second; best = u; }
    else if (u.score > second) { second = u.score; }
  }

  const clean = best && best.score >= FACE_THRESHOLD && (best.score - second) >= MARGIN;
  // Two-step: the live face must also match the matched user's ID portrait.
  let idScore = null;
  if (clean) {
    const idv = vecOf(best.r.id_embedding);
    idScore = idv && idv.length === live.length ? cosine(idv, live) : null;
  }
  const idOk = idScore == null ? true : idScore >= ID_THRESHOLD;   // no ID on file → face alone (still verified enrolment)

  if (!clean || !idOk) {
    logIdentityEvent(best?.r.user_id || null, {
      kind: "login_fail",
      detail: `Face login miss (best ${best ? best.score.toFixed(3) : "—"}${idScore != null ? `, id ${idScore.toFixed(3)}` : ""})`,
      score: best?.score ?? null,
    });
    // Park the live frame (encrypted) so an admin can identify the person and attach this face
    // to their account — the glasses/hat/mask case that couldn't match. Deduped + 30-day purge.
    try {
      if (body.image && typeof body.image === "string" && body.image.startsWith("data:image"))
        recordUnauthorizedFace({ image: body.image, embedding: live, ip, bestUserId: best?.r.user_id || null, bestName: best?.r.name || null, bestScore: best?.score ?? null });
    } catch (e) {}
    return Response.json({ ok: false, error: "Not recognized. Use your PIN, or re-enroll." }, { status: 401 });
  }

  const u = best.r;
  const token = await makeToken({ id: u.user_id, role: u.role, email: u.email });
  const jar = await cookies();
  jar.set("iot_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  jar.delete("iot_access");

  recordLogin(u.user_id, ip, hdrs.get("user-agent") || null);
  logIdentityEvent(u.user_id, { kind: "login_match", detail: `Face login (face ${best.score.toFixed(3)}${idScore != null ? `, id ${idScore.toFixed(3)}` : ""})`, score: best.score });

  const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };
  return Response.json({ ok: true, name: u.name, role: u.role, home: ROLE_HOME[u.role] || "/dashboard" });
}
