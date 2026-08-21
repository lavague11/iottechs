import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../../lib/auth";
import { getJobByAccessId, getProjectCameras, setSurveyCameraPhoto } from "../../../lib/db";

// The project's canonical camera list, derived from the Site Survey (see getProjectCameras). This is
// the single source of truth the CCTV mockup grid reflects — and, later, the proposal/PDF — so cameras
// are entered ONCE, in the survey. Read-only endpoint; anyone who can read the project can read it.

async function getSessionRole() {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  if (raw) { const tok = await parseToken(raw); if (tok?.role) return tok; }
  const acc = jar.get("iot_access")?.value;
  if (acc) { const at = await parseAccessToken(acc); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}

function customerOwnsProject(tok, accessId) {
  if (tok?.viaPin) return String(tok.accessId) === String(accessId);
  const proj = getJobByAccessId(accessId);
  return proj && String(proj.contact_email || "").toLowerCase() === String(tok.email || "").toLowerCase();
}

async function canReadProject(tok, accessId) {
  if (!tok) return false;
  if (["admin", "manager", "sales"].includes(tok.role)) return true;
  if (tok.viaPin) return String(tok.accessId) === String(accessId);
  if (tok.role === "customer") return customerOwnsProject(tok, accessId);
  return tok.role === "tech";
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const accessId = searchParams.get("accessId");
  if (!accessId) return Response.json({ ok: false });
  const tok = await getSessionRole();
  if (!(await canReadProject(tok, accessId))) return Response.json({ ok: false });
  return Response.json({ ok: true, cameras: getProjectCameras(accessId) });
}

// Attach / replace / clear one camera's view photo (office-only), targeting a device by (floor, di).
// The client uploads the image to /api/media first and passes the returned URL as `photo` (or null to
// clear). Survey + mockup both read the same survey2 blob, so the edit shows up everywhere.
export async function POST(req) {
  const { accessId, floor, di, photo, photoName } = await req.json();
  const tok = await getSessionRole();
  if (!tok) return Response.json({ error: "Session expired." });
  if (!["admin", "manager", "sales"].includes(tok.role)) return Response.json({ error: "Read-only for your role." });
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return Response.json({ error: "Not your project." });
  if (!accessId || !Number.isInteger(floor) || !Number.isInteger(di)) return Response.json({ error: "Bad target." });
  if (photo != null && (typeof photo !== "string" || photo.length > 8_000_000)) return Response.json({ error: "Bad photo." });
  const cameras = setSurveyCameraPhoto(accessId, floor, di, photo || null, typeof photoName === "string" ? photoName : null);
  if (!cameras) return Response.json({ error: "Camera not found — the survey changed. Reopen and retry." });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return Response.json({ ok: true, cameras });
}
