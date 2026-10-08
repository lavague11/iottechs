import { serveSignDocument } from "../../../../lib/esign/serve";

// Read-gated e-sign PDF (unsigned / signed / certificate). The gate lives in lib/esign/serve.js.
export const runtime = "nodejs";

export async function GET(req, ctx) {
  const params = await ctx.params;
  const r = await serveSignDocument(params?.id, req.headers.get("cookie"));
  return new Response(r.body, { status: r.status, headers: r.headers });
}
