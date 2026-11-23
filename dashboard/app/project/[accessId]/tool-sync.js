"use client";
import { CLAIM_HEARTBEAT_MS, isClaimedTool, newEditorId } from "../../../lib/tool-claim.js";

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

import { idbGet, idbSet, idbDel, idbAvailable } from "./idb-store.js";
import { toolHasData, mergeSurveyCameraPatch } from "../../../lib/tool-data.js";

// Tools whose "is this empty?" test is EXACT, and which may therefore take part in the empty-local
// recovery below. `survey2Meaning` keys off floors that have been started / have a background / have
// devices, so an empty survey2 blob is unambiguously empty. `mockupHasData` counts only photos and
// names, so a mockup draft holding just `count` or `frame` edits reads as empty — recovering over that
// would delete real local work. `schedule` has no emptiness test at all (`!!parse(raw)`). So: survey
// only. Widening this set requires an exact emptiness test for the tool first.
const EXACT_EMPTY = new Set(["survey2", "survey"]);

// ---- THE OUTBOUND GATE ---------------------------------------------------------------------------
// A local copy the TOOL refused to load must never become the server's copy.
//
// The widget has its own save gate, but it only governs writes made INSIDE the iframe. The host writes
// too — the 5s autosync loop below and survey-approve's flushDraft both read localStorage directly and
// POST it — and those sailed straight past it. A corrupt local value (`{broken`) was therefore mirrored
// into IndexedDB and POSTed over a real 8-camera survey while the widget's own banner was on screen
// promising nothing had changed. That promise is why this has to be checked here, at the one place every
// host-side POST goes through, rather than with another per-caller guard.
//
// The test is VALIDITY, not content: unparseable, or structurally impossible for the tool. It is
// deliberately NOT `toolHasData` — an empty-but-valid survey is a legitimate state (delete the last
// floor, or Start Over on the only one), and refusing to send it would leave the deleted survey live on
// the customer's portal forever. Emptiness is only used on the INBOUND side (the seed), where recovering
// a browser that already holds an empty blob is the point.
// WHY a payload was refused, because the two reasons mean opposite things to a person.
// "empty"      — valid, just nothing in it yet. A brand-new survey. Not a problem, not a badge.
// "unreadable" — unparseable, impossible for the tool, or a legacy blob that must not be posted back.
//                This is the alarm the badge exists for.
// Returns null when the payload is sendable. toolPayloadSendable is the boolean wrapper, so every
// existing caller keeps working unchanged.
export function toolPayloadRefusal(tool, raw) {
  if (typeof raw !== "string") return "unreadable";
  if (raw.trim() === "") return "empty";
  if (raw.length > 8_000_000) return "unreadable";
  let d;
  try { d = JSON.parse(raw); } catch { return "unreadable"; }
  if (!d || typeof d !== "object") return "unreadable";
  if (d.__legacyAdapted) return "unreadable";
  if (EXACT_EMPTY.has(tool)) {
    if (d.floors != null && !Array.isArray(d.floors)) return "unreadable";
    // Valid and simply empty. The outbound gate still refuses to SEND it — that refusal is what stops
    // an empty blob overwriting a real survey — but refusing to send nothing is not a fault to report.
    if (!toolHasData(tool, raw)) return "empty";
  }
  return null;
}
export function toolPayloadSendable(tool, raw) {
  if (typeof raw !== "string") return false;
  if (raw.trim() === "") return false;
  if (raw.length > 8_000_000) return false;            // the server rejects it anyway; don't burn a round-trip
  let d;
  try { d = JSON.parse(raw); } catch { return false; }  // unparseable → NEVER send. This is the live bug.
  if (!d || typeof d !== "object") return false;
  // A legacy survey rendered through the read-time adapter (lib/survey2-model.legacySurveyToSurvey2,
  // docs/blocked.md B11) is marked so it can never be posted back as a real survey2 row. Seeding does
  // not record a push baseline, so without this gate simply OPENING a legacy project would convert it
  // — a migration write nobody asked for, on a tool whose blob feeds the approval fingerprint. Legacy
  // surveys are viewable, not editable, until that migration is a decision rather than a side effect.
  if (d.__legacyAdapted) return false;
  if (EXACT_EMPTY.has(tool)) {
    // Same strictness the widget's restore() applies: a blob claiming floors in a shape nothing can read
    // is corruption, not data.
    if (d.floors != null && !Array.isArray(d.floors)) return false;
    // And for the survey ONLY — the tool whose emptiness test is exact — a mirror must never send an
    // empty blob. `{"floors":[]}` is valid JSON and is EXACTLY what the pre-fix failed-restore path
    // wrote, so field devices plausibly hold one; mirroring it would blank a real survey just as surely
    // as the corrupt value did. A deliberate clear (Start Over / delete the last floor) is still
    // possible — the TOOL sends it, with allowEmpty, because only the tool knows its state is loaded.
    // Other tools keep validity-only, so clearing a mockup or a schedule still syncs.
    if (!toolHasData(tool, raw)) return false;
  }
  return true;
}

// THE ONE HOST-SIDE POST of a tool blob. The autosync interval, the `online` reconnect flush, the
// "Retry" button and survey-approve's flushDraft all go through here, so the gate cannot be bypassed by
// adding a caller. It never sets `allowEmpty`: a host mirror cannot distinguish a deliberate clear from
// a stale or unreadable local copy, and guessing wrong is the data loss.
// B14: the server revision this client last READ or successfully wrote, per accessId:tool. Sent
// with every write so the server can refuse one made against a version we never saw. Unset means
// "no claim" and the server accepts, which is how a client from before this shipped keeps working.
// ---- ONE EDITOR AT A TIME (lib/tool-claim.js) --------------------------------------------------
// The editor id is per TAB, in sessionStorage. Two tabs belonging to one person are two editors,
// which is the case that actually loses data: the stale copy is a stale tab, not a stale colleague.
let _editorId = null;
export function editorId() {
  if (_editorId) return _editorId;
  try { _editorId = sessionStorage.getItem("iot_editor_id") || null; } catch { /* private mode */ }
  if (!_editorId) {
    _editorId = newEditorId();
    try { sessionStorage.setItem("iot_editor_id", _editorId); } catch { /* private mode */ }
  }
  return _editorId;
}
const _claims = new Map();          // mapKey -> status from lib/tool-claim claimStatus
const _claimSubs = new Set();
export function subscribeClaim(fn, mapKey) {
  const sub = { fn, mapKey };
  _claimSubs.add(sub);
  try { fn(_claims.get(mapKey) || null); } catch { /* immediate push */ }
  return () => _claimSubs.delete(sub);
}
function emitClaim(mapKey) {
  const st = _claims.get(mapKey) || null;
  _claimSubs.forEach((sub) => { if (sub.mapKey === mapKey) { try { sub.fn(st); } catch { /* threw */ } } });
}
export function claimFor(accessId, tool) { return _claims.get(`${accessId}:${tool}`) || null; }

async function claimCall(accessId, tool, action) {
  try {
    const r = await fetch("/api/tool-claim", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessId, tool, editorId: editorId(), action }),
    });
    const out = await r.json();
    if (out && out.status) { _claims.set(`${accessId}:${tool}`, out.status); emitClaim(`${accessId}:${tool}`); }
    return out;
  } catch { return null; }          // offline: keep whatever we last knew, never assume we hold it
}
// A person pressing "Take over". Never called by a loop.
export async function takeOverTool(accessId, tool) { return claimCall(accessId, tool, "takeover"); }

const _baseRev = new Map();
export const _setBaseRev = (accessId, tool, rev) => { if (typeof rev === "string" && rev) _baseRev.set(`${accessId}:${tool}`, rev); };

export async function postToolData(accessId, tool, raw) {
  if (!toolPayloadSendable(tool, raw)) return { refused: true, error: "This device’s copy can’t be read, so it wasn’t sent." };
  const res = await fetch("/api/tool-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessId, tool, data: raw, baseRev: _baseRev.get(`${accessId}:${tool}`) || undefined, editorId: editorId() }),
  });
  const out = await res.json();
  // Our write became the new server version; remember it so the next push is not itself stale.
  if (out?.ok && out.saved?.rev) _setBaseRev(accessId, tool, out.saved.rev);
  return out;
}

// A `stale` refusal (B14) means the server row moved after we last read or wrote it. Retrying the same
// bytes can NEVER succeed — the claim we send is the stale part — so without this a single outside write
// left the autosync POSTing identically every 5s forever while the survey silently stopped saving. The
// one routine outside writer is /api/project-cameras (camera photo / rename), which patches the same
// survey2 blob, so reconcile that case and surface anything else rather than guessing.
//
// Returns the raw string to push next, or null when the caller must stop and ask the human.
async function reconcileStale(accessId, tool, localRaw) {
  const ancestor = _lastPushed.get(`${accessId}:${tool}`);
  let serverRaw = null, serverRev = null;
  try {
    const r = await (await fetch(`/api/tool-data?accessId=${encodeURIComponent(accessId)}&tool=${encodeURIComponent(tool)}`)).json();
    if (!r?.ok) return null;
    serverRaw = r.saved?.data ?? null; serverRev = r.saved?.rev || "0";
  } catch { return null; }   // couldn't read — treat as unresolved, never as "ours wins"
  // Someone else's copy is byte-identical to ours: nothing to merge, just re-claim and carry on.
  if (serverRaw === localRaw) { _setBaseRev(accessId, tool, serverRev); return localRaw; }
  if (tool !== "survey2") return null;                       // no reconciler for the other tools
  if (ancestor == null) return null;                         // no common parent → cannot merge safely
  const m = mergeSurveyCameraPatch(ancestor, serverRaw, localRaw);
  if (!m.ok) return null;                                    // a real conflict — the human decides
  _setBaseRev(accessId, tool, serverRev);                    // our next push is made against what we just read
  return m.merged;
}

// `force`: for read-only viewers (the customer), the SERVER is the source of truth — always pull
// the latest and overwrite the local copy. Without this, a customer seeded once (before the office
// named the cameras / edited the survey) keeps that stale copy forever, because the guard below
// treats any existing local value as an authoritative draft. Read-only views never write
// localStorage, so overwriting loses nothing. Never force for editors — it would clobber an
// unsynced draft (e.g. a staff member previewing the customer view in the same browser).
//
// Returns { seeded, serverError, hasLocal, localHasContent }. `serverError` matters: "the server has
// nothing" and "I couldn't ask the server" used to be the same `false`, so a device with no local copy
// on a flaky network concluded the survey was NEW — and the first edit overwrote the real row. Spec L
// says load from the database FIRST, so a failed read is its own outcome and the caller refuses to open
// an editor over a survey it could not read.
// `localHasContent` closes the second half of that: an EMPTY-but-valid local blob (`{"floors":[]}` —
// exactly what the pre-fix failed-restore path wrote, so real devices hold one) plus a failed server
// read is the same unknown state as having no local copy at all. The widget's restore() would classify
// that blob as perfectly readable, open the save gate over a blank canvas, and the first edit would
// blank the row. So the caller needs both halves, not just `hasLocal`.
export async function seedToolData(accessId, tool, storageKey, { force = false } = {}) {
  const out = { seeded: false, serverError: false, hasLocal: false, localHasContent: false };
  // One shared fetch helper so every path records a read failure the same way.
  const readServer = async () => {
    try {
      const res = await fetch(`/api/tool-data?accessId=${encodeURIComponent(accessId)}&tool=${encodeURIComponent(tool)}`);
      const r = await res.json();
      if (!r?.ok) { out.serverError = true; return null; }
      _setBaseRev(accessId, tool, r.saved?.rev || "0");   // remember the version we just read
      return r.saved?.data != null ? r.saved.data : "";   // "" = the server genuinely has nothing
    } catch { out.serverError = true; return null; }
  };
  try {
    // One-time migration: an existing localStorage draft is copied into IndexedDB (the durable store) and
    // localStorage is kept as the fast mirror. After this, IndexedDB is the on-device source of truth that
    // survives the ~5MB localStorage quota (offline photo captures).
    let local = null; try { local = localStorage.getItem(storageKey); } catch { /* blocked */ }
    out.hasLocal = local != null;
    // Recomputed on every return below, so it always describes the copy the caller will actually read.
    const noteLocal = () => { try { out.localHasContent = toolHasData(tool, localStorage.getItem(storageKey)); } catch { out.localHasContent = false; } };
    noteLocal();
    // "Local draft wins" is right for a real draft — but an EMPTY local copy is not a draft, and it used
    // to win forever. That is what stranded the surveys section L is about: the widget's own failed-restore
    // path wrote an empty blob over the local copy, and this guard then kept serving that empty copy on
    // every reopen, so the server's intact survey was never read again. The widget can no longer write an
    // empty blob (the save gate), but browsers already holding one need a way back. So: local wins unless
    // the local copy has NO content and the server's does — content-based, not timestamp-based, because
    // existing local blobs carry no timestamp to compare and content is unambiguous. It can never clobber
    // a real draft (a real draft has content), and when both are empty nothing is fetched.
    // The empty-local recovery applies ONLY to tools with an exact emptiness test (EXACT_EMPTY above);
    // for everything else any local copy is still an authoritative draft, exactly as before.
    const recoverable = EXACT_EMPTY.has(tool);
    if (!force && local != null && (!recoverable || toolHasData(tool, local))) {
      if (idbAvailable()) { const inIdb = await idbGet(storageKey); if (inIdb == null) await idbSet(storageKey, local); }
      return out;   // local draft wins
    }
    if (!force && local != null) {
      // Empty local copy of a tool we can judge exactly. Prefer a DURABLE on-device copy that does have
      // content (IndexedDB survives the localStorage quota), then the server row. Only overwrite when the
      // replacement actually has content.
      if (idbAvailable()) {
        const fromIdb = await idbGet(storageKey);
        if (fromIdb != null && toolHasData(tool, fromIdb)) { try { localStorage.setItem(storageKey, fromIdb); } catch { /* quota */ } out.seeded = true; noteLocal(); return out; }
      }
      const fromServer = await readServer();
      if (fromServer && toolHasData(tool, fromServer)) {
        try { localStorage.setItem(storageKey, fromServer); } catch { /* quota */ }
        if (idbAvailable()) await idbSet(storageKey, fromServer);
        out.seeded = true; noteLocal(); return out;   // recovered from the server
      }
      // Couldn't read the server (serverError) → the empty local copy stays, and the caller must NOT
      // treat it as a new survey. Server genuinely empty → nothing to recover, which is fine.
      if (idbAvailable()) { const inIdb = await idbGet(storageKey); if (inIdb == null) await idbSet(storageKey, local); }
      return out;
    }
    // Nothing (or forced) in localStorage → restore from the durable IndexedDB store first, then the server.
    if (!force && idbAvailable()) {
      const fromIdb = await idbGet(storageKey);
      if (fromIdb != null) { try { localStorage.setItem(storageKey, fromIdb); } catch { /* quota — IndexedDB still holds it */ } out.seeded = true; noteLocal(); return out; }
    }
    const fromServer = await readServer();
    if (fromServer) {
      if (force && fromServer === localStorage.getItem(storageKey)) return out;  // already current
      try { localStorage.setItem(storageKey, fromServer); } catch { /* quota */ }
      if (idbAvailable()) await idbSet(storageKey, fromServer);
      out.seeded = true; noteLocal(); return out;   // seeded from server
    }
  } catch { out.serverError = true; /* unexpected failure — treat it as "couldn't load", never as "new" */ }
  return out;
}

// Drop this DEVICE's copy of a tool draft (localStorage + the IndexedDB mirror) so the next seed comes
// from the server row. The one way out of an unreadable local copy: the widget can't open it, and a
// plain reload would read the same bytes again. Never touches the server.
export async function discardLocalToolData(storageKey) {
  try { localStorage.removeItem(storageKey); } catch { /* blocked */ }
  try { if (idbAvailable()) await idbDel(storageKey); } catch { /* blocked */ }
}

// Last value pushed per project+tool — module-level so a remounting widget (panel toggles,
// re-renders, StrictMode) doesn't forget what's already on the server and re-push it forever.
const _lastPushed = new Map();

// ---- Offline-first sync status -------------------------------------------------------------------
// The tools write localStorage FIRST (device-persistent, survives reload), so an edit is never lost
// even with no signal. This shared status lets the UI show "Offline, will sync" and flip to "Saved"
// once the queued change reaches the server. `pending` is the set of project:tool keys with an edit
// not yet acknowledged by the server; `online` tracks connectivity.
// `failed` is a GENUINE server-save failure (a rejected or errored POST that is not a read-only role),
// so the UI can say "Save failed — retry" instead of staying silent. `savedAt` is the moment the last
// queued edit was acknowledged, which lets the badge flash "Saved ✓" and then get out of the way.
// `blocked` is set when the outbound gate refuses this device's copy: nothing is being sent, and Retry
// cannot help (the bytes are the problem), so it is reported differently from `failed`.
let _status = { online: typeof navigator === "undefined" ? true : navigator.onLine !== false, pending: new Set(), quota: null, failed: false, blockedKeys: new Set(), savedAt: 0 };
const BLOCKED_MSG = "This device’s copy can’t be read — it is not being saved";
// Keys whose last push was refused as stale AND could not be reconciled (reconcileStale returned null):
// the server copy genuinely diverged in a way only a person can settle. Pushing is stopped for the key —
// retrying identical bytes against a stale claim can never succeed — and the badge says so. Cleared by a
// successful push, or by startToolAutosync, which only runs after a fresh seed.
const _conflicts = new Set();
const CONFLICT_MSG = "This was changed somewhere else — reload the page to get the latest copy";
const _statusSubs = new Set();
// `forKey` ("<accessId>:<tool>") scopes the two per-key flags to the tool the caller is showing.
// The comment below always claimed `blocked` was per project:tool — the code read `.size`, which is
// every tool at once, so the MOCKUP being blocked or conflicted rendered as the SURVEY saying
// "Not saving" / "Changed elsewhere", complete with a Reload button, while the survey saved fine.
function snapshot(forKey = null) {
  const hit = (set) => (forKey ? set.has(forKey) : set.size > 0);
  return { online: _status.online, pending: _status.pending.size, quota: _status.quota, failed: _status.failed,
    blocked: hit(_status.blockedKeys) ? BLOCKED_MSG : null, conflict: hit(_conflicts) ? CONFLICT_MSG : null,
    savedAt: _status.savedAt };
}
function emitStatus() {
  _statusSubs.forEach((sub) => { try { sub.fn(snapshot(sub.forKey)); } catch { /* subscriber threw */ } });
}
export function subscribeSyncStatus(fn, forKey = null) {
  const sub = { fn, forKey };
  _statusSubs.add(sub);
  try { fn(snapshot(forKey)); } catch { /* immediate push */ }
  return () => _statusSubs.delete(sub);
}
// "Retry" on the failed-save indicator: push every running autosync again, now. The localStorage copy
// IS the queue, so a retry never needs the caller to hold the data.
export function retryToolSync() {
  _status.failed = false; emitStatus();
  _flushers.forEach((f) => { try { f(); } catch { /* noop */ } });
}
const _flushers = new Set();   // each running autosync registers its push() so an 'online' event flushes all
// Defence in depth for the outbound gate: when a TOOL reports that it could not load this device's copy
// (the survey widget posts iotSurveyLoadFailed), the host stops pushing that key at all — not just the
// one value the gate happens to recognise as broken. Cleared by startToolAutosync, which only ever runs
// after a successful seed, so a discard-and-reseed resumes it automatically.
const _suspended = new Set();
export function suspendToolSync(accessId, tool) {
  _suspended.add(`${accessId}:${tool}`);
  _status.blockedKeys.add(`${accessId}:${tool}`); emitStatus();
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { _status.online = true; emitStatus(); _flushers.forEach((f) => { try { f(); } catch { /* noop */ } }); });
  window.addEventListener("offline", () => { _status.online = false; emitStatus(); });
}

export function startToolAutosync(accessId, tool, storageKey, { intervalMs = 5000 } = {}) {
  const mapKey = `${accessId}:${tool}`;
  _suspended.delete(mapKey);   // a (re)start always follows a successful seed
  _conflicts.delete(mapKey);   // …and a fresh seed is exactly how a conflict is resolved
  if (_status.blockedKeys.delete(mapKey)) emitStatus();   // a (re)start clears only THIS key
  let stopped = false;
  let readOnly = false;
  let inFlight = false;

  // ONE EDITOR AT A TIME. Take the lease on start and keep it with a heartbeat. While somebody else
  // holds it this tab does not push at all — the server would refuse anyway, and a loop retrying a
  // refusal every 5 seconds is just noise. The lease is released when the tab goes away, so a closed
  // laptop frees the survey rather than holding it until the TTL lapses.
  let claimTimer = null;
  const claimed = isClaimedTool(tool);
  const beat = () => { claimCall(accessId, tool, "claim"); };
  if (claimed) {
    beat();
    claimTimer = setInterval(beat, CLAIM_HEARTBEAT_MS);
  }

  async function push() {
    if (stopped || readOnly || inFlight || _suspended.has(mapKey) || _conflicts.has(mapKey)) return;
    if (claimed && (_claims.get(mapKey) || {}).state === "held") return;   // somebody else is editing
    let cur;
    try { cur = localStorage.getItem(storageKey); } catch { return; }
    if (cur == null || cur === _lastPushed.get(mapKey)) { _status.pending.delete(mapKey); emitStatus(); return; }
    // THE OUTBOUND GATE. Refuse before the IndexedDB mirror, not just before the POST — mirroring first
    // is how the corruption was made durable as well as remote.
    const refusal = toolPayloadRefusal(tool, cur);
    if (refusal) {
      _status.pending.delete(mapKey);
      // "Nothing saved yet" is not "your copy is broken". A brand-new survey showed a red
      // "Not saving" alarm whose tooltip described corruption, before the user had done anything.
      if (refusal === "empty") _status.blockedKeys.delete(mapKey);
      else _status.blockedKeys.add(mapKey);
      emitStatus();
      return;
    }
    if (_status.blockedKeys.delete(mapKey)) emitStatus();   // this key is sendable again
    // There IS an unsynced local edit → it's queued on the device until the server acks it.
    _status.pending.add(mapKey); emitStatus();
    // Durable copy → IndexedDB (survives the localStorage quota). A quota error here is surfaced in the
    // badge with the real reason, never swallowed.
    if (idbAvailable()) { const w = await idbSet(storageKey, cur); if (!w.ok && w.quota) { _status.quota = "Device storage full — free space to keep saving photos"; emitStatus(); } else if (w.ok && _status.quota) { _status.quota = null; emitStatus(); } }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { _status.online = false; emitStatus(); return; }
    inFlight = true;
    try {
      let r = await postToolData(accessId, tool, cur);
      // Stale claim → reconcile ONCE, then push the reconciled copy. Retrying `cur` unchanged is futile,
      // so an unreconcilable conflict stops this key instead of spinning (see reconcileStale).
      if (r?.stale) {
        const next = await reconcileStale(accessId, tool, cur);
        if (next == null) {
          _conflicts.add(mapKey); _status.pending.delete(mapKey); emitStatus();
          return;
        }
        if (next !== cur) { try { localStorage.setItem(storageKey, next); } catch { /* blocked */ } if (idbAvailable()) await idbSet(storageKey, next); }
        cur = next;
        r = await postToolData(accessId, tool, cur);
      }
      if (r?.ok) { _lastPushed.set(mapKey, cur); _status.pending.delete(mapKey); _conflicts.delete(mapKey); if (!_status.online) _status.online = true; _status.failed = false; _status.savedAt = Date.now(); emitStatus(); }   // synced → "Saved ✓"
      else if (r?.error === "Read-only for your role.") { readOnly = true; _status.pending.delete(mapKey); emitStatus(); }  // viewer — stop pushing
      else { _status.failed = true; emitStatus(); }   // a real server rejection → say so; it stays pending and the next tick (or Retry) resends
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
        if (r?.ok) _setBaseRev(accessId, tool, r.saved?.rev || "0");
        if (r?.ok && r.saved?.data != null) _lastPushed.set(mapKey, r.saved.data);
      } catch { /* fall through */ }
    }
    await push();
  })();

  const timer = setInterval(push, intervalMs);
  const release = () => { if (claimed) { try { navigator.sendBeacon?.("/api/tool-claim", new Blob([JSON.stringify({ accessId, tool, editorId: editorId(), action: "release" })], { type: "application/json" })); } catch { /* best effort */ } } };
  if (claimed && typeof window !== "undefined") window.addEventListener("pagehide", release);
  return () => {
    stopped = true; clearInterval(timer); _flushers.delete(push);
    if (claimTimer) clearInterval(claimTimer);
    if (claimed && typeof window !== "undefined") window.removeEventListener("pagehide", release);
    // Give the lease back on the way out, so the next tab does not wait out the TTL.
    if (claimed) claimCall(accessId, tool, "release");
  };
}
