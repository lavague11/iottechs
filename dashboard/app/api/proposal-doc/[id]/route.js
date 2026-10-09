import { serveSignDocument } from "../../../../lib/esign/serve";

// Read-gated e-sign PDF (unsigned / signed / certificate). The gate lives in lib/esign/serve.js.
export const runtime = "nodejs";

export async function GET(req, ctx) {
  const params = await ctx.params;
  const cert = new URL(req.url).searchParams.get("cert") === "1";
  const r = await serveSignDocument(params?.id, req.headers.get("cookie"), { certificate: cert });
  return new Response(r.body, { status: r.status, headers: r.headers });
}
