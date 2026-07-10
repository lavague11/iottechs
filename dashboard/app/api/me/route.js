import { cookies } from "next/headers";
import { parseToken } from "../../../lib/auth";
import { getUserById } from "../../../lib/db";

export async function GET() {
  const jar   = await cookies();
  const token = jar.get("iot_session")?.value;
  const parsed = token ? await parseToken(token) : null;
  if (!parsed) return Response.json({ user: null });

  const dbUser = getUserById(parsed.id);
  if (!dbUser) return Response.json({ user: null });

  const ROLE_HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech", customer: "/my-projects" };
  return Response.json({
    user: {
      id:    dbUser.id,
      name:  dbUser.name,
      role:  dbUser.role,
      email: dbUser.email,
      home:  ROLE_HOME[dbUser.role] || "/dashboard",
    }
  });
}
