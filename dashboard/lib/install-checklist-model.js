// Installation Work Order — pure model + helpers. Extracted verbatim from
// app/project/[accessId]/install-checklist.jsx to keep that component under the file-size
// guideline. No DB, no React, no component state: same constants and pure functions, just
// colocated here so they can be shared and unit-reasoned about.
//
// Camera:  Cable Dropped → Cable Managed → Wires Terminated → Camera Mounted → Camera Online
// NVR:     Programmed → Online → Recording Verified
// Equipment/Displays/Drives: Installed (single tap)
export const CAMERA_STEPS = ["Cable Dropped", "Cable Managed", "Wires Terminated", "Camera Mounted", "Camera Online"];
export const NVR_STEPS    = ["Programmed", "Online", "Recording Verified"];
export const EQUIP_STEPS  = ["Installed"];
// Toast POS / network devices (switches, terminals, printers, KDS, kiosks) run the same cabling
// path as a camera: dropped → managed → terminated → installed.
export const POS_STEPS    = ["Cable Dropped", "Cable Managed", "Wires Terminated", "Device Installed"];
const STEPS_BY_TYPE = { camera: CAMERA_STEPS, nvr: NVR_STEPS, pos: POS_STEPS, equip: EQUIP_STEPS };
export const stepsFor = (type) => STEPS_BY_TYPE[type] || EQUIP_STEPS;
export const colorFor = (type) => (type === "camera" ? "#C9A96E" : type === "nvr" ? "#4b6a9b" : type === "pos" ? "#7c3aed" : "#6FBF73");
export const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtLogTime = (t) => { if (!t) return ""; try { return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
// Per-step payout breakdown (labor): each step earns a slice of the total.
//   Cameras:  Dropped $10 · Managed $18 · Terminated $12 · Mounted $12 · Online $0   → $52
//   Toast POS: Dropped $10 · Managed $18 · Terminated $12 · Installed $12            → $52
export const CAMERA_STEP_PAY = [10, 18, 12, 12, 0];
export const POS_STEP_PAY    = [10, 18, 12, 12];
const WEIGHTED_PAY = { camera: CAMERA_STEP_PAY, pos: POS_STEP_PAY };
// $ earned toward a line item at `done` steps. Cameras/POS use the weighted breakdown (scaled to
// the item's actual payout); NVR/equipment split their payout evenly across their steps.
export const earnedFor = (type, done, total, payout) => {
  const steps = stepsFor(type).length;
  const d = Math.min(done, steps);
  const weights = WEIGHTED_PAY[type];
  if (weights) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const frac = weights.slice(0, d).reduce((a, b) => a + b, 0) / sum;
    return payout * frac;
  }
  return steps ? payout * (d / steps) : 0;
};
// Default hour estimate when the office hasn't set one: 2 hours a camera or POS device + 30 min an NVR.
export const estHoursFor = (cams, nvrs = 0, pos = 0) => Math.max(1, cams * 2 + pos * 2 + nvrs * 0.5);
// Pay follows completion: a single step credits its slice of the line's payout. `wpay` is the
// assigned tech's per-step weight map ({ camera: [...], pos: [...] }); NVR/equipment split evenly.
export const weightedInc = (type, stepIdx, payout, wpay) => {
  const w = wpay[type];
  if (w) { const sum = w.reduce((a, b) => a + b, 0) || 1; return (w[stepIdx] || 0) / sum * payout; }
  const steps = stepsFor(type).length; return steps ? payout / steps : 0;
};
