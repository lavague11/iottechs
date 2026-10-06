// Site Intelligence (Phase 7) — shared, mostly-pure helpers used by app/api/site-intel/route.js
// and unit tests. Everything here is deterministic and NETWORK-FREE so it can be tested without a
// key or an OpenAI call. The route owns the one OpenAI request; this file owns the contract:
// the prompt, the source hash, the reuse decision, and (critically) the VALIDATOR that is the only
// trusted path for raw model output.

import { createHash } from "node:crypto";
import { secretValue } from "./db.js";
import { DEFAULT_SITE_INTEL, PROMPT_KEYS } from "./survey-prompts.js";

// The ONLY exterior zone types we accept. Anything else from the model is dropped.
export const SITE_INTEL_ZONE_TYPES = Object.freeze([
  "street", "sidewalk", "curb", "driveway", "parking",
  "front_yard", "rear_yard", "side_yard", "alley", "loading",
  "entrance", "pedestrian_approach", "vehicle_approach",
]);
const ZONE_SET = new Set(SITE_INTEL_ZONE_TYPES);

// The active prompt: an admin's vault override wins, else the baked-in default. (Resolved
// server-side only — a client never supplies the prompt.)
export function siteIntelPrompt() {
  return secretValue(PROMPT_KEYS.SITE_INTEL) || DEFAULT_SITE_INTEL;
}

// Clamp any value to a finite number in [0,1]; non-finite → null.
export function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Normalize one vertex ([x,y] or {x,y}) to a clamped [x,y] fraction pair, or null if unusable.
function normVertex(pt) {
  let x, y;
  if (Array.isArray(pt)) { x = pt[0]; y = pt[1]; }
  else if (pt && typeof pt === "object") { x = pt.x; y = pt.y; }
  else return null;
  const cx = clamp01(x), cy = clamp01(y);
  if (cx == null || cy == null) return null;
  return [cx, cy];
}

// Normalize a polygon to clamped fraction vertices; returns null unless >=3 valid points remain.
export function normPolygon(poly) {
  if (!Array.isArray(poly)) return null;
  const out = [];
  for (const pt of poly) { const v = normVertex(pt); if (v) out.push(v); }
  return out.length >= 3 ? out : null;
}

function cleanLabel(s) {
  if (typeof s !== "string") return null;
  const t = s.replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  return t || null;
}

// THE VALIDATOR — the single trusted gate between raw model JSON and anything we store or return.
// Never trust raw output past this: every vertex is clamped to [0,1], every polygon must have >=3
// points, zone types must be in the allow-list, confidence is clamped to [0,1]. Invalid pieces are
// dropped (not guessed). Always returns the canonical shape, even for garbage input.
export function validateSiteIntel(raw, opts = {}) {
  const r = raw && typeof raw === "object" ? raw : {};

  // Site boundary — approximate working outline only (never surveyed/legal/parcel).
  let siteBoundary = null;
  const sb = r.siteBoundary || r.boundary;
  if (sb && typeof sb === "object") {
    const polygon = normPolygon(sb.polygon);
    if (polygon) siteBoundary = { polygon, confidence: clamp01(sb.confidence) ?? 0 };
  }

  // Orientation — short side labels + confidence, each field optional.
  let orientation = null;
  const o = r.orientation;
  if (o && typeof o === "object") {
    const front = cleanLabel(o.front), rear = cleanLabel(o.rear),
      left = cleanLabel(o.left), right = cleanLabel(o.right);
    const conf = clamp01(o.confidence);
    if (front || rear || left || right || conf != null) {
      orientation = { front, rear, left, right, confidence: conf ?? 0 };
    }
  }

  // Zones — allow-listed type, valid polygon, clamped confidence.
  const zones = [];
  if (Array.isArray(r.zones)) {
    for (const z of r.zones) {
      if (!z || typeof z !== "object") continue;
      const type = typeof z.type === "string" ? z.type.trim().toLowerCase() : "";
      if (!ZONE_SET.has(type)) continue;
      const polygon = normPolygon(z.polygon);
      if (!polygon) continue;
      zones.push({ type, polygon, confidence: clamp01(z.confidence) ?? 0 });
    }
  }

  return {
    runId: opts.runId != null ? String(opts.runId) : (r.runId != null ? String(r.runId) : null),
    sourceRevision: opts.sourceRevision != null ? opts.sourceRevision
      : (r.sourceRevision != null ? r.sourceRevision : null),
    siteBoundary,
    orientation,
    zones,
  };
}

// Deterministic content hash of everything that would change the analysis. Identical inputs →
// identical hash → the stored run is reused instead of re-billing OpenAI. The image dominates, so
// we hash it with the structured context around it.
export function siteIntelSourceHash(input = {}) {
  const h = createHash("sha256");
  const img = String(input.image || "");
  h.update("site-intel\u0000");
  h.update(img);
  h.update("\u0000");
  // Context that changes the meaning of the analysis — stable-stringified so key order can't flap.
  h.update(stable(input.grid)); h.update("\u0000");
  h.update(stable(input.transform)); h.update("\u0000");
  h.update(stable(input.north)); h.update("\u0000");
  h.update(stable(input.structure)); h.update("\u0000");
  h.update(stable(input.metadata)); h.update("\u0000");
  h.update(stable(input.zones));
  return h.digest("hex");
}

function stable(v) {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}

// Reuse decision (pure, unit-testable): reuse a prior run ONLY when the caller did not force a
// re-analysis AND a completed run exists for this exact source hash. A missing run, an errored run,
// an outdated run, or analyzeAgain=true all mean "call the model".
export function shouldReuseRun(existing, analyzeAgain) {
  if (analyzeAgain) return false;
  return !!(existing && existing.status === "done");
}
