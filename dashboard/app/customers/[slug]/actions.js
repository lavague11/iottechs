"use server";

import { cookies } from "next/headers";
import { parseToken } from "../../../lib/auth";
import { updateCustomerContact, addCustomerNote, getCustomerActivity } from "../../../lib/db";
import { revalidatePath } from "next/cache";

async function staffActor() {
  const jar = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  return actor && ["admin", "manager", "sales"].includes(actor.role) ? actor : null;
}

// Append a customer-level log note ("called, left voicemail"), then hand back the refreshed timeline.
export async function addCustomerNoteAction(customerId, body) {
  const actor = await staffActor();
  if (!actor) return { error: "Unauthorized." };
  const r = addCustomerNote(Number(customerId), { body, authorName: actor.name, authorRole: actor.role });
  if (r.error) return r;
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, activity: getCustomerActivity(Number(customerId)) };
}

// Customer records are office data — only staff may rewrite contact info. Without this
// gate any logged-in tech or customer could edit any customer's profile.
export async function saveCustomerContact(name, fields) {
  const jar = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;
  if (!actor || !["admin", "manager", "sales"].includes(actor.role)) {
    return { error: "Unauthorized." };
  }
  updateCustomerContact(name, fields);
  revalidatePath(`/customers/${encodeURIComponent(name)}`);
  revalidatePath("/customers");
  return { ok: true };
}
