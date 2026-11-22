// Site Survey — INDOOR / OUTDOOR, derived from where a device sits against the structure drawn on
// the Layout step. There is no manual field and there never should be: the planner already knows the
// building's footprint, so asking a human to re-state it invites the two to disagree.
//
// This is the pure half of a rule that until now lived only inside the survey widget's `rmDevCtx`
// (static HTML, not importable, untested). The widget now mirrors these constants and a drift test
// keeps the two equal.
//
// THREE states, not two. The old widget rule answered "inside" or "outside" for every device, which
// meant it had to GUESS in the two cases it cannot actually know:
//   · a floor with no structure drawn — every device read "outside", which is a statement about the
//     building, made without a building;
//   · a device in the one-cell band just off the footprint — the wall-mount case, which is exactly
//     where the answer matters most (an exterior-wall camera needs an outdoor-rated housing).
// Both now return `review`, which is a question, not an answer.
//
// NOT part of the approval fingerprint. `survey2Meaning` (lib/tool-data.js) hashes k/x/y/aim/fov/
// range/name only, so recomputing placement on an existing survey cannot void a customer approval.

export const PLACEMENT = { INSIDE: "inside", OUTSIDE: "outside", REVIEW: "review" };
export const PLACEMENT_LABEL = { inside: "Inside", outside: "Outside", review: "Review" };

// Half-cell size in plan units. Mirrors SUG_HALF in public/widgets/site-survey-merged.html — the grid
// the Layout step paints the structure onto. A drift test pins the two together.
export const HALF = 13;

// Reasons are for the reviewer, not for logic — never branch on them.
export const REVIEW_NO_STRUCTURE = "no structure drawn on this floor";
export const REVIEW_ON_OUTLINE = "sits on the structure outline";
export const REVIEW_NO_GEOMETRY = "this floor has no plan geometry to measure against";

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

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

// The rule. Returns { placement, reason } — reason is "" unless placement is `review`.
export function placementOf(device, floor, vb, half = HALF) {
  const cells = structureCells(floor && floor.plan);
  // Rule 4, first half: no building drawn means there is nothing to be inside or outside OF.
  if (!cells.size) return { placement: PLACEMENT.REVIEW, reason: REVIEW_NO_STRUCTURE };
  const key = cellKey(device && device.x, device && device.y, vb, half);
  if (!key) return { placement: PLACEMENT.REVIEW, reason: REVIEW_NO_GEOMETRY };
  if (cells.has(key)) return { placement: PLACEMENT.INSIDE, reason: "" };
  // Rule 4, second half: the one-cell band around the footprint is the wall-mount case. A camera
  // bolted to an exterior wall and one standing a foot off it land in the same cell, and the grid
  // cannot separate them — so it says so instead of picking.
  const [c, r] = key.split(",").map(Number);
  for (let i = 0; i < NEIGHBOURS.length; i++) {
    if (cells.has(`${c + NEIGHBOURS[i][0]},${r + NEIGHBOURS[i][1]}`)) {
      return { placement: PLACEMENT.REVIEW, reason: REVIEW_ON_OUTLINE };
    }
  }
  return { placement: PLACEMENT.OUTSIDE, reason: "" };
}

// Does this device need an outdoor-rated housing? `review` counts: an unanswered question about a
// camera that might be in the weather is not a reason to spec an indoor housing.
export const needsOutdoorRating = (placement) => placement === PLACEMENT.OUTSIDE || placement === PLACEMENT.REVIEW;

// Every device on a floor that a human still has to confirm, with the reason. Feeds the equipment
// list and the outdoor-rated check; never blocks anything.
export function placementReviews(floor, vb, half = HALF) {
  const devices = Array.isArray(floor && floor.devices) ? floor.devices : [];
  return devices.map((d) => ({ d, ...placementOf(d, floor, vb, half) }))
    .filter((r) => r.placement === PLACEMENT.REVIEW)
    .map((r) => ({ cid: (r.d && (r.d.cid || r.d.id)) || "", k: (r.d && r.d.k) || "", reason: r.reason }));
}
