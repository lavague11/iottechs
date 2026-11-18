"use server";

import { getSessionUser } from "../../../lib/session";
import { secretValue, saveSopDraft, getSop, listSops, archiveSop, restoreSop, sopOwnerId, sopIdBySlug, publishSop, searchSopSteps, countUntaggedSopSteps } from "../../../lib/db";
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

// Who may WRITE a given guide. Reading is open to staff (the step library and the import sheet both
// cross guides on purpose — shared field knowledge). Writing is not: the id travels from the client,
// and listSops only scopes what a non-manager can SEE, so without this a tech could overwrite,
// publish or archive anyone's guide — including a published one — by passing its id.
function mayWrite(u, id) {
  if (isManager(u)) return true;
  const owner = sopOwnerId(id);
  if (owner === undefined) return true;                 // no such guide yet: this save creates it
  return owner != null && Number(owner) === Number(u.id);
}

export async function listSopsAction({ archived = false } = {}) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  return { ok: true, sops: listSops({ ownerId: u.id, all: isManager(u), archived: !!archived }) };
}

// Open a published guide for editing straight from its card on /guides, by its public slug. Same staff
// gate as getSopAction — the slug is public, the contents are not.
export async function getSopBySlugAction(slug) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  const id = sopIdBySlug(slug);
  if (!id) return { error: "Not found" };
  const sop = getSop(id);
  if (!sop) return { error: "Not found" };
  return { ok: true, sop };
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
  if (id && !mayWrite(u, id)) return { error: "That guide belongs to someone else." };
  try {
    const sid = saveSopDraft({ id, title, business, category, transcript, steps: Array.isArray(steps) ? steps : [],
      createdBy: u.name || u.email || "staff", createdById: u.id });
    return { ok: true, id: sid };
  } catch (e) { return { error: e?.message || "Save failed" }; }
}

// Step library: search every guide's steps (title/instruction/tags/guide) so one can be reused.
export async function searchStepsAction(q = "") {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  try { return { ok: true, steps: searchSopSteps({ q: String(q || "").slice(0, 80) }), untagged: countUntaggedSopSteps() }; }
  catch (e) { return { error: e?.message || "Search failed" }; }
}

// "Delete" in the UI = archive. The guide (and every published snapshot) is kept; it just leaves
// /guides, its public URL and the libraries. restoreSopAction puts it back — that's the Undo.
export async function archiveSopAction(id) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  if (!mayWrite(u, id)) return { error: "That guide belongs to someone else." };
  try { return archiveSop(id) ? { ok: true } : { error: "Not found" }; }
  catch (e) { return { error: e?.message || "Couldn't archive it." }; }
}

// Same, by the public slug — so a guide card on /guides can archive without exposing internal ids.
export async function archiveSopBySlugAction(slug) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  const id = sopIdBySlug(slug);
  if (!id) return { error: "Not found" };
  if (!mayWrite(u, id)) return { error: "That guide belongs to someone else." };
  try { return archiveSop(id) ? { ok: true, id } : { error: "Not found" }; }
  catch (e) { return { error: e?.message || "Couldn't archive it." }; }
}

export async function restoreSopAction(id) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  if (!mayWrite(u, id)) return { error: "That guide belongs to someone else." };
  try { return restoreSop(id) ? { ok: true } : { error: "Not found" }; }
  catch (e) { return { error: e?.message || "Couldn't restore it." }; }
}

// Publish → immutable version snapshot + status/slug. visibility: "internal" | "public".
export async function publishSopAction(id, { visibility = "internal" } = {}) {
  const u = await staff();
  if (!u) return { error: "Forbidden" };
  if (!mayWrite(u, id)) return { error: "That guide belongs to someone else." };
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
