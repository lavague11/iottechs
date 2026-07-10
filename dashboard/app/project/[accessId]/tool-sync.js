"use client";
import { getToolDataAction, saveToolDataAction } from "./proposal-actions";

// Keeps the browser tools' localStorage drafts (survey / mockup / schedule) mirrored to the
// server. localStorage stays the fast working copy; the server row is the authoritative backup
// so a cleared cache or a different device never loses a survey.
//
// Rules: on start, if localStorage has nothing for the key, seed it from the server copy.
// Then watch for local changes (the survey/mockup iframes write localStorage directly, so we
// poll — same-origin, cheap string compare) and push each change up, debounced by the interval.

export async function seedToolData(accessId, tool, storageKey) {
  try {
    if (localStorage.getItem(storageKey) != null) return false;   // local draft wins
    const r = await getToolDataAction(accessId, tool);
    if (r?.ok && r.saved?.data != null) {
      localStorage.setItem(storageKey, r.saved.data);
      return true;   // seeded from server
    }
  } catch { /* offline / no access — tool still works from localStorage */ }
  return false;
}

// Last value pushed per project+tool — module-level so a remounting widget (panel toggles,
// re-renders, StrictMode) doesn't forget what's already on the server and re-push it forever.
const _lastPushed = new Map();

export function startToolAutosync(accessId, tool, storageKey, { intervalMs = 5000 } = {}) {
  const mapKey = `${accessId}:${tool}`;
  let stopped = false;
  let readOnly = false;
  let inFlight = false;

  async function push() {
    if (stopped || readOnly || inFlight) return;
    let cur;
    try { cur = localStorage.getItem(storageKey); } catch { return; }
    if (cur == null || cur === _lastPushed.get(mapKey)) return;
    inFlight = true;
    try {
      const r = await saveToolDataAction(accessId, tool, cur);
      if (r?.ok) _lastPushed.set(mapKey, cur);
      else if (r?.error === "Read-only for your role.") readOnly = true;  // viewer — stop pushing
    } finally { inFlight = false; }
  }

  // Prime with the server copy so we only push actual edits… unless the server has nothing
  // yet, in which case the current local copy IS worth backing up (first tick pushes it).
  (async () => {
    if (!_lastPushed.has(mapKey)) {
      try {
        const r = await getToolDataAction(accessId, tool);
        if (r?.ok && r.saved?.data != null) _lastPushed.set(mapKey, r.saved.data);
      } catch { /* fall through */ }
    }
    await push();
  })();

  const timer = setInterval(push, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}
