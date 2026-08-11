// Download the face models locally so the face engine loads them from /models
// instead of a CDN — faster first scan and no third-party dependency at runtime.
//
//   node scripts/fetch-face-models.mjs      (run from the dashboard/ dir)
//
// Writes to public/models/ (gitignored). For production self-hosting, either
// commit the folder or add this command to the build step; otherwise the engine
// simply falls back to the CDN, so this is a pure optimization.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd().endsWith("dashboard") ? process.cwd() : path.join(process.cwd(), "dashboard");
const OUT_FA = path.join(ROOT, "public", "models", "faceapi");
const OUT_MODELS = path.join(ROOT, "public", "models");
const FA_VER = "1.7.13";
const NEED = ["ssd_mobilenetv1", "tiny_face_detector", "face_landmark_68", "face_recognition"]; // every net the engine loads (missing one forces a full CDN fallback)

async function dl(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`  ${path.relative(ROOT, dest)}  (${(buf.length / 1048576).toFixed(2)} MB)`);
}

console.log("Fetching face-api models…");
const listing = await (await fetch(`https://data.jsdelivr.com/v1/packages/npm/@vladmandic/face-api@${FA_VER}?structure=flat`)).json();
const files = (listing.files || []).map((f) => f.name).filter((n) => n.startsWith("/model/") && /\.(json|bin)$/.test(n));
for (const n of files) {
  if (!NEED.some((k) => n.includes(k))) continue;
  await dl(`https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FA_VER}${n}`, path.join(OUT_FA, path.basename(n)));
}

console.log("Fetching ArcFace weights…");
await dl("https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/w600k_mbf.onnx", path.join(OUT_MODELS, "w600k_mbf.onnx"));

console.log("Done. Restart the dev server — the engine now loads /models first.");
