import { cookies, headers } from "next/headers";
import { verifyUserByCredential, recordLogin } from "../../../lib/db";
import { makeToken } from "../../../lib/auth";

export async function POST(request) {
  try {
    const { identifier, password, remember } = await request.json();
    const user = verifyUserByCredential(identifier, password);
    if (user?.disabled) return Response.json({ ok: false, error: "This account has been disabled. Contact an administrator." }, { status: 403 });
    if (!user) return Response.json({ ok: false, error: "Invalid credentials." }, { status: 401 });

    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "127.0.0.1";
    const ua = hdrs.get("user-agent") || null;
    recordLogin(user.id, ip, ua);

    const token = await makeToken(user);
    const jar = await cookies();
    jar.set("iot_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: remember ? 60 * 60 * 24 * 7 : 60 * 60 * 8 });
    jar.delete("iot_access"); // a fresh login supersedes any lingering project-PIN grant

    const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };
    return Response.json({ ok: true, user: { name: user.name, role: user.role, home: ROLE_HOME[user.role] || "/dashboard" } });
  } catch {
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
