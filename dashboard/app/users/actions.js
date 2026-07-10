"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseToken } from "../../lib/auth";
import { setUserRole, getUserById, updateUser, setUserDisabled, createStaffUser, archiveAndDelete, resetUserPassword } from "../../lib/db";
import { randomBytes } from "crypto";

const ALLOWED_ROLES = ["admin", "manager", "sales", "tech", "customer"];

async function getActor() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  return token ? await parseToken(token) : null;
}

export async function updateRoleAction(targetId, newRole) {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;

  if (!actor || !["admin", "manager"].includes(actor.role)) {
    return { error: "Unauthorized." };
  }
  if (!ALLOWED_ROLES.includes(newRole)) {
    return { error: "Invalid role." };
  }
  if (actor.role === "manager" && newRole === "admin") {
    return { error: "Managers cannot assign the admin role." };
  }

  // Managers cannot touch admin accounts
  const target = getUserById(targetId);
  if (!target) return { error: "User not found." };
  if (actor.role === "manager" && target.role === "admin") {
    return { error: "Managers cannot modify admin accounts." };
  }

  setUserRole(targetId, newRole);
  return { ok: true };
}

export async function updateUserInfoAction(targetId, fields) {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const actor = token ? await parseToken(token) : null;

  if (!actor || !["admin", "manager"].includes(actor.role)) {
    return { error: "Unauthorized." };
  }
  const target = getUserById(targetId);
  if (!target) return { error: "User not found." };
  if (actor.role === "manager" && target.role === "admin") {
    return { error: "Managers cannot modify admin accounts." };
  }

  try {
    updateUser(targetId, fields);
    return { ok: true };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("USERNAME_TAKEN")) return { error: "That username is already taken by another user." };
    if (msg.includes("EMAIL_TAKEN"))    return { error: "That email is already registered to another user." };
    if (msg.includes("PHONE_TAKEN"))    return { error: "That phone number is already registered to another user." };
    if (msg.includes("UNIQUE"))         return { error: "Username, email, or phone already in use." };
    return { error: "Could not update user." };
  }
}

export async function toggleDisabledAction(targetId, disabled) {
  const actor = await getActor();
  if (!actor || !["admin", "manager"].includes(actor.role)) return { error: "Unauthorized." };

  const target = getUserById(targetId);
  if (!target) return { error: "User not found." };
  if (actor.role === "manager" && target.role === "admin") return { error: "Managers cannot modify admin accounts." };
  if (Number(targetId) === Number(actor.id)) return { error: "You cannot disable your own account." };

  setUserDisabled(targetId, disabled);
  return { ok: true, disabled: disabled ? 1 : 0 };
}

export async function deleteUserAction(targetId) {
  const actor = await getActor();
  if (!actor || !["admin", "manager"].includes(actor.role)) return { error: "Unauthorized." };

  const target = getUserById(targetId);
  if (!target) return { error: "User not found." };
  if (actor.role === "manager" && target.role === "admin") return { error: "Managers cannot delete admin accounts." };
  if (Number(targetId) === Number(actor.id)) return { error: "You cannot delete your own account." };

  const r = archiveAndDelete("user", targetId, actor);
  if (!r.ok) return { error: r.error };
  revalidatePath("/users");
  revalidatePath("/archives");
  return { ok: true };
}

// Apply enable / disable / delete to a batch of users in one click. Each id runs through the same
// guards as the single-item actions: managers can't touch admins, and you can't act on yourself.
export async function bulkUserAction(ids, op) {
  const actor = await getActor();
  if (!actor || !["admin", "manager"].includes(actor.role)) return { error: "Unauthorized." };
  if (!["enable", "disable", "delete"].includes(op)) return { error: "Bad operation." };
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => n > 0);
  if (!list.length) return { error: "Nothing selected." };

  let done = 0, skipped = 0;
  for (const id of list) {
    const target = getUserById(id);
    if (!target) { skipped++; continue; }
    if (actor.role === "manager" && target.role === "admin") { skipped++; continue; }
    if (Number(id) === Number(actor.id)) { skipped++; continue; } // never act on self in bulk
    try {
      if (op === "delete") { if (archiveAndDelete("user", id, actor).ok) done++; else skipped++; }
      else { setUserDisabled(id, op === "disable"); done++; }
    } catch { skipped++; }
  }
  revalidatePath("/users");
  if (op === "delete") revalidatePath("/archives");
  return { ok: true, count: done, skipped };
}

export async function resetPasswordAction(targetId) {
  const actor = await getActor();
  if (!actor || !["admin", "manager"].includes(actor.role)) return { error: "Unauthorized." };

  const target = getUserById(targetId);
  if (!target) return { error: "User not found." };
  if (actor.role === "manager" && target.role === "admin") return { error: "Managers cannot reset admin passwords." };

  // Generate a readable temp password: word + number + symbol
  const words = ["Blue","Stone","Fire","Nova","Peak","Jade","Bolt","Reef","Dusk","Cove"];
  const word = words[randomBytes(1)[0] % words.length];
  const num  = String(randomBytes(1)[0] % 90 + 10); // 10-99
  const sym  = "!@#$%"[randomBytes(1)[0] % 5];
  const tempPassword = `${word}${num}${sym}`;

  resetUserPassword(targetId, tempPassword);
  return { ok: true, tempPassword };
}

export async function createUserAction(fields) {
  const actor = await getActor();
  if (!actor || !["admin", "manager"].includes(actor.role)) return { error: "Unauthorized." };

  const role = String(fields?.role || "tech");
  if (!ALLOWED_ROLES.includes(role)) return { error: "Invalid role." };
  if (actor.role === "manager" && role === "admin") return { error: "Managers cannot create admin accounts." };
  if (!String(fields?.name || "").trim()) return { error: "Name is required." };
  if (!String(fields?.password || "").trim() || String(fields.password).length < 6) return { error: "Password must be at least 6 characters." };

  try {
    const id = createStaffUser(fields);
    return { ok: true, id };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("USERNAME_TAKEN")) return { error: "That username is already taken." };
    if (msg.includes("EMAIL_TAKEN"))    return { error: "That email is already registered." };
    if (msg.includes("PHONE_TAKEN"))    return { error: "That phone number is already registered." };
    if (msg.includes("UNIQUE"))         return { error: "Username, email, or phone already in use." };
    return { error: "Could not create user." };
  }
}
