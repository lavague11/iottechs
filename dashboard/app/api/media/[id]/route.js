import { getMedia } from "../../../../lib/db";

// Serves a stored (already JPEG) photo by its random id. The id is 128-bit and unguessable, so
// this is public-by-link like the other image routes; voided media 404s. Long, immutable cache
// since bytes never change for a given id.
export const runtime = "nodejs";

export async function GET(_req, ctx) {
  const params = await ctx.params;
  const id = params?.id;
  if (!id) return new Response("Not found", { status: 404 });

  const m = getMedia(id);
  if (!m || m.voided) return new Response("Not found", { status: 404 });

  const bytes = m.bytes instanceof Uint8Array ? m.bytes : Buffer.from(m.bytes || []);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": m.mime || "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
