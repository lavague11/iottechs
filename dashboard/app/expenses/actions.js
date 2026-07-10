"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { addExpense, archiveAndDelete, updateExpenseStatus } from "../../lib/db";

async function getStaff() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const tok   = token ? await parseToken(token) : null;
  return tok && ["admin", "manager"].includes(tok.role) ? tok : null;
}
async function requireStaff() { return !!(await getStaff()); }

export async function addExpenseAction(fields) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  if (!String(fields?.description || "").trim()) return { error: "Description is required." };
  try {
    addExpense(fields);
    revalidatePath("/expenses");
    revalidatePath("/finances");
    return { ok: true };
  } catch {
    return { error: "Could not add expense." };
  }
}

export async function updateExpenseStatusAction(id, { status, paymentDate, paymentMethod, reviewNotes }) {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const tok   = token ? await parseToken(token) : null;
  if (!tok || !["admin","manager"].includes(tok.role)) return { error: "Unauthorized." };
  try {
    updateExpenseStatus(id, { status, paymentDate, paymentMethod, reviewNotes, reviewedById: tok.id ?? null, reviewedByName: tok.name ?? tok.email ?? "Admin" });
    revalidatePath("/expenses");
    return { ok: true };
  } catch {
    return { error: "Could not update expense." };
  }
}

export async function deleteExpenseAction(id) {
  const actor = await getStaff();
  if (!actor) return { error: "Unauthorized." };
  try {
    const r = archiveAndDelete("expense", id, actor);
    if (!r.ok) return { error: r.error };
    revalidatePath("/expenses");
    revalidatePath("/finances");
    revalidatePath("/archives");
    return { ok: true };
  } catch {
    return { error: "Could not delete expense." };
  }
}

// Apply one status to a batch of expenses (approve→paid / decline) in a single click.
export async function bulkUpdateExpenseStatusAction(ids, status, { paymentDate, paymentMethod, reviewNotes } = {}) {
  const actor = await getStaff();
  if (!actor) return { error: "Unauthorized." };
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0);
  if (!list.length) return { error: "Nothing selected." };
  if (!["pending", "paid", "declined"].includes(status)) return { error: "Bad status." };
  let done = 0;
  for (const id of list) {
    try {
      updateExpenseStatus(id, { status, paymentDate, paymentMethod, reviewNotes, reviewedById: actor.id ?? null, reviewedByName: actor.name ?? actor.email ?? "Admin" });
      done++;
    } catch { /* skip the bad one, keep going */ }
  }
  revalidatePath("/expenses");
  revalidatePath("/finances");
  return { ok: true, count: done };
}

// Archive a batch of expenses at once.
export async function bulkDeleteExpenseAction(ids) {
  const actor = await getStaff();
  if (!actor) return { error: "Unauthorized." };
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0);
  if (!list.length) return { error: "Nothing selected." };
  let done = 0;
  for (const id of list) {
    try { if (archiveAndDelete("expense", id, actor).ok) done++; } catch { /* skip */ }
  }
  revalidatePath("/expenses");
  revalidatePath("/finances");
  revalidatePath("/archives");
  return { ok: true, count: done };
}
