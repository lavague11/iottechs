"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../lib/session";
import { scheduleAdtApplication, completeAdtApplication, getAdtApplication } from "../../lib/db";

async function requireStaff() {
  const u = await getSessionUser();
  return u && ["admin", "manager"].includes(u.role) ? u : null;
}

// Office schedules an install date on behalf of the customer.
export async function adminScheduleAdtAction(adtId, { date, window } = {}) {
  if (!(await requireStaff())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  if (!date) return { error: "Pick an install date." };
  scheduleAdtApplication(adtId, { date, window });
  revalidatePath("/adt-applications");
  return { ok: true };
}

// Office marks the install complete.
export async function adminCompleteAdtAction(adtId) {
  if (!(await requireStaff())) return { error: "Not authorized." };
  if (!getAdtApplication(adtId)) return { error: "Application not found." };
  completeAdtApplication(adtId);
  revalidatePath("/adt-applications");
  return { ok: true };
}
