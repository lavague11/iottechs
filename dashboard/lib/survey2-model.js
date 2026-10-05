// Site Survey (planner) — the ONE device model every rendering reads: the planner widget places
// devices, the customer's "Your System Layout" and the proposal PDF's SITE SURVEY pages draw them
// from the same floors. Pure: no DOM, no canvas. The widget (public/widgets/site-survey-merged.html)
// keeps its own copy of GROUPS for the iframe; tests assert the two never drift.
//
// Canonical floor shape (what the widget saves): { name, bg, bgSource, devices: [Device], started }
//   Device: { id, k, x, y, aim, aimed, cone, fov, range, tag, name, color, cid, photo }
//   x / y are PERCENT of the floor's background image (rotation is baked into the image; zoom and
//   pan are view-only), so any renderer projects them as x/100 × imageWidth, y/100 × imageHeight.

// `range` on a coverage kind is its DEFAULT reach in FEET (cone throw, or speaker radius) — real-world
// scale when the floor is scaled from a trace, else a sensible px fraction fallback (see surveyScene).
export const SURVEY_GROUPS = [
  { key: "cctv",  name: "Cameras",   letter: "C", color: "#b98a2e", items: [
    { k: "cam", name: "Camera", cone: true, fov: 30, range: 40 }, { k: "nvr", name: "NVR" }, { k: "isp", name: "ISP" }, { k: "poe", name: "PoE Switch" }, { k: "disp", name: "Display" }] },
  { key: "sound", name: "Sound",     letter: "S", color: "#B084E0", items: [
    { k: "amp", name: "Amp" }, { k: "spk", name: "Speaker", ring: true, range: 18 }, { k: "aux", name: "Audio Input" }] },
  { key: "toast", name: "Toast POS", letter: "T", color: "#E8743B", items: [
    { k: "pronto", name: "Pronto / Meraki" }, { k: "tap", name: "Access Point" }, { k: "pos", name: "POS Terminal" }, { k: "kprint", name: "Kitchen Printer" }, { k: "kds", name: "Kitchen Display" }, { k: "ssk", name: "Self-Service Kiosk" }, { k: "tpoe", name: "24-Port Switch" }, { k: "tisp", name: "ISP Router" }] },
  { key: "alarm", name: "Alarms",    letter: "A", color: "#5FB8DB", items: [
    { k: "door", name: "Door / Window" }, { k: "motion", name: "Motion", cone: true, fov: 110, range: 30 }, { k: "glass", name: "Glassbreak", cone: true, fov: 360, range: 20 }, { k: "keypad", name: "Keypad" }, { k: "fire", name: "Fire / CO" }, { k: "aisp", name: "ISP" }] },
  { key: "misc",  name: "Misc",      letter: "M", color: "#E8C547", items: [
    { k: "important", name: "Important" }, { k: "outlet", name: "Outlet" }, { k: "hazard", name: "Hazard" }] },
];
const FLAT = {};
SURVEY_GROUPS.forEach((g) => g.items.forEach((it) => { FLAT[it.k] = { ...it, group: g }; }));
export const kindOf = (k) => FLAT[k] || { k, name: String(k || "Device"), group: SURVEY_GROUPS[4] };
// Annotation kinds are notes on the plan, not equipment — they get a marker but no schedule row.
export const ANNOTATION_KINDS = new Set(["important", "outlet", "hazard"]);

const cap = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

// Parse a saved survey blob → floors with a usable background. Never throws.
export function parseSurveyFloors(raw) {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (d?.floors || []).filter((f) => f && typeof f.bg === "string" && f.bg.length > 0)
      .map((f) => ({ name: f.name || "Floor", bg: f.bg,
        scale: (f.scale && +f.scale.ftW > 0 && +f.scale.ftH > 0) ? { ftW: +f.scale.ftW, ftH: +f.scale.ftH } : null,   // real-world size of the plan image (feet), for coverage scaling
        devices: Array.isArray(f.devices) ? f.devices.filter((x) => x && x.k) : [] }));
  } catch { return []; }
}

// One record per device, in planner order, with a short code (group letter + running number across
// floors — the widget's own "I<letter><n>" tag when present) and the display label (name, else tag).
export function surveyDevices(floors) {
  const perGroup = {};
  const out = [];
  floors.forEach((f, fi) => (f.devices || []).forEach((d) => {
    const it = kindOf(d.k);
    const g = it.group;
    perGroup[g.key] = (perGroup[g.key] || 0) + 1;
    const code = String(d.tag || "").replace(/^I/, "") || `${g.letter}${perGroup[g.key]}`;
    out.push({
      id: d.id, floor: fi, floorName: f.name, k: d.k, kindName: it.name, group: g.key, color: d.color || g.color,
      code, label: cap((d.name && String(d.name).trim()) || d.tag || `${it.name} ${perGroup[g.key]}`),
      x: Math.max(0, Math.min(100, num(d.x))), y: Math.max(0, Math.min(100, num(d.y))),
      cone: !!(it.cone || d.cone), aimed: !!d.aimed || num(d.aim) !== 0, aim: num(d.aim), fov: num(d.fov, it.fov || 30),
      // Speakers cover a circle (a radius), not an aimed wedge — range is a percent of the floor's short side.
      ring: !!(it.ring || d.ring), range: num(d.range, it.range || 18),
      annotation: ANNOTATION_KINDS.has(d.k),
    });
  }));
  return out;
}

// Everything a renderer needs to paint one floor at a given pixel size: background rect, one marker
// per device (pixel centre, radius, colour, code, label) and a coverage cone for cone kinds that
// were aimed. Layer order = background → cones → markers → labels. Pure geometry; no DOM/canvas.
// The speaker coverage fill/stroke — a very light blue kept ~30% opaque so the plan shows through.
export const SPK_COVERAGE = { fill: "rgba(96,165,250,0.28)", stroke: "rgba(96,165,250,0.55)" };
// `pxPerFt` (> 0) scales coverage to real feet: a device's reach (d.range, in feet) renders as
// range × pxPerFt. Callers derive it from the floor's real width: pxPerFt = renderWidthPx ÷ floorFeetW.
// Without it (unscaled / hand-drawn / uploaded floors) coverage falls back to a fixed fraction of the plan.
export function surveyScene(floors, floorIndex, W, H, { dense = 16, coneLen = null, pxPerFt = 0 } = {}) {
  const all = surveyDevices(floors).filter((d) => d.floor === floorIndex);
  const r = Math.max(9, Math.round(Math.min(W, H) * 0.018));
  const minWH = Math.min(W, H);
  const scaled = pxPerFt > 0;
  const fallbackCone = coneLen || Math.round(minWH * 0.14);
  const fallbackRing = Math.round(minWH * 0.12);
  const reachPx = (d, fb) => scaled ? Math.max(8, Math.round((+d.range || 0) * pxPerFt)) : fb;
  const showNames = all.length <= dense;    // past `dense` markers the labels would collide: codes on the plan, names in the list
  const markers = all.map((d) => ({ ...d, px: d.x / 100 * W, py: d.y / 100 * H, r }));
  const cones = markers.filter((d) => d.cone && d.aimed).map((d) => ({ px: d.px, py: d.py, aim: d.aim, fov: Math.min(360, Math.max(5, d.fov)), R: reachPx(d, fallbackCone), color: d.color }));
  // Speaker coverage: a light-blue radius circle (see-through) drawn under the marker, like a cone but round.
  const rings = markers.filter((d) => d.ring).map((d) => ({ px: d.px, py: d.py, R: reachPx(d, fallbackRing), fill: SPK_COVERAGE.fill, stroke: SPK_COVERAGE.stroke }));
  return { W, H, r, markers, cones, rings, showNames, count: all.length, scaled };
}

// Counts by kind for validation (canonical vs rendered) and the device schedule.
export function surveyCounts(floors) {
  const out = {};
  surveyDevices(floors).forEach((d) => { if (!d.annotation) out[d.k] = (out[d.k] || 0) + 1; });
  return out;
}

// Planner ↔ proposal scope check (internal). Camera blocks vs cam markers; speaker items vs spk
// markers. Reports differences; never changes either side.
export function scopeMismatches(floors, option) {
  const counts = surveyCounts(floors);
  const services = option?.services || [];
  const camBlocks = services.filter((s) => s.key === "camera").flatMap((s) => s.items || []).filter((it) => (it.sub || []).length > 0).reduce((n, it) => n + (+it.qty || 1), 0);
  const speakers = services.filter((s) => s.key === "sound").flatMap((s) => s.items || []).filter((it) => /speaker/i.test(it.name || "") && !/wire|mount|tune/i.test(it.name || "")).reduce((n, it) => n + (+it.qty || 1), 0);
  const out = [];
  if ((counts.cam || 0) && camBlocks && counts.cam !== camBlocks) out.push(`Planner cameras: ${counts.cam} · proposal camera packages: ${camBlocks}`);
  if ((counts.spk || 0) && speakers && counts.spk !== speakers) out.push(`Planner speakers: ${counts.spk} · proposal speakers: ${speakers}`);
  return out;
}
