import { cookies } from "next/headers";
import { parseToken, parseAccessToken } from "../../../lib/auth";
import { getBugDraft, saveBugDraft, deleteBugDraft } from "../../../lib/db";

// One autosaved bug-report draft per signed-in owner. The reporter PUTs it (debounced) as the user
// types / captures, GETs it to restore on open, and DELETEs it once the report is submitted. Drafts
// hold description + uploaded screenshot URLs + vector annotations — no raw image data. Anonymous
// visitors get a no-op (their report still works; it just isn't autosaved server-side).
async function owner() {
  const jar = await cookies();
  const raw = jar.get("iot_session")?.value;
  if (raw) { const t = await parseToken(raw); if (t?.id) return `u:${t.id}`; if (t?.email) return `e:${t.email}`; }
  const acc = jar.get("iot_access")?.value;
  if (acc) { const a = await parseAccessToken(acc); if (a?.sub) return `a:${a.sub}`; if (a?.accessId) return `a:${a.accessId}`; }
  return null;
}

export async function GET() {
  const o = await owner();
  if (!o) return Response.json({ ok: true, draft: null });
  const d = getBugDraft(o);
  if (!d) return Response.json({ ok: true, draft: null });
  let shots = [];
  try { const a = JSON.parse(d.shots || "[]"); if (Array.isArray(a)) shots = a; } catch { /* ignore */ }
  return Response.json({ ok: true, draft: { description: d.description || "", shots, updated_at: d.updated_at } });
}

export async function PUT(req) {
  const o = await owner();
  if (!o) return Response.json({ ok: true });      // anonymous → no server draft, not an error
  let b = {}; try { b = await req.json(); } catch { /* empty */ }
  const shots = Array.isArray(b.shots)
    ? b.shots.filter((s) => s && typeof s.url === "string").slice(0, 10)
      .map((s) => ({ url: String(s.url).slice(0, 500), cleanUrl: s.cleanUrl ? String(s.cleanUrl).slice(0, 500) : null, shapes: Array.isArray(s.shapes) ? s.shapes.slice(0, 200) : [] }))
    : [];
  saveBugDraft(o, { description: b.description, shots });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const o = await owner();
  if (o) deleteBugDraft(o);
  return Response.json({ ok: true });
}
