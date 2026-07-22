"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { createSupportArticle, updateSupportArticle, archiveAndDelete, setSystemQr } from "../../lib/db";

// Support articles are edited by admin/manager only; everyone else reads.
async function requireEditor() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { user: null, error: "Only Admin & Manager can edit the Support library." };
  return { user, error: null };
}

export async function createSupportArticleAction({ title, body, category, pinned, audience }) {
  const { user, error } = await requireEditor();
  if (error) return { ok: false, error };
  if (!String(title || "").trim()) return { ok: false, error: "A title is required." };
  const a = createSupportArticle({ title, body, category, pinned, author: user.name, audience });
  revalidatePath("/support");
  revalidatePath("/tech-support");
  return { ok: true, article: a };
}

export async function updateSupportArticleAction(id, { title, body, category, pinned }) {
  const { error } = await requireEditor();
  if (error) return { ok: false, error };
  const a = updateSupportArticle(id, { title, body, category, pinned });
  if (!a) return { ok: false, error: "Article not found." };
  revalidatePath("/support");
  revalidatePath("/tech-support");
  return { ok: true, article: a };
}

// Archive (soft/recoverable → /archives), never a hard delete — matches the app-wide rule.
export async function archiveSupportArticleAction(id) {
  const { user, error } = await requireEditor();
  if (error) return { ok: false, error };
  const r = archiveAndDelete("support", id, { id: user.id, name: user.name });
  if (!r.ok) return r;
  revalidatePath("/support");
  revalidatePath("/tech-support");
  revalidatePath("/archives");
  return { ok: true };
}

// Save an activation card generated in the QR library. Same payload contract as the project-page
// System QR step (a data: URL out of the QR Cleaner widget) — this just lets admin fill the gap
// from the library instead of walking into each project.
export async function setLibrarySystemQrAction(accessId, dataUrl) {
  const { error } = await requireEditor();
  if (error) return { ok: false, error };
  const s = String(dataUrl || "");
  if (!s.startsWith("data:image/") || s.length > 3000000) return { ok: false, error: "Bad image." };
  const row = setSystemQr(accessId, s);
  if (!row) return { ok: false, error: "Project not found." };
  revalidatePath("/support/qr");
  revalidatePath(`/project/${accessId}`);
  return { ok: true, system_qr: s };
}
