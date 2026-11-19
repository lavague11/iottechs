import { getVertical } from "../../../lib/bys-verticals";
import { serveVertical } from "../../../lib/bys-shell";

// /build/<vertical> — adt | audio | toast | pos. The shell is the same file for every vertical; only
// the head differs, and the shell's own loader pulls /widgets/bys/<vertical>-spec.js from the path.
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { vertical } = await params;
  const v = getVertical(vertical);
  // An unknown vertical used to serve the CAMERA builder with a 200 — a soft 404, which invites Google
  // to index unlimited junk URLs under /build/. Say not found instead.
  if (!v || v.path === "build") return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return serveVertical(request, v);
}
