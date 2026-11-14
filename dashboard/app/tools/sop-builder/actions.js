"use server";

import { getSessionUser } from "../../../lib/session";
import { secretValue, saveSopDraft, getSop, listSops, deleteSop, publishSop } from "../../../lib/db";
import { canEditSop, sopSlug } from "../../../lib/sop-model";

// All SOP mutations are staff-only (office + tech). The AI calls live in /api/sop/* (same gate); these
// actions own the draft/library persistence. The SOP Builder is also behind the SOP_BUILDER flag — the page
// enforces that; these actions enforce the staff role (defense in depth) so a stale client can't write.
async function staff() {
  const u = await getSessionUser();
  if (!u?.id || !canEditSop(u.role)) return null;
  return u;
}
const isManager = (u) => ["admin", "manager"].includes(u.role);

export async function listSopsAction() {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  return { ok: true, sops: listSops({ ownerId: u.id, all: isManager(u) }) };
}

export async function getSopAction(id) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  const sop = getSop(id);
  if (!sop) return { error: "Not found" };
  return { ok: true, sop };
}

// Create or replace a draft. The client owns the step order/content; images are /api/media URLs by now
// (uploaded on add/enhance). Returns the id so a first save can adopt it.
export async function saveSopDraftAction({ id, title, business, category, transcript, steps } = {}) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  try {
    const sid = saveSopDraft({ id, title, business, category, transcript, steps: Array.isArray(steps) ? steps : [],
      createdBy: u.name || u.email || "staff", createdById: u.id });
    return { ok: true, id: sid };
  } catch (e) { return { error: e?.message || "Save failed" }; }
}

export async function deleteSopAction(id) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  try { deleteSop(id); return { ok: true }; }
  catch (e) { return { error: e?.message || "Delete failed" }; }
}

// Publish → immutable version snapshot + status/slug. visibility: "internal" | "public".
export async function publishSopAction(id, { visibility = "internal" } = {}) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  const sop = getSop(id);
  if (!sop) return { error: "Not found" };
  try {
    const { slug, version } = publishSop(id, { visibility, publishedBy: u.name || u.email || "staff", slug: sopSlug(sop.title, id.slice(-4)) });
    return { ok: true, slug, version };
  } catch (e) { return { error: e?.message || "Publish failed" }; }
}

// Convenience for the page: is the flag on? (The page also checks; kept here for the client's nav links.)
export async function sopEnabledAction() {
  return { ok: true, on: secretValue("SOP_BUILDER") === "on" };
}
