"use server";

// Server actions for the SEO working queue (/dev/seo). Every action re-checks the caller's capability
// server-side (lib/roles) — the client is display-only. All mutations flow through lib/seo, so the
// publish gate, revisions, and fact-safety rules apply uniformly.
import { getSessionUser } from "../../../lib/session";
import { can } from "../../../lib/roles";
import {
  seedSeoPlan, createPage, updatePage, setStatus, publishPage, unpublishPage,
  upsertFact, addBacklink, upsertCaseStudy,
} from "../../../lib/seo";

async function who(cap) {
  const u = await getSessionUser();
  if (!u?.id) return { err: { error: "Not signed in." } };
  if (!can(u.role, cap)) return { err: { error: "Not allowed." } };
  return { user: u, name: u.name || u.role };
}

export async function seedPlanAction() {
  const g = await who("seo.admin"); if (g.err) return g.err;
  try { return { ok: true, ...seedSeoPlan(g.name) }; } catch (e) { return { error: String(e?.message || e) }; }
}

export async function createPageAction(data) {
  const g = await who("seo.edit"); if (g.err) return g.err;
  try { const p = createPage(data || {}, g.name); return { ok: true, page: p }; } catch (e) { return { error: String(e?.message || e) }; }
}

export async function updatePageAction(id, patch) {
  const g = await who("seo.edit"); if (g.err) return g.err;
  try { return { ok: true, page: updatePage(Number(id), patch || {}, g.name) }; } catch (e) { return { error: String(e?.message || e) }; }
}

export async function setStatusAction(id, status, reason) {
  // Advancing to "approved" needs the approve capability; other moves need edit.
  const g = await who(status === "approved" ? "seo.approve" : "seo.edit"); if (g.err) return g.err;
  try { return { ok: true, page: setStatus(Number(id), status, g.name, reason || "") }; } catch (e) { return { error: String(e?.message || e) }; }
}

export async function publishPageAction(id) {
  const g = await who("seo.publish"); if (g.err) return g.err;
  try { return publishPage(Number(id), g.name); } catch (e) { return { error: String(e?.message || e) }; }
}

export async function unpublishPageAction(id) {
  const g = await who("seo.publish"); if (g.err) return g.err;
  try { return unpublishPage(Number(id), g.name); } catch (e) { return { error: String(e?.message || e) }; }
}

export async function upsertFactAction(data) {
  const g = await who("seo.admin"); if (g.err) return g.err;
  try { return { ok: true, fact: upsertFact({ ...data, updatedBy: g.name }) }; } catch (e) { return { error: String(e?.message || e) }; }
}

export async function addBacklinkAction(data) {
  const g = await who("seo.edit"); if (g.err) return g.err;
  try { return { ok: true, backlink: addBacklink(data || {}) }; } catch (e) { return { error: String(e?.message || e) }; }
}

export async function upsertCaseStudyAction(data) {
  const g = await who("seo.edit"); if (g.err) return g.err;
  try { return { ok: true, caseStudy: upsertCaseStudy(data || {}) }; } catch (e) { return { error: String(e?.message || e) }; }
}
