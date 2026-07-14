import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../../lib/auth";
import { getJobByAccessId, getToolData, saveToolData, TOOL_KEYS } from "../../../lib/db";

// Plain REST twin of getToolDataAction/saveToolDataAction (proposal-actions.js), used ONLY by
// tool-sync.js and survey-approve.jsx's flushDraft — the two callers that move the mockup/survey
// photo blobs (several MB of data-URLs). Routing those through a "use server" Server Action hits
// a Turbopack dev-mode bug where large action arguments corrupt the RSC Flight stream and the
// client throws "Maximum array nesting exceeded" on an unrelated later request. A plain route
// handler ships the body as raw JSON with no Flight encoding, so it can't hit that bug.
// Every other tool (schedule/receiving/install/addendum/qc — small JSON, no photos) still goes
// through the server actions and is untouched by this.

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
  const tool = searchParams.get("tool");
  if (!accessId || !TOOL_KEYS.has(tool)) return Response.json({ ok: false });
  const tok = await getSessionRole();
  if (!(await canReadProject(tok, accessId))) return Response.json({ ok: false });
  if (tool === "techs" && tok.role === "customer") return Response.json({ ok: false });
  return Response.json({ ok: true, saved: getToolData(accessId, tool) });
}

export async function POST(req) {
  const { accessId, tool, data } = await req.json();
  const tok = await getSessionRole();
  if (!tok) return Response.json({ error: "Session expired." });
  if (!TOOL_KEYS.has(tool)) return Response.json({ error: "Unknown tool." });
  if (typeof data !== "string" || data.length > 8_000_000) return Response.json({ error: "Bad payload." });
  const editors = ["admin", "manager", "sales"];   // survey + mockup are office-only writes
  if (!editors.includes(tok.role)) return Response.json({ error: "Read-only for your role." });
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return Response.json({ error: "Not your project." });
  const saved = saveToolData(accessId, tool, data, tok.name || tok.email || tok.role);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return Response.json({ ok: true, saved: { updated_at: saved.updated_at } });
}
