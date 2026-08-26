import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseToken } from "../../../lib/auth";
import { recordLogout } from "../../../lib/db";

export async function GET(request) {
  const jar    = await cookies();
  const token  = jar.get("iot_session")?.value;
  const parsed = token ? await parseToken(token) : null;
  if (parsed?.id) recordLogout(Number(parsed.id));
  jar.delete("iot_session");
  jar.delete("iot_access"); // also drop any project-PIN grant — logout means logged out everywhere
  // Relative redirect on purpose: in a Node route handler request.url is the server's INTERNAL
  // socket address (e.g. http://localhost:10000 on Render / the VPS behind nginx), so building an
  // absolute URL from it sends the browser to a dead localhost port. A relative Location resolves
  // against the public origin the browser is actually on — correct on Render, the VPS, and locally.
  return new NextResponse(null, { status: 302, headers: { Location: "/", "Cache-Control": "no-store" } });
}
