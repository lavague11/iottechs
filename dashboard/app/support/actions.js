"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { createSupportArticle, updateSupportArticle, archiveAndDelete } from "../../lib/db";

// Support articles are edited by admin/manager only; everyone else reads.
async function requireEditor() {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return { user: null, error: "Only Admin & Manager can edit the Support library." };
  return { user, error: null };
}

export async function createSupportArticleAction({ title, body, category, pinned }) {
  const { user, error } = await requireEditor();
  if (error) return { ok: false, error };
  if (!String(title || "").trim()) return { ok: false, error: "A title is required." };
  const a = createSupportArticle({ title, body, category, pinned, author: user.name });
  revalidatePath("/support");
  return { ok: true, article: a };
}

export async function updateSupportArticleAction(id, { title, body, category, pinned }) {
  const { error } = await requireEditor();
  if (error) return { ok: false, error };
  const a = updateSupportArticle(id, { title, body, category, pinned });
  if (!a) return { ok: false, error: "Article not found." };
  revalidatePath("/support");
  return { ok: true, article: a };
}

// Archive (soft/recoverable → /archives), never a hard delete — matches the app-wide rule.
export async function archiveSupportArticleAction(id) {
  const { user, error } = await requireEditor();
  if (error) return { ok: false, error };
  const r = archiveAndDelete("support", id, { id: user.id, name: user.name });
  if (!r.ok) return r;
  revalidatePath("/support");
  revalidatePath("/archives");
  return { ok: true };
}
