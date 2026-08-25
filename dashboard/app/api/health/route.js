// Lightweight liveness probe for the host's health check — no DB work, always fast.
// Also echoes the deployed git commit (Render sets RENDER_GIT_COMMIT at build time) so we can
// verify at a glance WHICH build is actually live: GET /api/health → { commit: "<sha>" }.
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  return Response.json({
    ok: true,
    ts: Date.now(),
    commit: (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "dev").slice(0, 7),
    // TZ diagnostic: SQLite datetime('now','localtime') follows the process timezone, so this shows
    // whether the server is actually running in Eastern (times store correctly) or UTC (times +4/5h).
    tz: process.env.TZ || null,
    serverLocal: now.toString(),
    eastern: now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    utc: now.toUTCString(),
  });
}
