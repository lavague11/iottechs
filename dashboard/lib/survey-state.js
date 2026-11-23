// Site-survey saved-state reader — the ONE place that turns a stored `survey2` blob into the things
// the host (React) needs before the iframe has said anything: the rail step to reopen on, the device
// roster, the camera list and the per-floor scale.
//
// Why this exists (section L): the survey tool is an iframe that keeps its state in a JSON blob
// (`project_tool_data`, tool `survey2`). The host used to learn the devices ONLY from the iframe's
// in-memory `iotSurveyDevices` echo, while Camera Angles read the SERVER row through
// `getProjectCameras` — so one surface could say "View 1 of 8" while the other said "No cameras yet".
// Both now read the saved blob through here, so there is one saved device list.
//
// Pure + dependency-free: safe on the client, on the server, and importable under bare Node in tests.
//
// ADDITIVE ONLY. `survey2HasData` / `survey2Meaning` (lib/tool-data.js) fingerprint `devices` and `bg`
// to bind customer approvals, so nothing here reshapes an existing field. The one field this module
// introduced to the blob is `lastStep` (a string), which the fingerprint ignores.

// The host rail's steps, in order. `goRail` in system-planner.jsx uses exactly these keys, and
// stepAfter/stepBefore (lib/survey-rail.js) are pure index maths over this array — so the ORDER here
// is the only place the flow is declared. "route" (the wiring diagram) sits after Placement and
// before Camera Angles on purpose: routes are drawn over placed devices, and drawing them before the
// angle cones exist keeps the plan readable while you trace cable paths.
export const RAIL_STEPS = ["background", "layout", "cameras", "route", "views", "review"];

export function normalizeRailStep(step) {
  const s = String(step || "").trim().toLowerCase();
  return RAIL_STEPS.includes(s) ? s : null;
}

function parse(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try { const d = JSON.parse(raw); return d && typeof d === "object" ? d : null; } catch { return null; }
}

// Floors, defensively: a blob whose `floors` is not a real array (or whose entries are junk) yields an
// empty list rather than throwing. A legacy single-floor blob ({bg, devices}) is read as one floor.
export function surveyFloors(raw) {
  const d = parse(raw);
  if (!d) return [];
  if (Array.isArray(d.floors)) return d.floors.filter((f) => f && typeof f === "object");
  if (d.bg || (Array.isArray(d.devices) && d.devices.length)) {
    return [{ name: "Floor 1", bg: d.bg || null, devices: Array.isArray(d.devices) ? d.devices : [], started: true }];
  }
  return [];
}

// The roster shape the survey iframe posts as `iotSurveyDevices` — so the host can render the Devices
// list from the SAVED survey before (or instead of) the iframe's echo. Same floor→device order as
// `getProjectCameras` (lib/db.js), which is what Camera Angles reads.
export function rosterFromSurvey(raw) {
  return surveyFloors(raw).map((f, fi) => ({
    name: f.name || `Floor ${fi + 1}`,
    devices: (Array.isArray(f.devices) ? f.devices : []).filter((d) => d && typeof d === "object"),
  }));
}

// Every placed camera across the floors, in getProjectCameras order. The Devices list and Camera
// Angles must agree on this list — that is what section L's "View 1 of 8 vs No cameras yet" was.
export function camerasFromSurvey(raw) {
  const out = [];
  surveyFloors(raw).forEach((f, fi) => {
    (Array.isArray(f.devices) ? f.devices : []).forEach((d, di) => {
      if (d && d.k === "cam") {
        out.push({
          id: d.cid || null, name: d.name || null, locName: d.locName || null,
          tag: d.tag || null, photo: d.photo || null, photoName: d.photoName || null,
          floor: fi, floorName: f.name || `Floor ${fi + 1}`, di,
        });
      }
    });
  });
  return out;
}

export function surveyCameraCount(raw) {
  return camerasFromSurvey(raw).length;
}

// Per-floor real-world scale ({ftW, ftH}) as saved. Null for an unscaled floor. Reopening must never
// drop this — a null scale is what made the grid label jump from the plan's real feet to a derived
// "nice" default (gridBoxFtFor's fallback in the widget).
export function surveyFloorScales(raw) {
  return surveyFloors(raw).map((f) => {
    const sc = f.scale;
    return sc && +sc.ftW > 0 && +sc.ftH > 0 ? { ftW: +sc.ftW, ftH: +sc.ftH } : null;
  });
}

export function surveySubmitted(raw) {
  const d = parse(raw);
  return !!(d && d.submitted);
}

// Was this survey reopened for edits after it had been submitted? The mark belongs to the SURVEY, not to
// whoever happened to click "Edit survey" — it has to survive a refresh and reach another device — so the
// widget writes it into the blob (additively, off the approval fingerprint) and clears it on the next
// submit. See `editedAfterSubmit` in public/widgets/site-survey-merged.html.
export function surveyEditedAfterSubmit(raw) {
  const d = parse(raw);
  return !!(d && d.editedAfterSubmit);
}

// Which rail step to reopen on.
//  - a submitted survey opens on Approval (review) in read-only review mode, per section L;
//  - otherwise the saved `lastStep`;
//  - otherwise Layout, the old default.
// `submitted` is passed in because the SERVER's acceptance row — not the blob's own flag — is the
// truth about submission on the host side.
export function surveyLastStep(raw, { submitted = false } = {}) {
  const d = parse(raw);
  if (submitted || surveySubmitted(raw)) return "review";   // submitted → Approval, in review mode
  // R3: the flow starts at BACKGROUND. With nothing saved there is no step to resume, and the first
  // step of the order is where a survey begins — defaulting to Layout made a brand-new survey open
  // with the rail reading Layout while the canvas asked for a background.
  return normalizeRailStep(d && d.lastStep) || "background";
}

// Does the saved blob hold anything a reopen must show? Used to decide whether an empty in-memory
// roster is "nothing saved" or "the iframe hasn't reported yet" — never show "No cameras yet" when
// this is true.
export function surveyHasDevices(raw) {
  return surveyFloors(raw).some((f) => (Array.isArray(f.devices) ? f.devices : []).length > 0);
}
