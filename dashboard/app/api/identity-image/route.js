import { getSessionUser } from "../../../lib/session";
import { getIdentityImage } from "../../../lib/db";

// Serves a single decrypted identity photo (ID or face) for the admin libraries.
// Admin/manager only — these are government IDs and biometrics. Decryption happens
// here, on demand; the encrypted blob never leaves the DB otherwise.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const userId = Number(searchParams.get("user")) || 0;
  const which = searchParams.get("which") === "id" ? "id" : "face";
  if (!userId) return new Response("Bad request", { status: 400 });

  const dataUrl = getIdentityImage(userId, which);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) return new Response("Not found", { status: 404 });

  const buf = Buffer.from(m[2], "base64");
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": m[1] || "image/jpeg",
      "Cache-Control": "private, no-store",   // never cache a biometric
    },
  });
}
