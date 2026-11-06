import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAddendumToken, makeAccessToken, accessTtlFor } from "../../../lib/auth";
import { getJobByAccessId } from "../../../lib/db";

// Addendum approval MAGIC LINK (no PIN). The customer-approval email's "Approve" button points here with
// ?t=<signed token>. We verify the token (project + addendum + expiry), then grant exactly the same
// short-lived customer access the PIN gate would (iot_access cookie) and land them on the add-on with the
// approve panel open. They still tap Approve & Sign — the token only replaces the PIN, not the signature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  const grant = await verifyAddendumToken(token);
  if (!grant || !getJobByAccessId(grant.accessId)) {
    return NextResponse.redirect(`${url.origin}/?addendum=link-expired`);
  }
  const jar = await cookies();
  jar.set("iot_access", await makeAccessToken(grant.accessId, "customer"), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.ceil(accessTtlFor("customer") / 1000),
  });
  return NextResponse.redirect(`${url.origin}/project/${grant.accessId}?open=addendum&approve=${encodeURIComponent(grant.addendumId)}`);
}
