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
  return NextResponse.redirect(new URL("/", request.url));
}
