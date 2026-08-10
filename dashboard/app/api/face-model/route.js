// Same-origin proxy for the ArcFace weights (w600k_mbf.onnx). GitHub release
// downloads send no CORS header, so a browser fetch() is blocked and the face
// engine silently falls back to the weaker face-api descriptor. Fetching it
// server-side (no CORS) and serving it from our own origin fixes that — the
// engine gets true ArcFace embeddings in dev and prod, with no binaries in git.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = [
  "https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/w600k_mbf.onnx",
];

let cache = null;      // Buffer, held per server instance after first fetch
let inflight = null;

async function load() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    for (const url of SOURCES) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) continue;
        cache = Buffer.from(await r.arrayBuffer());
        return cache;
      } catch (e) {}
    }
    return null;
  })();
  const out = await inflight;
  inflight = null;
  return out;
}

export async function GET() {
  const buf = await load();
  if (!buf) return new Response("Model unavailable", { status: 502 });
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
