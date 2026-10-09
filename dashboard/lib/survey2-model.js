// Site Survey (planner) — the ONE device model every rendering reads: the planner widget places
// devices, the customer's "Your System Layout" and the proposal PDF's SITE SURVEY pages draw them
// from the same floors. Pure: no DOM, no canvas. The widget (public/widgets/site-survey-merged.html)
// keeps its own copy of GROUPS for the iframe; tests assert the two never drift.
//
// Canonical floor shape (what the widget saves): { name, bg, bgSource, devices: [Device], started }
//   Device: { id, k, x, y, aim, aimed, cone, fov, range, tag, name, color, cid, photo }
//   x / y are PERCENT of the floor's background image (rotation is baked into the image; zoom and
//   pan are view-only), so any renderer projects them as x/100 × imageWidth, y/100 × imageHeight.
import { validXf, xfIsId, xfApplyPx } from "./plan-xf.js";

// `range` on a coverage kind is its DEFAULT reach in FEET (cone throw, or speaker radius) — real-world
// scale when the floor is scaled from a trace, else a sensible px fraction fallback (see surveyScene).
export const SURVEY_GROUPS = [
  { key: "cctv",  name: "Cameras",   letter: "C", color: "#b98a2e", items: [
    { k: "cam", name: "Camera", ic: "cam", cone: true, fov: 30, range: 40 }, { k: "nvr", name: "NVR", ic: "nvr" }, { k: "isp", name: "ISP", ic: "net" }, { k: "poe", name: "PoE Switch", ic: "net" }, { k: "disp", name: "Display", ic: "disp" }] },
  { key: "sound", name: "Sound",     letter: "S", color: "#B084E0", items: [
    { k: "amp", name: "Amp", ic: "disp" }, { k: "spk", name: "Speaker", ic: "spk", ring: true, range: 18 }, { k: "aux", name: "Audio Input", ic: "net" }] },
  { key: "toast", name: "Toast POS", letter: "T", color: "#E8743B", items: [
    { k: "pronto", name: "Pronto / Meraki", ic: "net" }, { k: "tap", name: "Access Point", ic: "net" }, { k: "pos", name: "POS Terminal", ic: "pos" }, { k: "kprint", name: "Kitchen Printer", ic: "print" }, { k: "kds", name: "Kitchen Display", ic: "disp" }, { k: "ssk", name: "Self-Service Kiosk", ic: "disp" }, { k: "tpoe", name: "24-Port Switch", ic: "net" }, { k: "tisp", name: "ISP Router", ic: "net" }] },
  { key: "alarm", name: "Alarms",    letter: "A", color: "#5FB8DB", items: [
    { k: "door", name: "Door / Window", ic: "door" }, { k: "motion", name: "Motion", ic: "motion", cone: true, fov: 110, range: 30 }, { k: "glass", name: "Glassbreak", ic: "dot", cone: true, fov: 360, range: 20 }, { k: "keypad", name: "Keypad", ic: "pos" }, { k: "fire", name: "Fire / CO", ic: "alarm" }, { k: "aisp", name: "ISP", ic: "net" }] },
  { key: "misc",  name: "Misc",      letter: "M", color: "#E8C547", items: [
    { k: "important", name: "Important", ic: "dot" }, { k: "outlet", name: "Outlet", ic: "dot" }, { k: "hazard", name: "Hazard", ic: "dot" }] },
];
const FLAT = {};
SURVEY_GROUPS.forEach((g) => g.items.forEach((it) => { FLAT[it.k] = { ...it, group: g }; }));
export const kindOf = (k) => FLAT[k] || { k, name: String(k || "Device"), group: SURVEY_GROUPS[4], ic: "dot" };

// Canonical device glyphs — the SAME line-icon set the planner widget draws on each marker
// (public/widgets/site-survey-merged.html `ICONS`), so the customer layout and the PDF survey page
// render real device icons instead of code bubbles. A drift test asserts the two copies never diverge.
// Each value is a 24×24 SVG fragment (fill:none, stroked); a canvas renderer parses the primitives.
export const SURVEY_ICONS = {
  cam: '<svg viewBox="0 0 24 24"><path d="M23 19V7a2 2 0 00-2-2h-3l-2-2H8L6 5H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  nvr: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/></svg>',
  net: '<svg viewBox="0 0 24 24"><path d="M5 12a10 10 0 0114 0"/><path d="M8.5 15.5a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/></svg>',
  disp: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  spk: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 010 7"/></svg>',
  pos: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 15h10v6H7z"/></svg>',
  door: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="15" cy="12" r="1"/></svg>',
  motion: '<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="2"/><path d="M12 8v6M8 22l4-8 4 8M6 12l6-2 6 2"/></svg>',
  alarm: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
  dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>',
};
// The glyph fragment for a device kind (falls back to the neutral dot). `iconKeyOf` gives the raw key.
export const iconKeyOf = (k) => kindOf(k).ic || "dot";
export const deviceIcon = (k) => SURVEY_ICONS[iconKeyOf(k)] || SURVEY_ICONS.dot;
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
        // Persisted capture transform: north is drawn ONLY when known (older floors carry none).
        aerial: (f.aerial && Number.isFinite(+f.aerial.northDeg)) ? { northDeg: +f.aerial.northDeg, rotationDeg: Number.isFinite(+f.aerial.rotationDeg) ? +f.aerial.rotationDeg : 0 } : null,
        // Site boundary + zones (plate-% polygons) so the customer layout / PDF can render the same estimated site context the planner shows.
        boundary: (f.boundary && Array.isArray(f.boundary.pts) && f.boundary.pts.length >= 3) ? { pts: f.boundary.pts } : null,
        zones: Array.isArray(f.zones) ? f.zones.filter((z) => z && Array.isArray(z.pts) && z.pts.length >= 3).map((z) => ({ label: z.label || "", type: z.type || "custom", pts: z.pts })) : [],
        // Hybrid composite inputs (the leveled aerial under the plan + the manual plan→aerial alignment the
        // planner saved). Carried so the exporter / customer layout can composite the SAME aligned hybrid;
        // absent/legacy floors keep these null/false and render plan-only, exactly as before.
        ctx: (f.ctx && typeof f.ctx.src === "string" && f.ctx.src) ? {
          src: f.ctx.src,
          rect: (f.ctx.rect && Number.isFinite(+f.ctx.rect.w) && Number.isFinite(+f.ctx.rect.h)) ? { x: +f.ctx.rect.x || 0, y: +f.ctx.rect.y || 0, w: +f.ctx.rect.w, h: +f.ctx.rect.h } : null,
          full: !!f.ctx.full, ftW: +f.ctx.ftW || 0, ftH: +f.ctx.ftH || 0 } : null,
        planSvg: (typeof f.planSvg === "string" && f.planSvg) ? f.planSvg : null,
        bgCtx: !!f.bgCtx,
        planXf: f.planXf ? validXf(f.planXf) : null,
        view: typeof f.view === "string" ? f.view : null,
        devices: Array.isArray(f.devices) ? f.devices.filter((x) => x && x.k) : [] }));
  } catch { return []; }
}

// A floor can composite the aligned hybrid (aerial under the plan) only when it carries the leveled
// aerial (ctx.src), the transparent plan layer (planSvg) and the ctx flag — mirrors the widget's
// hybridCapable(). Without all three the floor renders plan-only everywhere, exactly as before.
export function hybridCapable(f) { return !!(f && f.ctx && f.ctx.src && f.planSvg && f.bgCtx); }
// Should a renderer composite the aligned hybrid for this floor? Whenever it is hybrid-capable — the
// customer layout / PDF show the SAME Layered view the app does, with the plan at its default position
// when staff never nudged the alignment (identity planXf). A plain floor (no aerial/plan) stays plan-only.
export function compositeHybrid(f) { return hybridCapable(f); }

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
      id: d.id, floor: fi, floorName: f.name, k: d.k, kindName: it.name, ic: it.ic || "dot", group: g.key, color: d.color || g.color,
      // label = WHERE it is (geometry-derived location "Dining 1"), falling back to identity; identity + placement ride alongside for detail/selection.
      code, label: cap((d.locName && String(d.locName).trim()) || (d.name && String(d.name).trim()) || d.tag || `${it.name} ${perGroup[g.key]}`),
      identity: cap((d.name && String(d.name).trim()) || d.tag || `${it.name} ${perGroup[g.key]}`), placementType: d.placementType || "",
      // loc = the geometry-derived room/area on its own ("Dining 1"), empty when the device sits off every
      // room/area/zone. The legend/schedule show it as a separate column; "" renders as "Unassigned".
      loc: cap((d.locName && String(d.locName).trim()) || ""),
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
// `planXf` (optional) bakes the manual plan→aerial alignment into the returned pixel coordinates: marker
// centres are projected onto the plate through the SAME transform the widget paints (lib/plan-xf.js), the
// marker radius + coverage reach scale by the alignment scale, and aimed cones rotate by the alignment
// rotation — so a renderer that draws devices in plain plate space (an HTML overlay, or a canvas without a
// group transform) lands them on the aerial exactly as the planner shows. Identity / absent = unchanged.
export function surveyScene(floors, floorIndex, W, H, { dense = 16, coneLen = null, pxPerFt = 0, planXf = null } = {}) {
  const all = surveyDevices(floors).filter((d) => d.floor === floorIndex);
  const xf = planXf && !xfIsId(planXf) ? validXf(planXf) : null;
  const rBase = Math.max(14, Math.round(Math.max(W, H) * 0.011));   // sized by the dominant dimension so markers stay readable on wide/short plans (not tiny)
  const r = xf ? Math.max(1, Math.round(rBase * xf.s)) : rBase;     // markers ride the alignment scale, like the widget's #planWorld
  const minWH = Math.min(W, H);
  const scaled = pxPerFt > 0;
  const fallbackCone = coneLen || Math.round(minWH * 0.14);
  const fallbackRing = Math.round(minWH * 0.12);
  const reach = (d, fb) => { const px = scaled ? Math.max(8, Math.round((+d.range || 0) * pxPerFt)) : fb; return xf ? Math.max(1, Math.round(px * xf.s)) : px; };
  const proj = (px, py) => xf ? xfApplyPx(xf, px, py, W, H) : { x: px, y: py };   // plan-pixel → plate-pixel through the alignment
  const showNames = all.length <= dense;    // past `dense` markers the labels would collide: codes on the plan, names in the list
  const markers = all.map((d) => { const p = proj(d.x / 100 * W, d.y / 100 * H); return { ...d, px: p.x, py: p.y, r }; });
  const cones = markers.filter((d) => d.cone && d.aimed).map((d) => ({ px: d.px, py: d.py, aim: d.aim + (xf ? xf.rot : 0), fov: Math.min(360, Math.max(5, d.fov)), R: reach(d, fallbackCone), color: d.color }));
  // Speaker coverage: a light-blue radius circle (see-through) drawn under the marker, like a cone but round.
  const rings = markers.filter((d) => d.ring).map((d) => ({ px: d.px, py: d.py, R: reach(d, fallbackRing), fill: SPK_COVERAGE.fill, stroke: SPK_COVERAGE.stroke }));
  return { W, H, r, markers, cones, rings, showNames, count: all.length, scaled, hybrid: !!xf };
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
