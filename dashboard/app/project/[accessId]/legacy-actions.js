"use server";

// Section O — ADMIN manual stage/status override for a legacy project.
//
// The one-time migration (scripts/migrate-legacy-projects.mjs) recomputes stage/percent/status from
// evidence and deliberately REFUSES to guess when the evidence is missing or self-contradictory. The
// projects it reports as "needs a human" are answered here, by an admin, on the record.
//
// Security: ADMIN ONLY, enforced server-side through `can(role, "legacy.override")` — never a role
// string comparison in a component, and never trusted from a client argument. A project-scoped
// PIN grant may only override its own project. Every applied override is appended to the project
// event log (plus a stage_transitions row) so a hand-set stage is always distinguishable from one the
// lifecycle earned.
import { headers } from "next/headers";
import { setLegacyStageOverride } from "../../../lib/db";
import { can } from "../../../lib/roles";
import { overrideRefusal } from "../../../lib/legacy-migration";

async function adminTok() {
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") || "";
  const pick = (name) => cookie.split(";").find((c) => c.trim().startsWith(`${name}=`))?.split("=").slice(1).join("=");
  const { parseToken, parseAccessToken } = await import("../../../lib/auth");
  const { withFreshRole } = await import("../../../lib/db");
  const sess = pick("iot_session");
  if (sess) {
    const t = withFreshRole(await parseToken(sess.trim()));
    if (t?.role) return { role: t.role, name: t.name || t.email || t.role, viaPin: false };
  }
  const acc = pick("iot_access");
  if (acc) {
    const at = await parseAccessToken(acc.trim());
    if (at?.role) return { role: at.role, name: at.role, accessId: at.accessId, viaPin: true };
  }
  return null;
}

// stage: a master stage key · completed: true = stamp complete, false = clear the stamp, null = leave
// completedAt: the date the job finished (YYYY-MM-DD). REQUIRED with completed:true unless the row
//   carries dated evidence to derive it from — never "today", because completed_at + warranty_months
//   is the warranty and a job that finished in July must not ship a warranty starting in November.
// reason: free text, stored on the event log (the "why" a reviewer will want later).
export async function setLegacyProjectStateAction(accessId, { stage, completed = null, completedAt = null, reason = null } = {}) {
  const tok = await adminTok();
  // The gate itself lives in lib/legacy-migration.overrideRefusal — pure, so the refusal path is
  // unit-tested against the real function rather than a re-typed copy of it.
  const refusal = overrideRefusal(tok, accessId, can);
  if (refusal) return { error: refusal };

  const res = setLegacyStageOverride(accessId, {
    stage,
    completed: completed === true ? true : completed === false ? false : null,
    completedAt: completedAt ? String(completedAt).slice(0, 25) : null,
    reason,
    by: tok.name,
  });
  if (!res.ok) return { error: res.error };

  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/project/${accessId}`);
  revalidatePath("/my-projects");
  revalidatePath("/projects");
  return { ok: true, changed: res.changed, stage: res.stage, stampChanged: res.stampChanged || null, completedAt: res.completedAt || null };
}

// What the override dialog needs to open with real values instead of blanks: where the project sits
// now, whether it is already stamped, and the dated evidence we would use for the warranty start (so
// the admin confirms a real date rather than typing one from memory). Read-only, same admin gate.
export async function getLegacyProjectStateAction(accessId) {
  const tok = await adminTok();
  const refusal = overrideRefusal(tok, accessId, can);
  if (refusal) return { error: refusal };
  const { getJobByAccessId, completionEvidenceDate } = await import("../../../lib/db");
  const p = getJobByAccessId(accessId);
  if (!p) return { error: "Project not found." };
  const ev = completionEvidenceDate(accessId);
  return {
    ok: true,
    stage: p.stage,
    completedAt: p.completed_at || null,
    projectType: p.project_type || "A",
    evidenceDate: ev.date ? String(ev.date).slice(0, 10) : null,
    evidenceSource: ev.source,
  };
}
