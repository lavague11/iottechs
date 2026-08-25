import { createReadStream, statSync, unlink } from "fs";
import { tmpdir } from "os";
import path from "path";
import { getSessionUser } from "../../../lib/session";
import { backupDatabaseTo } from "../../../lib/db";

// One-click database backup — streams a clean, consistent copy of the ENTIRE SQLite database
// (every project, proposal, signature, survey, and photo blob) as a single .db download. This is
// the migration snapshot: drop the file onto any server and the app comes up as an exact clone.
// Admin-only; the DB holds everything, including the secrets vault.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tmp = path.join(tmpdir(), `iot-backup-${stamp}-${process.pid}.db`);
  try {
    backupDatabaseTo(tmp);   // VACUUM INTO — atomic, safe while the app is live
  } catch (e) {
    console.error("backup failed", e);
    return Response.json({ error: "Backup failed — try again." }, { status: 500 });
  }

  let size = 0;
  try { size = statSync(tmp).size; } catch {}
  const nodeStream = createReadStream(tmp);
  const cleanup = () => unlink(tmp, () => {});
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (c) => controller.enqueue(c));
      nodeStream.on("end", () => { controller.close(); cleanup(); });
      nodeStream.on("error", (err) => { controller.error(err); cleanup(); });
    },
    cancel() { nodeStream.destroy(); cleanup(); },
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="iot-techs-backup-${stamp}.db"`,
      ...(size ? { "Content-Length": String(size) } : {}),
      "Cache-Control": "no-store",
    },
  });
}
