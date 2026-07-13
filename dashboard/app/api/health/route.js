// Lightweight liveness probe for the host's health check — no DB work, always fast.
// Also echoes the deployed git commit (Render sets RENDER_GIT_COMMIT at build time) so we can
// verify at a glance WHICH build is actually live: GET /api/health → { commit: "<sha>" }.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    ts: Date.now(),
    commit: (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "dev").slice(0, 7),
  });
}
