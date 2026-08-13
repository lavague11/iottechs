import { listFloorplans, getFloorplan, addFloorplan } from "../../../lib/db";

export const runtime = "nodejs";

// GET            → { items:[{id,name,thumb,kind,source_project,created_at}] } for the picker grid
// GET ?id=<n>    → { item:{id,name,image,kind} } full plan image (fetched when a plan is picked)
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const item = getFloorplan(id);
    return item ? Response.json({ item }) : Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ items: listFloorplans() });
}

// POST { image, thumb?, name?, project?, kind? } → save a finished plan to the global library.
// Deduped by content hash, so auto-saving the same background twice is a no-op.
export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return Response.json({ error: "Bad request" }, { status: 400 }); }
  const r = addFloorplan({
    image: b?.image, thumb: b?.thumb,
    name: b?.name ? String(b.name).slice(0, 120) : null,
    project: b?.project ? String(b.project).slice(0, 40) : null,
    kind: b?.kind === "floorplan" || b?.kind === "drawing" ? b.kind : "aerial",
  });
  if (!r.ok) return Response.json({ error: r.error || "Invalid" }, { status: 400 });
  return Response.json({ ok: true, id: r.id, dup: !!r.dup });
}
