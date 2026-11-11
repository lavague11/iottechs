"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { addExpense, addExpensesBatch, findExpenseDuplicates, archiveAndDelete, updateExpenseStatus, withFreshRole } from "../../lib/db";
import { validateExpense } from "../../lib/expense-model";

async function getStaff() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const tok   = token ? withFreshRole(await parseToken(token)) : null;   // fresh role (no re-login needed)
  return tok && ["admin", "manager"].includes(tok.role) ? tok : null;
}
async function requireStaff() { return !!(await getStaff()); }

const fmtMoney = (n) => "$" + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Add one expense. Server-validates (category coerced to the fixed enum) and guards duplicates: a repeated
// Reference # (hard) or a same-vendor/same-amount/same-day match (soft) comes back as { duplicate } unless
// `force` is set, so the modal can show "Save anyway".
export async function addExpenseAction(fields, { force = false } = {}) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  const { cleaned, errors } = validateExpense(fields || {});
  if (Object.keys(errors).length) return { error: Object.values(errors)[0], fieldErrors: errors };
  if (!force) {
    const dup = findExpenseDuplicates(cleaned);
    if (dup.hardRef) return { duplicate: "reference", match: dup.hardRef, message: `Reference “${cleaned.reference}” is already on expense #${dup.hardRef.id}.` };
    if (dup.soft.length) return { duplicate: "soft", match: dup.soft[0], message: `A ${fmtMoney(cleaned.amount)} ${cleaned.vendor} expense already exists on ${dup.soft[0].spent_on}.` };
  }
  try {
    const id = addExpense({ ...cleaned, receipt_media_id: fields.receipt_media_id || null });
    revalidatePath("/expenses"); revalidatePath("/finances");
    return { ok: true, id };
  } catch { return { error: "Could not add expense." }; }
}

// Batch CSV import. The client sends only the rows the user kept; the server re-validates each (bad ones
// are skipped, not fatal) and inserts the valid ones in one transaction. Negative amounts = refunds.
export async function importExpensesAction(rows) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  const valid = []; let skipped = 0;
  for (const raw of (Array.isArray(rows) ? rows : [])) {
    const { cleaned, errors } = validateExpense(raw);
    if (Object.keys(errors).length) { skipped++; continue; }
    valid.push(cleaned);
  }
  try {
    const imported = addExpensesBatch(valid);
    revalidatePath("/expenses"); revalidatePath("/finances");
    return { ok: true, imported, skipped };
  } catch { return { error: "Import failed — nothing was saved." }; }
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
