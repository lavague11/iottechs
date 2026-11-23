// Site Survey rail — the pure rules the planner shell (system-planner.jsx) follows, so they can be tested
// under bare Node. The RAIL is the source of truth for the five steps; the survey iframe's internal step is
// only a projection of it (it has two: Background and Setup), and its `iotSurveyStep` echo may never move the
// rail past a step the user did not ask for.
import { RAIL_STEPS } from "./survey-state.js";

// R4 — the floor picker shows on Background, Layout, Placement and Route only. Those are the steps
// where a FLOOR is the thing being worked on. Camera Angles pages through cameras and Approval
// summarises the whole survey, so a floor switcher on either is a control for something the step is
// not about. Exported so the shell and its tests read the same list.
export const FLOOR_BAR_STEPS = new Set(["background", "layout", "cameras", "route"]);

// Back / Next: exactly one step in the declared order, null at either end. Unknown steps resolve to null.
export function stepAfter(cur) { const i = RAIL_STEPS.indexOf(cur); return i < 0 ? null : (RAIL_STEPS[i + 1] || null); }
export function stepBefore(cur) { const i = RAIL_STEPS.indexOf(cur); return i < 0 ? null : (RAIL_STEPS[i - 1] || null); }

// Is there a real structure on this floor? Read from the stored shape, never from a UI flag: a hybrid floor
// (a committed plan over the aerial) or a plan that holds at least one cell or room. An EMPTY plan
// ({cells:[],rooms:[]}) is what the draw tool saves after you erase everything — that is not a structure.
// Mirrored by `floorHasStructure` in public/widgets/site-survey-merged.html (a test keeps the two equal).
// A plan object is authoritative: erasing every cell and room disables Next even on a hybrid floor (whose
// planSvg/bgCtx stay behind after Done). The hybrid flags only count for a legacy floor with no plan object.
export function floorHasStructure(f) {
  if (!f || typeof f !== "object") return false;
  const p = f.plan;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return (Array.isArray(p.cells) && p.cells.length > 0) || (Array.isArray(p.rooms) && p.rooms.length > 0);
  }
  return !!(f.ctx && typeof f.ctx === "object" && f.ctx.src && f.planSvg && f.bgCtx);
}

// What the survey iframe is showing (`dock`) versus where the rail says we are. `pending` is what the shell
// last asked for and has not seen arrive: null | "background" | "layout" | "layout-asked" (Layout re-asked once).
// Returns { step, reissue, pending }; `step` is the iframe's internal step (0 Background, 1 Setup).
//  - satellite / draw docks mirror onto Background / Layout;
//  - the "cameras" dock is the Setup canvas. From Placement it is Placement. From Layout it is Placement once
//    the draw editor has been seen and closed (Done). From Layout while Layout is still pending, the editor has
//    not opened (a background commit lands on Setup first): stay on Layout and re-ask ONCE; if the second echo
//    still shows Setup the editor can't open, and the rail follows the canvas rather than lying (self-heal).
//    From Background it is ignored while a Background request is in flight (a stale echo from the editor we
//    just closed); otherwise the widget moved itself (a background commit) and the rail goes to LAYOUT — the
//    next step — and asks for its editor, never straight to Placement;
//  - no dock never moves the rail (it used to nudge Background -> Layout, which made Background a no-op).
export function railFromEcho(cur, dock, pending = null, step = null) {
  const keep = { step: cur, reissue: false, pending };
  // Steps the widget's internal model has no counterpart for (it has only 0 Background / 1 Setup).
  // Route draws over the Setup canvas, so the iframe keeps echoing dock "cameras" the whole time it
  // is open — without this guard that echo would drag the rail back to Placement under the user.
  if (cur === "route" || cur === "views" || cur === "review") return keep;
  if (dock === "satellite") return { step: "background", reissue: false, pending: pending === "background" ? null : pending };
  // A "draw" echo normally means the Structure editor is open, which IS Layout. But when the shell has
  // just asked for Background, a draw dock is the tail of the editor we are leaving (or the background
  // tool reopening on a floor whose background was BUILT with the draw tool). Honouring it there dragged
  // the rail straight back to Layout — the reason Back stuck on Layout and the nav Background tile looked
  // dead. Background keeps the rail; the pending clears so the next genuine draw echo is believed.
  if (dock === "draw") {
    if (pending === "background" || cur === "background") return { step: "background", reissue: false, pending: null };
    return { step: "layout", reissue: false, pending: null };
  }
  if (dock === "cameras") {
    if (cur === "cameras") return { step: "cameras", reissue: false, pending: null };
    if (cur === "layout") {
      if (pending === "layout") return { step: "layout", reissue: true, pending: "layout-asked" };
      return { step: "cameras", reissue: false, pending: null };
    }
    if (pending === "background") return keep;
    return { step: "layout", reissue: true, pending: "layout-asked" };
  }
  if (pending === "background" && step === 0) return { step: cur, reissue: false, pending: null };
  return keep;
}

// Layout's Next gate: enabled once the floor has a structure. `live` = the iframe has reported at least once;
// until then the SAVED floor decides, afterwards the iframe's current signal does (so erasing the structure
// disables Next again instead of trusting a stale saved copy).
export function layoutNextOk({ live, liveHasPlan, savedFloor }) {
  return live ? !!liveHasPlan : floorHasStructure(savedFloor);
}

// ---- Submit step completeness -----------------------------------------------------------------
// ONE source for the Approval badge, the open-items list and the summary (survey-rules.md, Status
// honesty). The badge used to derive from the iframe echo while the summary beside it derived from
// the saved blob, so a survey edited in one sitting read "READY - Everything looks complete"
// directly above "4 missing photos", and only a reload made the two agree.
//
// The floor carries the background; the roster carries the devices. A floor the echo has not
// described yet is UNKNOWN, not missing — claiming "needs a background" for a floor nobody has
// heard about is the same class of lie.
export function submitRows(floors = [], roster = []) {
  const n = Math.max((floors || []).length, (roster || []).length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (floors || [])[i] || null;
    const r = (roster || [])[i] || null;
    const devices = (r && Array.isArray(r.devices) && r.devices.length)
      ? r.devices
      : (f ? (f.cams || (Array.isArray(f.devices) ? f.devices : [])) : []);
    const cams = devices.filter((d) => d && d.k === "cam" && d.placed !== false);
    out.push({
      name: (r && r.name) || (f && f.name) || `Floor ${i + 1}`,
      bg: (f && f.bg) || null,
      hasBase: f ? !!(f.bg || (f.ctx && f.ctx.src) || f.aerial || f.bgSource) : true,
      camCount: cams.length,
      missing: cams.filter((c) => !c.photo).length,
    });
  }
  return out;
}

// A real gap is a floor with no background, or a PLACED camera with no photo. A floor with no
// cameras is fine and is never flagged. Each gap names the step that fixes it.
export function submitGaps(rows = []) {
  const gaps = [];
  rows.forEach((f, i) => {
    if (!f.hasBase) { gaps.push({ floor: i, name: f.name, label: "Needs a background", step: "background" }); return; }
    if (f.missing > 0) gaps.push({ floor: i, name: f.name, label: `${f.missing} camera${f.missing > 1 ? "s" : ""} need a photo`, step: "views" });
  });
  return gaps;
}
