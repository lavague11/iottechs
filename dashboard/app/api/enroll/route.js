import { getSessionUser } from "../../../lib/session";
import { upsertUserIdentity, logIdentityEvent } from "../../../lib/db";

// Face + ID enrolment. A signed-in user enrols THEIR OWN face and ID; the row is
// keyed to their user id, so one account can never enrol as another. Photos are
// encrypted at rest by the DB layer; embeddings are stored for the 1:N matcher.
//
// Trust: the client computes the embeddings, but we DON'T trust its "it matched"
// claim — we recompute the ID-portrait ↔ live-face cosine here and only mark the
// account 'verified' when it actually clears the threshold. A mismatch (someone
// else's ID) lands in 'pending' for an admin to review, never auto-verified.
export const runtime = "nodejs";

const ENROLL_THRESHOLD = 0.34; // ArcFace cosine; ID portraits are low-res, so a touch lenient

function vecOf(e) { return Array.isArray(e) ? e : Array.isArray(e?.vec) ? e.vec : null; }
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb); return d ? s / d : null;
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id) return Response.json({ error: "Sign in to enrol." }, { status: 403 });

  let b;
  try { b = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!b?.consent) return Response.json({ error: "Consent is required to enrol." }, { status: 400 });

  const faceVec = vecOf(b.face_embedding);
  if (!faceVec || !faceVec.length) return Response.json({ error: "Face capture is missing — try the scan again." }, { status: 400 });

  const idVec = vecOf(b.id_embedding);
  const cap = (s) => !s || (typeof s === "string" && s.length < 8_000_000);
  if (!cap(b.id_image) || !cap(b.face_image)) return Response.json({ error: "Image too large — resize before enrolling." }, { status: 413 });

  // Server-side ID↔face cross-check (only meaningful when both are ArcFace vectors).
  let score = null, verified = false;
  const bothArc = b.face_embedding?.kind === "arcface" && b.id_embedding?.kind === "arcface";
  if (idVec && idVec.length === faceVec.length && bothArc) {
    score = cosine(idVec, faceVec);
    verified = score != null && score >= ENROLL_THRESHOLD;
  }
  const status = verified ? "verified" : "pending";

  const r = upsertUserIdentity(user.id, {
    status,
    id_type: b.id_type === "passport" ? "passport" : "drivers_license",
    id_image: b.id_image || null,
    id_embedding: b.id_embedding || null,
    id_fields: b.id_fields || null,
    id_verdict: b.id_verdict || null,
    face_image: b.face_image || null,
    face_embedding: b.face_embedding,
    enroll_score: score,
    consent_at: new Date().toISOString(),
    consent_version: b.consent_version || "v1",
    enrolled_at: new Date().toISOString(),
  }, { actor_role: user.role, actor_name: user.name });

  logIdentityEvent(user.id, {
    kind: "enroll",
    detail: `Enrolled ${b.id_type === "passport" ? "passport" : "licence"} — ${status}${score != null ? ` (match ${score.toFixed(3)})` : ""}`,
    score, actor_role: user.role, actor_name: user.name,
  });

  return Response.json({
    ok: true,
    status,
    score,
    // Tell the client what to say without leaking the raw threshold logic.
    message: verified
      ? "Verified — your face and ID match."
      : idVec
        ? "Saved for review — your face and ID didn't match closely enough to auto-verify."
        : "Saved for review — add your ID to get verified.",
  });
}
