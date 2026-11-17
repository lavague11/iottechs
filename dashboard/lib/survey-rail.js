// Site Survey rail — the pure rules the planner shell (system-planner.jsx) follows, so they can be tested
// under bare Node. The RAIL is the source of truth for the five steps; the survey iframe's internal step is
// only a projection of it (it has two: Background and Setup), and its `iotSurveyStep` echo may never move the
// rail past a step the user did not ask for.
import { RAIL_STEPS } from "./survey-state.js";

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
  if (cur === "views" || cur === "review") return keep;
  if (dock === "satellite") return { step: "background", reissue: false, pending: pending === "background" ? null : pending };
  if (dock === "draw") return { step: "layout", reissue: false, pending: null };
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
