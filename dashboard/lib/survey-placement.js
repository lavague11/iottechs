// Site Survey — INDOOR / OUTDOOR, derived from where a device sits against the structure drawn on
// the Layout step. There is no manual field and there never should be: the planner already knows the
// building's footprint, so asking a human to re-state it invites the two to disagree.
//
// This is the pure half of a rule the survey widget also implements (static HTML, cannot import); a
// drift test keeps the two equal.
//
// TWO states, and the rule is one sentence: inside the drawn structure is indoor, anything else is
// outdoor. "Anything else" deliberately includes the wall-mount band just off the footprint, a device
// exactly on the outline, and a floor with no structure drawn at all.
//
// That default is the safe direction rather than the merely simple one: an outdoor-rated housing works
// indoors, while an indoor one in the weather fails. So where the geometry cannot prove a device is
// inside the building, calling it outdoor over-specs the housing instead of under-specing it.
//
// NOT part of the approval fingerprint. `survey2Meaning` (lib/tool-data.js) hashes k/x/y/aim/fov/
// range/name only, so recomputing placement on an existing survey cannot void a customer approval.

export const PLACEMENT = { INSIDE: "inside", OUTSIDE: "outside" };
export const PLACEMENT_LABEL = { inside: "Inside", outside: "Outside" };

// Half-cell size in plan units. Mirrors SUG_HALF in public/widgets/site-survey-merged.html — the grid
// the Layout step paints the structure onto. A drift test pins the two together.
export const HALF = 13;

// A device's percent position → the plan half-cell it falls in, or null when the floor carries no
// usable plan viewbox. Mirrors devCellKey() in the widget.
export function cellKey(x, y, vb, half = HALF) {
  if (!vb || !(+vb.vw > 0) || !(+vb.vh > 0)) return null;
  if (!Number.isFinite(+x) || !Number.isFinite(+y)) return null;
  const px = (+vb.x0 || 0) + (+x) / 100 * (+vb.vw);
  const py = (+vb.y0 || 0) + (+y) / 100 * (+vb.vh);
  return `${Math.floor(px / half)},${Math.floor(py / half)}`;
}

// Every cell the BUILDING occupies. Rooms are folded in because ROOM ⊆ STRUCTURE and a legacy plan
// can carry rooms without ever having filled `cells`; a plan like that still describes a building.
// Areas and zones are deliberately NOT here — those are driveway / yard / parking, i.e. the outdoors.
export function structureCells(plan) {
  const out = new Set();
  const add = (k) => { if (typeof k === "string" && /^-?\d+,-?\d+$/.test(k)) out.add(k); };
  if (plan && Array.isArray(plan.cells)) plan.cells.forEach(add);
  if (plan && Array.isArray(plan.rooms)) plan.rooms.forEach((rm) => { if (rm && Array.isArray(rm.cells)) rm.cells.forEach(add); });
  return out;
}

export const floorHasDrawnStructure = (floor) => structureCells(floor && floor.plan).size > 0;

// The rule. Inside the drawn structure, or outdoor — nothing else to return.
export function placementOf(device, floor, vb, half = HALF) {
  const cells = structureCells(floor && floor.plan);
  if (!cells.size) return PLACEMENT.OUTSIDE;                 // no structure drawn → outdoor
  const key = cellKey(device && device.x, device && device.y, vb, half);
  if (!key) return PLACEMENT.OUTSIDE;                        // nothing to measure against → outdoor
  return cells.has(key) ? PLACEMENT.INSIDE : PLACEMENT.OUTSIDE;
}

// Does this device need an outdoor-rated housing? Outdoor does, indoor does not.
export const needsOutdoorRating = (placement) => placement === PLACEMENT.OUTSIDE;
