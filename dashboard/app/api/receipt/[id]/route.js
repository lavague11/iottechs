import { getSessionUser } from "../../../../lib/session";
import { getMedia } from "../../../../lib/db";

// Serve a receipt file — authenticated dashboard users only (admin/manager/sales/tech). The id is a random
// 128-bit token, but we gate anyway so receipts (financial records) aren't world-readable like survey photos.
export const runtime = "nodejs";

export async function GET(_req, ctx) {
  const user = await getSessionUser();
  if (!user?.id || !["admin", "manager", "sales", "tech"].includes(user.role)) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const m = getMedia(id);
  if (!m || m.kind !== "receipt") return new Response("Not found", { status: 404 });
  const bytes = m.bytes instanceof Uint8Array ? m.bytes : Buffer.from(m.bytes || []);
  return new Response(bytes, {
    headers: {
      "Content-Type": m.mime || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
