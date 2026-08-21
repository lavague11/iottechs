import { listFloorplans, getFloorplan, addFloorplan, deleteFloorplan } from "../../../lib/db";

export const runtime = "nodejs";

// GET                    → { items:[…] } every saved plan (admin library views)
// GET ?project=<id>      → { items:[…] } ONLY that project's own saved plans (the survey picker)
// GET ?id=<n>            → { item:{id,name,image,kind} } full plan image (fetched when a plan is picked)
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (id) {
    const item = getFloorplan(id);
    return item ? Response.json({ item }) : Response.json({ error: "Not found" }, { status: 404 });
  }
  const project = sp.get("project");
  return Response.json({ items: listFloorplans(60, project ? String(project).slice(0, 40) : null) });
}

// DELETE ?id=<n>&project=<id> → remove a saved plan. Scoped to the project so a survey can only delete
// plans it owns (source_project match).
export async function DELETE(req) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const project = sp.get("project");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const r = deleteFloorplan(id, project ? String(project).slice(0, 40) : null);
  if (!r.removed) return Response.json({ error: "Not found or not yours" }, { status: 404 });
  return Response.json({ ok: true, removed: r.removed });
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
