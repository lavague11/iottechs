import { readFileSync, existsSync } from "node:fs";
import { getSessionUser } from "../../../../lib/session";
import { checkpointDb, dbFilePath } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const MIGRATION_SECRET = String(process.env.MIGRATION_SECRET || "").trim();

// Download the entire SQLite database. Authorized by a logged-in admin (the source instance, where
// the admin is signed in) OR the one-time MIGRATION_SECRET (a fresh instance with no session yet).
async function authorized(request) {
  try { const u = await getSessionUser(); if (u && u.role === "admin") return true; } catch {}
  if (MIGRATION_SECRET) {
    const url = new URL(request.url);
    const s = request.headers.get("x-migrate-secret") || url.searchParams.get("secret") || "";
    if (s && s === MIGRATION_SECRET) return true;
  }
  return false;
}

export async function GET(request) {
  if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
  const file = dbFilePath();
  if (!existsSync(file)) return new Response("No database file found.", { status: 404 });
  try { checkpointDb(); } catch {}   // fold the WAL in so the copy is complete
  const buf = readFileSync(file);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="dashboard-${stamp}.db"`,
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}
