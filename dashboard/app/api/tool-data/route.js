import { cookies } from "next/headers";
import { parseToken, parseAccessToken, parseSvcToken } from "../../../lib/auth";
import { getJobByAccessId, getToolData, saveToolData, TOOL_KEYS, getServiceCall, customerOwnsProjectAccount, toolWriteIsStale, toolWriteNeedsClaim, getToolClaim, toolRev } from "../../../lib/db";
import { claimStatus, isClaimedTool } from "../../../lib/tool-claim.js";
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
  // NOTE (B11): this route deliberately does NOT fall back to the adapted legacy survey. It is the
  // widget's seed endpoint, and seeding here is not read-only in practice — the widget uploads a
  // data-URL background to /api/media, rewrites `bg`, re-serialises its own state (dropping the
  // `__legacyAdapted` marker the outbound gate keys on) and autosyncs the result, which creates a real
  // survey2 row. Proven on a clone: opening the project once wrote an 820-byte survey2 row. Feeding
  // the editor a legacy survey is therefore the migration write the owner asked not to make, not a
  // read. Server-side RENDER paths use db.getSurveyBlobForRender instead, which no writer can reach.
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
  const { accessId, tool, data, allowEmpty, baseRev, editorId } = await req.json();
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
  // B7: the role gate asks what the CALLER may do, never whether the TARGET is real. There is no
  // foreign key on project_tool_data.project_access_id either, so a tab left open on a project that
  // has since been deleted kept POSTing and recreated orphan rows under a project that no longer
  // exists — unbounded growth from an abandoned tab, and it means deleting a project does not
  // reliably remove its tool data. Resolve the project first.
  if (!getJobByAccessId(accessId)) return Response.json({ error: "That project no longer exists." });
  // B14: refuse a write made against a version the caller did not read. One that sends a stale rev
  // is told, rather than silently winning. `stale: true` lets the client re-seed instead of retrying
  // the same bytes.
  if (toolWriteIsStale(accessId, tool, baseRev)) {
    return Response.json({ error: "This was changed somewhere else since you opened it. Reload to get the latest copy.", stale: true });
  }
  // …and the hole B14 left open: it only fired when a claim WAS sent. A tab that never successfully
  // read the row sent none, so it overwrote whatever was there. That is how ASC0055 lost six named
  // cameras off Floor 1 in a single write. A survey that already holds work now requires a claim.
  if (toolWriteNeedsClaim(accessId, tool, baseRev)) {
    return Response.json({ error: "This copy was never loaded from the server, so it wasn’t saved. Reload to get the latest copy.", stale: true });
  }
  // ONE EDITOR AT A TIME. While somebody else holds a live lease on this row, nobody else writes it.
  // The lease is per browser tab, because two tabs belonging to one person is the case that actually
  // loses data. `editorId` identifies the writer; a client that sends none is treated as "not the
  // holder", so it cannot write a claimed survey either.
  if (isClaimedTool(tool)) {
    const claim = getToolClaim(accessId, tool);
    const st = claimStatus(claim, editorId);
    if (st.state === "held") {
      return Response.json({
        error: `${st.holderName || "Someone else"} is editing this survey, so your change wasn’t saved.`,
        claimed: true, holderName: st.holderName || null, msLeft: st.msLeft,
      });
    }
  }
  if (emptyOverContent(accessId, tool, data, allowEmpty)) {
    return Response.json({ error: "Refused: that would replace the saved survey with an empty one." });
  }
  const saved = saveToolData(accessId, tool, data, tok.name || tok.email || tok.role);
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  // the rev the client should now claim on its next write (B14)
  return Response.json({ ok: true, saved: { updated_at: saved.updated_at, rev: toolRev(data) } });
}
