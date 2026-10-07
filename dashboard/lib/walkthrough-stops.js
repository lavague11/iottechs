// System Walkthrough — pure stop + coverage helpers (no DOM). The walkthrough renders the ONE canonical
// survey (floors → devices, lib/survey2-model.js); this module only decides WHICH devices are stops and
// projects their stored coverage (aim/fov/range, speaker ring) onto the plan image rect. It never
// invents coverage: the cone/ring math is the walkthrough's existing drawing, lifted out so it's testable.
import { deviceContext } from "./device-context.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const norm = (s) => String(s || "").trim().toLowerCase();

// A floor's raw device list: the full canonical `devices` when the caller passes it, else the legacy
// cameras-only `cams` (older callers still pass just those).
const sourceOf = (f) => (Array.isArray(f && f.devices) ? { list: f.devices, legacy: false } : { list: (f && f.cams) || [], legacy: true });

// Cameras are always stops. A speaker is a stop when it is placed on the plan and has meaningful
// coverage (a photo, or a reach that isn't explicitly 0 — an unset range means the model default).
export function isStopDevice(d, kind) {
  if (!d) return false;
  if (kind === "cam") return true;
  if (kind === "spk") return isNum(d.x) && isNum(d.y) && (!!d.photo || !(d.range != null && Number.isFinite(+d.range) && +d.range <= 0));
  return false;
}

// Stops in a sensible order: floor by floor, cameras first (planner order), then speakers (planner order).
// Each stop: { fi, di, kind, dev, floor, key, n, kn, name, shot }. `n` is the 1-based marker number on its
// floor; `kn` the 1-based index within its kind (used only for a fallback label — real names win).
export function buildStops(floors, photos = []) {
  const byName = new Map();
  (photos || []).forEach((p) => { const k = norm(p && p.name); if (k && p.url && !byName.has(k)) byName.set(k, p.url); });
  const out = [];
  (floors || []).forEach((f, fi) => {
    const { list, legacy } = sourceOf(f);
    const rows = [];
    list.forEach((d, di) => {
      const kind = legacy ? "cam" : d && d.k;
      if (kind === "cam" || kind === "spk") rows.push({ d, di, kind });
    });
    const kc = { cam: 0, spk: 0 };
    let n = 0;
    ["cam", "spk"].forEach((want) => rows.forEach(({ d, di, kind }) => {
      if (kind !== want) return;
      kc[kind]++;
      if (!isStopDevice(d, kind)) return;
      n++;
      // One canonical display name: WHERE it is (geometry-derived location "Dining 1") wins; the permanent identity is the fallback.
      const label = (d.locName && String(d.locName).trim()) || (d.name && String(d.name).trim()) || `${kind === "spk" ? "Speaker" : "Camera"} ${kc[kind]}`;
      out.push({
        fi, di, kind, dev: d, floor: f, n, kn: kc[kind], name: label,
        key: d.cid || `${fi}:${kind}:${kc[kind]}`,
        shot: d.photo || (kind === "cam" ? byName.get(norm(d.name)) || null : null),
      });
    }));
  });
  return out;
}

// Coverage drawn for one stop device, in px relative to the plan image box `plate` {l,t,w,h}:
//   cam → the stored aimed wedge (only when aimed), spk → the stored round ring. Feet × px/ft when the
//   floor carries a real-world scale, else the same fixed fractions the planner uses. null when the
//   device has no drawable coverage (un-aimed camera, unplaced, no plate yet).
export function coverageShape(dev, floor, plate) {
  if (!plate || !dev || !isNum(dev.x) || !isNum(dev.y)) return null;
  const ring = dev.k === "spk" || !!dev.ring;
  if (!ring && !(dev.aimed || dev.aim)) return null;
  const px = plate.l + (dev.x / 100) * plate.w, py = plate.t + (dev.y / 100) * plate.h;
  const pxPerFt = (floor && floor.scale && floor.scale.ftW > 0) ? plate.w / floor.scale.ftW : 0;
  const cap = Math.max(plate.w, plate.h);
  const minWH = Math.min(plate.w, plate.h);
  const reach = ring
    ? (pxPerFt > 0 ? Math.min((+dev.range || 18) * pxPerFt, cap) : minWH * 0.12)
    : (pxPerFt > 0 ? Math.min((+dev.range || 40) * pxPerFt, cap) : minWH * 0.3);
  const fov = ring ? 360 : Math.min(360, Math.max(5, +dev.fov || 30));
  const half = (fov / 2) * Math.PI / 180, R = reach.toFixed(1);
  let d;
  if (fov >= 359) d = `M ${-reach} 0 A ${R} ${R} 0 1 1 ${reach} 0 A ${R} ${R} 0 1 1 ${-reach} 0 Z`;
  else {
    const x0 = (reach * Math.cos(-half)).toFixed(1), y0 = (reach * Math.sin(-half)).toFixed(1),
      x1 = (reach * Math.cos(half)).toFixed(1), y1 = (reach * Math.sin(half)).toFixed(1), la = fov > 180 ? 1 : 0;
    d = `M 0 0 L ${x0} ${y0} A ${R} ${R} 0 ${la} 1 ${x1} ${y1} Z`;
  }
  return { kind: ring ? "ring" : "cone", px, py, rot: ring ? 0 : (+dev.aim || 0), d, reach };
}

const tidy = (s) => String(s || "").replace(/[_-]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

// Up-to-two short place words for a stop ("Front", "Parking") from the deterministic device context.
// The structure side is only shown when the survey actually knows the structure (boundary or named sides),
// so an unmapped floor never claims "Front" by default. Empty when the floor carries no context.
export function stopPlace(dev, floor) {
  if (!dev || !floor) return [];
  let ctx; try { ctx = deviceContext(dev, floor); } catch { return []; }
  const out = [];
  const knowsSides = !!((floor.boundary && Array.isArray(floor.boundary.pts) && floor.boundary.pts.length >= 3) || (floor.sides && typeof floor.sides === "object"));
  if (knowsSides && ctx.side && ctx.side.label) out.push(ctx.side.label);
  const z = ctx.inZones && ctx.inZones[0];
  const place = (ctx.room && ctx.room.label) || (z && (z.label || tidy(z.type))) || (ctx.coverage[0] && tidy(ctx.coverage[0].type));
  if (place && !out.some((o) => norm(o) === norm(place))) out.push(place);
  return out.slice(0, 2);
}
