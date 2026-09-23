import fs from "node:fs";
import path from "node:path";
import { getSessionUser } from "../../../../lib/session";

// Serves the checked-in static Role & Flow Map (docs/role-flow-map.html) — the hand-maintained
// briefing with per-block reasoning and handoff chains, as a sibling to the live /dev/role-map.
// Admin-only, same as the rest of /dev.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// cwd may be the repo root or dashboard/ (see face-verify/embed); try each plausible base.
function docPath() {
  const rel = ["docs", "role-flow-map.html"];
  for (const b of [process.cwd(), path.join(process.cwd(), "dashboard"), path.join(process.cwd(), "..")]) {
    const p = path.join(b, ...rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const p = docPath();
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p, "utf8"), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
