import { cookies } from "next/headers";
import { parseToken, parseAccessToken, parseSvcToken } from "../../../lib/auth";
import { getJobByAccessId, getToolData, saveToolData, TOOL_KEYS, getServiceCall, customerOwnsProjectAccount } from "../../../lib/db";
import { can } from "../../../lib/roles";
import { toolHasData } from "../../../lib/tool-data";

// Plain REST twin of getToolDataAction/saveToolDataAction (proposal-actions.js), used ONLY by
// tool-sync.js and survey-approve.jsx's flushDraft — the two callers that move the mockup/survey
// photo blobs (several MB of data-URLs). Routing those through a "use server" Server Action hits
// a Turbopack dev-mode bug where large action arguments corrupt the RSC Flight stream and the
// client throws "Maximum array nesting exceeded" on an unrelated later request. A plain route
// handler ships the body as raw JSON with no Flight encoding, so it can't hit that bug.
// Every other tool (schedule/receiving/install/addendum/qc — small JSON, no photos) still goes
// through the server actions and is untouched by this.

// This plain REST route exists ONLY for the client autosync/seed of the geometry/photo/appointment
// tools (tool-sync.js seedToolData/startToolAutosync + survey-approve flushDraft): survey, survey2,
// mockup, schedule. Those carry no payout/retail/cost. Every OTHER tool (install, qc, addendum,
// techs, tracking, receiving) MUST go through the server actions getToolDataAction/saveToolDataAction,
// which apply sanitizeToolRead (role stripping) + the per-tool editor map. Serving them here would
// bypass both — so this route hard-restricts to SYNC_TOOLS.
const SYNC_TOOLS = new Set(["survey", "survey2", "mockup", "schedule"]);

async function getSessionRole() {
  const jar = await cookies();
  const { withFreshRole } = await import("../../../lib/db");
  const raw = jar.get("iot_session")?.value;
  if (raw) { const tok = withFreshRole(await parseToken(raw)); if (tok?.role) return tok; }   // fresh DB role (no re-login)
  const acc = jar.get("iot_access")?.value;
  if (acc) { const at = await parseAccessToken(acc); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}

function customerOwnsProject(tok, accessId) {
  if (tok?.viaPin) return String(tok.accessId) === String(accessId);
  return customerOwnsProjectAccount(accessId, { userId: tok?.id, email: tok?.email });  // canonical (email OR phone)
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
  if (!accessId || !SYNC_TOOLS.has(tool)) return Response.json({ ok: false });
  const tok = await getSessionRole();
  if (!(await canReadProject(tok, accessId))) {
    // Service-call PIN visitor: the iot_svc grant covers READING the survey of the call's OWN
    // companion project (the tap-the-camera map needs it). Survey only, that one project only.
    if (tool === "survey") {
      const jar = await cookies();
      const svcTok = jar.get("iot_svc")?.value;
      const svc = svcTok ? await parseSvcToken(svcTok) : null;
      const call = svc?.svcId ? getServiceCall(svc.svcId) : null;
      if (call?.svc_project_id && String(call.svc_project_id).toUpperCase() === String(accessId).toUpperCase()) {
        return Response.json({ ok: true, saved: getToolData(accessId, tool) });
      }
    }
    return Response.json({ ok: false });
  }
  if (tool === "techs" && tok.role === "customer") return Response.json({ ok: false });
  return Response.json({ ok: true, saved: getToolData(accessId, tool) });
}

// LAST LINE OF DEFENCE, server-side: never let an EMPTY survey replace one that has content unless the
// caller declares that intent. A client-only guard leaves this route open to the same overwrite from any
// stale tab, an old cached bundle, or a retry queued before the fix shipped — and the row is the only
// copy of the survey. "Clear the survey" stays possible, but it has to SAY so (allowEmpty, which only
// the tool itself sends, because only the tool knows its state was actually loaded) rather than be
// inferred from emptiness. Scoped to the survey tools, whose emptiness test is exact.
function emptyOverContent(accessId, tool, data, allowEmpty) {
  if (allowEmpty) return false;
  if (tool !== "survey2" && tool !== "survey") return false;
  if (toolHasData(tool, data)) return false;
  const existing = getToolData(accessId, tool);
  return !!(existing?.data && toolHasData(tool, existing.data));
}

export async function POST(req) {
  const { accessId, tool, data, allowEmpty } = await req.json();
  const tok = await getSessionRole();
  if (!tok) return Response.json({ error: "Session expired." });
  if (!SYNC_TOOLS.has(tool)) return Response.json({ error: "Unknown tool." });
  if (typeof data !== "string" || data.length > 8_000_000) return Response.json({ error: "Bad payload." });
  // Writes are office-only (admin/manager/sales) with ONE exception: the site survey, which the tech on
  // site may edit — `can(role, "survey.edit")`, the same capability behind "Edit survey" and Resubmit.
  // Letting a tech unlock a survey they then cannot save strands their work in one browser's
  // localStorage, which is the silent data loss this whole section is about. Mockup and schedule keep
  // their existing sets. Enforced here AND in saveToolDataAction — the two write paths must agree.
  const allowed = tool === "survey2" || tool === "survey"
    ? can(tok.role, "survey.edit")
    : ["admin", "manager", "sales"].includes(tok.role);
  if (!allowed) return Response.json({ error: "Read-only for your role." });
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return Response.json({ error: "Not your project." });
  if (emptyOverContent(accessId, tool, data, allowEmpty)) {
    return Response.json({ error: "Refused: that would replace the saved survey with an empty one." });
  }
  const saved = saveToolData(accessId, tool, data, tok.name || tok.email || tok.role);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  return Response.json({ ok: true, saved: { updated_at: saved.updated_at } });
}
