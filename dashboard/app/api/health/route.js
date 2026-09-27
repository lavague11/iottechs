// Lightweight liveness probe for the host's health check — no DB work, always fast.
// Also echoes the deployed git commit so we can verify at a glance WHICH build is actually live:
// GET /api/health → { commit: "<7-char sha>", commitFull, builtAt }. The sha is resolved at build time
// in next.config.js (env var on Render, `git rev-parse` elsewhere); as a last resort the Hostinger
// deploy folder name (…/hbuilds/versions/<hash>/…) is used.
export const dynamic = "force-dynamic";

function commitFromCwd() {
  const m = process.cwd().split("\\").join("/").match(/\/hbuilds\/versions\/([^/]+)/);
  return m ? m[1] : "";
}

export async function GET() {
  const now = new Date();
  const full = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || commitFromCwd() || "dev";
  return Response.json({
    ok: true,
    ts: Date.now(),
    commit: full.slice(0, 7),
    commitFull: full,
    builtAt: process.env.BUILT_AT || null,
    // TZ diagnostic: SQLite datetime('now','localtime') follows the process timezone, so this shows
    // whether the server is actually running in Eastern (times store correctly) or UTC (times +4/5h).
    tz: process.env.TZ || null,
    serverLocal: now.toString(),
    eastern: now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    utc: now.toUTCString(),
  });
}
