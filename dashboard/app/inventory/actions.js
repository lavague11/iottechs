"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { addInventoryItem, assignInventory, archiveAndDelete, updateQtyForProject, markInventoryUsed } from "../../lib/db";

async function requireStaff() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  return actor && ["admin", "manager"].includes(actor.role) ? actor : null;
}

export async function addItemAction(fields) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  if (!String(fields?.name || "").trim()) return { error: "Name is required." };
  try {
    addInventoryItem(fields);
    revalidatePath("/inventory");
    return { ok: true };
  } catch {
    return { error: "Could not add item." };
  }
}

export async function assignItemAction(id, projectAccessId, qtyForProject) {
  if (!(await requireStaff())) return { error: "Unauthorized." };
  try {
    assignInventory(id, projectAccessId || null, qtyForProject);
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
  if (!(await requireStaff())) return { error: "Unauthorized." };
  try {
    markInventoryUsed(id, qtyUsed);
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
