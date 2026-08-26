import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { getSessionUser } from "../../../lib/session";
import { restoreDatabaseFrom } from "../../../lib/db";

// One-click database RESTORE — the mirror of /api/backup. Upload a snapshot (.db) produced by
// Backup and it becomes the live database: every project, proposal, signature, survey, photo, and
// the secrets vault. This is the receiving end of a host migration (Render → VPS) and disaster
// recovery. The current DB is copied aside first (pre-restore-*.bak) so it's always reversible.
// Admin-only. After a restore you may be signed out (the sessions table came from the snapshot) —
// just log back in with the credentials from the restored data.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user?.id || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("db");
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ ok: false, error: "No database file uploaded." }, { status: 400 });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tmp = path.join(tmpdir(), `iot-restore-${stamp}-${process.pid}.db`);
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(tmp, buf);
    // restoreDatabaseFrom validates it's a real dashboard DB, keeps a safety copy of the current
    // one, then swaps the uploaded file in and reopens on the current schema. It renames tmp → live
    // on success, so tmp no longer exists afterward.
    const safety = restoreDatabaseFrom(tmp);
    return Response.json({ ok: true, safety: path.basename(safety) });
  } catch (e) {
    console.error("restore failed", e);
    try { await unlink(tmp); } catch {}
    return Response.json({ ok: false, error: e?.message || "Restore failed." }, { status: 500 });
  }
}
