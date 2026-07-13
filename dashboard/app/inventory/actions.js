"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { addInventoryItem, assignInventory, archiveAndDelete, updateQtyForProject, markInventoryUsed, batchReceiveSerials, getItemHistory } from "../../lib/db";

async function requireStaff() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  return actor && ["admin", "manager"].includes(actor.role) ? actor : null;
}

export async function addItemAction(fields) {
  const actor = await requireStaff();
  if (!actor) return { error: "Unauthorized." };
  if (!String(fields?.name || "").trim()) return { error: "Name is required." };
  try {
    addInventoryItem(fields, actor);
    revalidatePath("/inventory");
    return { ok: true };
  } catch {
    return { error: "Could not add item." };
  }
}

// Scan a batch of serials into an existing item, or into a new item created on the spot.
export async function batchReceiveAction({ itemId, newItem, serials, sku, tracking }) {
  const actor = await requireStaff();
  if (!actor) return { error: "Unauthorized." };
  const lines = String(serials || "").split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return { error: "Scan at least one serial." };
  try {
    let id = itemId ? Number(itemId) : null;
    if (!id) {
      if (!String(newItem?.name || "").trim()) return { error: "Pick an item or name a new one." };
      id = addInventoryItem({ ...newItem, quantity: 0 }, actor);
    }
    const r = batchReceiveSerials(id, lines, { sku, tracking }, actor);
    if (r.error) return { error: r.error };
    revalidatePath("/inventory");
    return { ok: true, added: r.added, skipped: r.skipped };
  } catch {
    return { error: "Could not scan in items." };
  }
}

export async function getItemHistoryAction(itemId, since) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  try {
    const h = getItemHistory(itemId, since || null);
    if (!h) return { error: "Item not found." };
    return { ok: true, history: h };
  } catch {
    return { error: "Could not load history." };
  }
}

export async function assignItemAction(id, projectAccessId, qtyForProject) {
  const actor = await requireStaff();
  if (!actor) return { error: "Unauthorized." };
  try {
    assignInventory(id, projectAccessId || null, qtyForProject, actor);
    revalidatePath("/inventory");
    return { ok: true };
  } catch {
    return { error: "Could not assign item." };
  }
}

export async function updateQtyForProjectAction(id, qty) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  try {
    updateQtyForProject(id, qty);
    revalidatePath("/inventory");
    return { ok: true };
  } catch {
    return { error: "Could not update quantity." };
  }
}

export async function markUsedAction(id, qtyUsed) {
  const actor = await requireStaff();
  if (!actor) return { error: "Unauthorized." };
  try {
    markInventoryUsed(id, qtyUsed, actor);
    revalidatePath("/inventory");
    return { ok: true };
  } catch {
    return { error: "Could not update." };
  }
}

export async function deleteItemAction(id) {
  const actor = await requireStaff();
  if (!actor) return { error: "Unauthorized." };
  try {
    const r = archiveAndDelete("inventory", id, actor);
    if (!r.ok) return { error: r.error };
    revalidatePath("/inventory");
    revalidatePath("/archives");
    return { ok: true };
  } catch {
    return { error: "Could not delete item." };
  }
}
