import { getSessionUser } from "../../../lib/session";
import { getUnauthorizedImage } from "../../../lib/db";

// Serves a single decrypted unauthorized-capture photo for the admin review gallery.
// Admin/manager only — these are captured faces. Decryption happens here, on demand;
// the encrypted blob never leaves the DB otherwise, and the response is never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id")) || 0;
  if (!id) return new Response("Bad request", { status: 400 });

  const dataUrl = getUnauthorizedImage(id);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) return new Response("Not found", { status: 404 });

  const buf = Buffer.from(m[2], "base64");
  return new Response(buf, {
    status: 200,
    headers: { "Content-Type": m[1] || "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
