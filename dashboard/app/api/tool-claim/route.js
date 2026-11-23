// ONE EDITOR AT A TIME — the lease endpoint. See lib/tool-claim.js for why this exists.
//
// GET  ?accessId=&tool=&editorId=      what the lease looks like from this editor
// POST { accessId, tool, editorId, editorName?, action }
//        action "claim"    acquire or renew — refused while somebody else holds a live lease
//        action "takeover" acquire anyway. Only ever from a person clicking it.
//        action "release"  give it up. Only the holder can.
//
// Holding a lease is not a permission. Who may OPEN the survey is roles.js, checked here first.
import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../../lib/auth";
import { getJobByAccessId, getToolClaim, claimToolEditor, releaseToolClaim, withFreshRole } from "../../../lib/db";
import { can } from "../../../lib/roles";
import { claimStatus, isClaimedTool } from "../../../lib/tool-claim.js";

async function session() {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  if (raw) { const tok = withFreshRole(await parseToken(raw)); if (tok?.role) return tok; }
  const acc = jar.get("iot_access")?.value;
  if (acc) { const at = await parseAccessToken(acc); if (at?.role) return { role: at.role, accessId: at.accessId, viaPin: true }; }
  return null;
}

// The lease only matters for an editor, so the gate is the same capability that lets someone write
// the survey at all. A viewer never takes one and is never blocked by one.
async function editorFor(accessId) {
  const tok = await session();
  if (!tok) return null;
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return null;
  if (!can(tok.role, "survey.edit")) return null;
  return tok;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const accessId = searchParams.get("accessId"), tool = searchParams.get("tool");
  const editorId = searchParams.get("editorId");
  if (!accessId || !isClaimedTool(tool)) return Response.json({ ok: false });
  if (!(await editorFor(accessId))) return Response.json({ ok: false });
  const claim = getToolClaim(accessId, tool);
  return Response.json({ ok: true, status: claimStatus(claim, editorId) });
}

export async function POST(req) {
  const { accessId, tool, editorId, editorName, action } = await req.json();
  if (!accessId || !isClaimedTool(tool) || !editorId) return Response.json({ error: "Bad request." });
  if (!getJobByAccessId(accessId)) return Response.json({ error: "That project no longer exists." });
  const tok = await editorFor(accessId);
  if (!tok) return Response.json({ error: "Read-only for your role." });

  const name = editorName || tok.name || tok.email || tok.role || null;

  if (action === "release") {
    const after = releaseToolClaim(accessId, tool, editorId);
    return Response.json({ ok: true, status: claimStatus(after, editorId) });
  }
  // A takeover is a person's decision, so it is recorded as one: the previous holder's write is
  // refused from that moment, and they are told who has it.
  const takeover = action === "takeover";
  const r = claimToolEditor(accessId, tool, editorId, name, { takeover });
  return Response.json({ ok: r.ok, status: r.status });
}
