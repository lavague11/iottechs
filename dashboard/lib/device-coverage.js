// Phase 4 (read) — explain a device's intended COVERAGE from verified Site Survey facts only. PURE: given a
// normalized device (surveyDevices shape, survey2-model), produce a plain, factual sentence — where it is,
// and for a coverage kind its aim / field-of-view / reach, or for a speaker its radius. It states ONLY what
// the survey stored (never invents a "purpose" or a number): an unaimed camera is reported as not yet aimed;
// a missing range is simply omitted. This is the middle of the headline flow — recognize the device (resolver)
// → EXPLAIN its coverage (here) → record the customer's concern against it (feedback capture).

import { kindOf } from "./survey2-model.js";

const round = (n) => Math.round(Number(n) || 0);
const hasNum = (n) => Number.isFinite(Number(n)) && Number(n) !== 0;
// Was this coverage value tuned by the surveyor, or is it the device TYPE's catalog default (what the planner
// draws for every device of this kind)? surveyDevices backfills kind defaults, so we phrase a default as
// "standard/typical" rather than claim it as a measured per-device fact (honesty: only `aim` is per-device).
const isDefault = (val, dflt) => hasNum(dflt) && Math.round(+val) === Math.round(+dflt);

// A short name for the device in prose: "C3 Camera" (code + kind), else its identity.
export function deviceName(d) {
  return [d?.code, d?.kindName].filter(Boolean).join(" ").trim() || d?.identity || d?.kindName || "Device";
}

// A factual coverage sentence, or null for no device. Only survey-stored facts; nothing inferred.
export function describeCoverage(d) {
  if (!d) return null;
  const name = deviceName(d);
  const where = d.loc || d.label || "";
  const place = d.placementType ? ` (${d.placementType})` : "";
  let s = `${name} is on ${d.floorName || "this floor"}${where ? ` in ${where}` : ""}${place}`;
  const def = kindOf(d.k) || {};
  if (d.cone) {
    if (d.aimed || hasNum(d.aim)) {
      const seg = [`aimed about ${round(d.aim)}°`];   // aim is the surveyor's per-device value — stated plainly
      if (hasNum(d.fov)) seg.push(isDefault(d.fov, def.fov) ? `a standard ${round(d.fov)}° field of view` : `a ${round(d.fov)}° field of view`);
      if (hasNum(d.range)) seg.push(isDefault(d.range, def.range) ? `a typical ~${round(d.range)} ft reach` : `reaching ~${round(d.range)} ft`);
      s += `, with ${seg.join(", ")}`;
    } else {
      s += ", not yet aimed (no coverage direction set)";
    }
  } else if (d.ring && hasNum(d.range)) {
    s += isDefault(d.range, def.range) ? `, covering a typical ~${round(d.range)} ft around it` : `, covering roughly ${round(d.range)} ft around it`;
  }
  return s + ".";
}

// Structured coverage facts (for callers that want the data, not the sentence). Values are null when the
// survey didn't store them — the caller must not fabricate a default.
export function coverageFacts(d) {
  if (!d) return null;
  return {
    id: d.id, name: deviceName(d), kind: d.k, kindName: d.kindName,
    floor: d.floor, floorName: d.floorName || null, location: d.loc || null, placement: d.placementType || null,
    aimed: !!(d.aimed || hasNum(d.aim)), aimDeg: hasNum(d.aim) ? round(d.aim) : null,
    fovDeg: d.cone && hasNum(d.fov) ? round(d.fov) : null,
    rangeFt: hasNum(d.range) ? round(d.range) : null,
    coverageKind: d.cone ? "cone" : d.ring ? "radius" : "none",
  };
}
