"use client";

// Keeps the browser tools' localStorage drafts (survey / mockup / schedule) mirrored to the
// server. localStorage stays the fast working copy; the server row is the authoritative backup
// so a cleared cache or a different device never loses a survey.
//
// Rules: on start, if localStorage has nothing for the key, seed it from the server copy.
// Then watch for local changes (the survey/mockup iframes write localStorage directly, so we
// poll — same-origin, cheap string compare) and push each change up, debounced by the interval.
//
// Goes through /api/tool-data (plain fetch), NOT the saveToolDataAction/getToolDataAction server
// actions — a mockup/survey photo grid runs several MB, and passing that as a Server Action
// argument hits a Turbopack dev-mode bug where large action payloads corrupt the RSC Flight
// stream ("Maximum array nesting exceeded" on an unrelated later request). A plain route ships
// raw JSON with no Flight encoding, so it can't hit that bug.

// `force`: for read-only viewers (the customer), the SERVER is the source of truth — always pull
// the latest and overwrite the local copy. Without this, a customer seeded once (before the office
// named the cameras / edited the survey) keeps that stale copy forever, because the guard below
// treats any existing local value as an authoritative draft. Read-only views never write
// localStorage, so overwriting loses nothing. Never force for editors — it would clobber an
// unsynced draft (e.g. a staff member previewing the customer view in the same browser).
export async function seedToolData(accessId, tool, storageKey, { force = false } = {}) {
  try {
    if (!force && localStorage.getItem(storageKey) != null) return false;   // local draft wins
    const res = await fetch(`/api/tool-data?accessId=${encodeURIComponent(accessId)}&tool=${encodeURIComponent(tool)}`);
    const r = await res.json();
    if (r?.ok && r.saved?.data != null) {
      if (force && r.saved.data === localStorage.getItem(storageKey)) return false;  // already current
      localStorage.setItem(storageKey, r.saved.data);
      return true;   // seeded from server
    }
  } catch { /* offline / no access — tool still works from localStorage */ }
  return false;
}

// Last value pushed per project+tool — module-level so a remounting widget (panel toggles,
// re-renders, StrictMode) doesn't forget what's already on the server and re-push it forever.
const _lastPushed = new Map();

// ---- Offline-first sync status -------------------------------------------------------------------
// The tools write localStorage FIRST (device-persistent, survives reload), so an edit is never lost
// even with no signal. This shared status lets the UI show "Offline, will sync" and flip to "Saved"
// once the queued change reaches the server. `pending` is the set of project:tool keys with an edit
// not yet acknowledged by the server; `online` tracks connectivity.
let _status = { online: typeof navigator === "undefined" ? true : navigator.onLine !== false, pending: new Set() };
const _statusSubs = new Set();
function emitStatus() {
  const snap = { online: _status.online, pending: _status.pending.size };
  _statusSubs.forEach((fn) => { try { fn(snap); } catch { /* subscriber threw */ } });
}
export function subscribeSyncStatus(fn) {
  _statusSubs.add(fn);
  try { fn({ online: _status.online, pending: _status.pending.size }); } catch { /* immediate push */ }
  return () => _statusSubs.delete(fn);
}
const _flushers = new Set();   // each running autosync registers its push() so an 'online' event flushes all
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { _status.online = true; emitStatus(); _flushers.forEach((f) => { try { f(); } catch { /* noop */ } }); });
  window.addEventListener("offline", () => { _status.online = false; emitStatus(); });
}

export function startToolAutosync(accessId, tool, storageKey, { intervalMs = 5000 } = {}) {
  const mapKey = `${accessId}:${tool}`;
  let stopped = false;
  let readOnly = false;
  let inFlight = false;

  async function push() {
    if (stopped || readOnly || inFlight) return;
    let cur;
    try { cur = localStorage.getItem(storageKey); } catch { return; }
    if (cur == null || cur === _lastPushed.get(mapKey)) { _status.pending.delete(mapKey); emitStatus(); return; }
    // There IS an unsynced local edit → it's queued on the device until the server acks it.
    _status.pending.add(mapKey); emitStatus();
    if (typeof navigator !== "undefined" && navigator.onLine === false) { _status.online = false; emitStatus(); return; }
    inFlight = true;
    try {
      const res = await fetch("/api/tool-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId, tool, data: cur }),
      });
      const r = await res.json();
      if (r?.ok) { _lastPushed.set(mapKey, cur); _status.pending.delete(mapKey); if (!_status.online) _status.online = true; emitStatus(); }   // synced
      else if (r?.error === "Read-only for your role.") { readOnly = true; _status.pending.delete(mapKey); emitStatus(); }  // viewer — stop pushing
      // any other error → leave it pending; the next tick retries (the localStorage copy IS the queue)
    } catch {
      // network failed → we're offline; keep it pending, the interval + the 'online' event retry it
      _status.online = false; emitStatus();
    } finally { inFlight = false; }
  }
  _flushers.add(push);

  // Prime with the server copy so we only push actual edits… unless the server has nothing
  // yet, in which case the current local copy IS worth backing up (first tick pushes it).
  (async () => {
    if (!_lastPushed.has(mapKey)) {
      try {
        const res = await fetch(`/api/tool-data?accessId=${encodeURIComponent(accessId)}&tool=${encodeURIComponent(tool)}`);
        const r = await res.json();
        if (r?.ok && r.saved?.data != null) _lastPushed.set(mapKey, r.saved.data);
      } catch { /* fall through */ }
    }
    await push();
  })();

  const timer = setInterval(push, intervalMs);
  return () => { stopped = true; clearInterval(timer); _flushers.delete(push); };
}
