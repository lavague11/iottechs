"use server";

import { cookies } from "next/headers";
import { parseToken } from "../../../lib/auth";
import { updateCustomerContact } from "../../../lib/db";
import { revalidatePath } from "next/cache";

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
