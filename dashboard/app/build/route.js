import { DEFAULT_VERTICAL } from "../../lib/bys-verticals";
import { serveVertical } from "../../lib/bys-shell";

// /build — the camera builder (the BYS default vertical).
//
// This used to be a rewrite in next.config.js straight to the static shell. It is a route now so that
// /build and every /build/<vertical> can carry their OWN title, description and self-referential
// canonical; see lib/bys-verticals.js for why that mattered. The rewrite was removed in the same
// change: afterFiles rewrites are matched BEFORE dynamic routes, so leaving it in place would have
// stopped app/build/[vertical] from ever being reached.
export const dynamic = "force-dynamic";

export async function GET(request) {
  return serveVertical(request, DEFAULT_VERTICAL);
}
