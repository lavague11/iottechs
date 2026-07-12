// Lightweight liveness probe for the host's health check — no DB work, always fast.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, ts: Date.now() });
}
