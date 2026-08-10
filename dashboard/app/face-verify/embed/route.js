import fs from "node:fs";
import path from "node:path";
import { getSessionUser } from "../../../lib/session";

// Serves the self-contained Face Verify tool (tool.html) — the client-side 1:1
// face matcher that runs entirely in the browser. Staff-only: it drives the
// camera and loads a licence portrait, so it must never be reachable by a
// customer or the public. The /face-verify page embeds this in an iframe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The dev server may run with cwd = repo root or cwd = dashboard/; the built
// output can differ again. Resolve the file against every plausible base and
// use the first that exists so this survives both local and Render.
function toolPath() {
  const rel = ["app", "face-verify", "tool.html"];
  const bases = [
    process.cwd(),
    path.join(process.cwd(), "dashboard"),
    path.join(process.cwd(), ".."),
  ];
  for (const b of bases) {
    const p = path.join(b, ...rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Forbidden", { status: 403 });

  const p = toolPath();
  if (!p) return new Response("Face Verify tool not found.", { status: 404 });

  const html = fs.readFileSync(p, "utf8");
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Never cache — the tool ships model URLs and is staff-gated.
      "Cache-Control": "no-store",
    },
  });
}
