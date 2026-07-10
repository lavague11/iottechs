"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyUserByCredential, recordLogin, recordLogout } from "../../lib/db";
import { makeToken, parseToken } from "../../lib/auth";

async function getRequestMeta() {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "127.0.0.1";
  const ua = hdrs.get("user-agent") || null;
  return { ip, ua };
}

export async function loginAction(formData) {
  const identifier = formData.get("identifier") || formData.get("email");
  const password   = formData.get("password");
  const next       = formData.get("next") || "";

  const user = verifyUserByCredential(identifier, password);
  if (user?.disabled) return { error: "This account has been disabled. Contact an administrator." };
  if (!user) return { error: "Invalid username, email, or password." };

  const { ip, ua } = await getRequestMeta();
  recordLogin(user.id, ip, ua);

  const token = await makeToken(user);
  const jar = await cookies();
  jar.set("iot_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };
  const dest = next && next !== "/" ? next : (ROLE_HOME[user.role] || "/dashboard");
  redirect(dest);
}

export async function logoutAction() {
  const jar    = await cookies();
  const token  = jar.get("iot_session")?.value;
  const parsed = token ? await parseToken(token) : null;
  if (parsed?.id) recordLogout(Number(parsed.id));
  jar.delete("iot_session");
  redirect("/");
}
