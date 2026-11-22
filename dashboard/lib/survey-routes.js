// Site Survey — WIRING ROUTES. The one model for cable runs drawn over a finished floor, shared by
// the planner widget (public/widgets/site-survey-merged.html), the customer's survey view, the
// proposal/survey PDF and the work order. Pure: no DOM, no canvas, importable under bare Node.
//
// Shape, deliberately the same family as site zones (floor.zones = [{id,label,type,pts}]), because a
// run is a polyline where a zone is a polygon and the validate/cap/id machinery is identical:
//
//   floor.routes = [Run]
//     Run: { id, dev, cable, run, pts }
//       id    — "r3", unique within the floor
//       dev   — the cid of the device this run starts at ("" for a head-end-to-head-end link)
//       cable — a CABLE key: cat6 | speaker | hdmi | power
//       run   — "home" (default) | "daisy"
//       pts   — [[x,y], …] PERCENT of the floor's background image, ≥2 points
//   floor.head = { x, y } | null    — the head-end (rack / NVR) every home run terminates at, percent
//
// `pts` is percent for exactly the reason devices are (survey2-model.js): rotation is baked into the
// image and zoom/pan are view-only, so any renderer projects x/100 × imageWidth, y/100 × imageHeight
// and the run lands on the same spot the planner drew it.

// Bright, near-neon so a run reads on a white floor plan AND on a dark aerial photo. Each is drawn
// with a thin dark outline underneath (OUTLINE) rather than a lighter tint, which is what keeps it
// legible on both grounds instead of only one.
export const CABLES = [
  { key: "cat6", name: "Cat6", color: "#12E0C0" },
  { key: "speaker", name: "Speaker wire", color: "#FF8A1F" },
  { key: "hdmi", name: "HDMI", color: "#B14BFF" },
  { key: "power", name: "Power", color: "#FF2E4D" },
];
// A segment carrying more than one cable type is drawn once, in this neutral dark, with a count
// badge — a mixed bundle has no single true colour and picking one of its members would lie.
export const BUNDLE_COLOR = "#39414A";
export const OUTLINE = "#0E1216";
export const CABLE_KEYS = CABLES.map((c) => c.key);
const CABLE_BY_KEY = Object.fromEntries(CABLES.map((c) => [c.key, c]));
export const cableOf = (k) => CABLE_BY_KEY[k] || CABLES[0];
export const cableName = (k) => cableOf(k).name;
export const cableColor = (k) => cableOf(k).color;

export const RUN_TYPES = ["home", "daisy"];
// Caps. A floor past these is a drawing mistake or a corrupt blob, not a real site; the validator
// truncates rather than throwing so one bad row never costs the user the rest of the survey.
export const ROUTE_MAX = 200;
export const ROUTE_PTS_MAX = 60;

const num = (v) => (Number.isFinite(+v) ? +v : null);

// A point is [x, y] in percent, clamped to the image. Accepts {x,y} too — the widget's editor works
// in objects and the blob stores pairs, exactly as zones do.
export function validPts(pts) {
  if (!Array.isArray(pts)) return null;
  const out = [];
  for (let i = 0; i < pts.length && out.length < ROUTE_PTS_MAX; i++) {
    const p = pts[i];
    const x = num(Array.isArray(p) ? p[0] : p?.x);
    const y = num(Array.isArray(p) ? p[1] : p?.y);
    if (x == null || y == null) return null;
    out.push([Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))]);
  }
  return out.length >= 2 ? out : null;
}

// Validate a stored list on restore: junk dropped, cable + run allow-listed, ids forced unique and
// stringy, capped. Mirrors zValidZones in the widget — same contract, same tolerance.
export function validRoutes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length && out.length < ROUTE_MAX; i++) {
    const r = list[i];
    if (!r || typeof r !== "object") continue;
    const pts = validPts(r.pts);
    if (!pts) continue;
    let id = typeof r.id === "string" && r.id ? r.id : `r${out.length + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    out.push({
      id,
      dev: typeof r.dev === "string" ? r.dev : "",
      cable: CABLE_KEYS.includes(r.cable) ? r.cable : "cat6",
      run: RUN_TYPES.includes(r.run) ? r.run : "home",
      pts,
    });
  }
  return out;
}

// The head-end marker, or null. Same percent space as devices and route points.
export function validHead(h) {
  if (!h || typeof h !== "object") return null;
  const x = num(h.x), y = num(h.y);
  if (x == null || y == null) return null;
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
}

// Runs per cable type across every floor, for the run summary. Counts runs, never footage — the
// survey has no reliable scale on an unscaled floor, and a manufactured length on a work order is
// worse than no length at all.
export function routeCounts(floors) {
  const out = {};
  (Array.isArray(floors) ? floors : []).forEach((f) => {
    validRoutes(f?.routes).forEach((r) => { out[r.cable] = (out[r.cable] || 0) + 1; });
  });
  return out;
}
export function routeTotal(floors) {
  return Object.values(routeCounts(floors)).reduce((n, v) => n + v, 0);
}

// "Cat6: 8 runs · Speaker wire: 6 runs · HDMI: 1 run · Power: 2 runs" — declared cable order, and a
// type with no runs is left out rather than printed as a zero.
export function runSummary(floors) {
  const counts = routeCounts(floors);
  return CABLES.filter((c) => counts[c.key] > 0)
    .map((c) => `${c.name}: ${counts[c.key]} ${counts[c.key] === 1 ? "run" : "runs"}`)
    .join(" · ");
}

// Devices with no run on them, by cid — §Editing rules 6 (red outline on the plan, and a warning
// listing them at Approval). A WARNING: it never blocks a submit. Annotation kinds (Important /
// Outlet / Hazard) are notes on the plan, not equipment, so they are never counted as unwired.
export function unwiredDevices(floor, { skipKinds = new Set(["important", "outlet", "hazard"]) } = {}) {
  const routes = validRoutes(floor?.routes);
  const wired = new Set(routes.map((r) => r.dev).filter(Boolean));
  return (Array.isArray(floor?.devices) ? floor.devices : [])
    .filter((d) => d && d.k && !skipKinds.has(d.k))
    .filter((d) => !wired.has(d.cid || d.id))
    .map((d) => d.cid || d.id || "")
    .filter(Boolean);
}
