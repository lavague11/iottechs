# One writer for the survey row

**Status:** investigation and plan only. Nothing built. Awaiting the owner's OK.
Written 2026-11-24, after the sync fix shipped (`efe1742`).

---

## The problem, stated plainly

The survey row has **three** writers, and only one of them obeys the rules.

| writer | sends `baseRev`? | sends `editorId`? | takes the lease? | reconciles with the row? |
|---|---|---|---|---|
| `tool-sync.js` autosync (the host) | yes | yes | yes | **yes** (since `efe1742`) |
| `survey-approve.jsx` `flushDraft` | yes | yes | yes | yes |
| **the widget's own `pushServer()`** | **no** | **no** | **no** | **no** |

`pushServer` lives in `public/widgets/site-survey-merged.html` and POSTs straight to
`/api/tool-data` on every `save()`:

```js
function pushServer(json){ if(RO||!PID||!json) return; if(!stateLoaded) return;
  var intent=clearIntent; clearIntent=false;
  try{ fetch("/api/tool-data",{method:"POST",…,body:JSON.stringify({accessId:PID,tool:"survey2",data:json,allowEmpty:intent})})
```

Its own comment calls it *"the ONE route to the server row"*. That has not been true since the host
autosync was added, and since `7afb5929` it is not even a working route.

### It is already dead, and that is how we found it

`toolWriteNeedsClaim` refuses a write that carries no `baseRev` when the row already holds work. The
widget never sends one, so **every widget save on a non-empty survey has been refused since
`7afb5929` shipped**. Reproduced on production:

```
POST /api/tool-data  {accessId, tool:"survey2", data, allowEmpty:false}
→ {"error":"This copy was never loaded from the server, so it wasn't saved.","stale":true}
```

Nothing was lost, because the host autosync mirrors `localStorage` every 5 seconds and does send a
`baseRev`. But for a day every editor was told *"Couldn't save your last change — check your
connection"* (fixed in `5427e873`: a refusal the host already explains no longer raises that banner).

So the real state of affairs is: **the widget is already not a writer. It is a dead path that still
looks like the primary one.** This spec is about making the code say what is true.

---

## What it should be

The widget writes `localStorage`. The host reads `localStorage`, reconciles it with the row, holds
the lease, and is the only thing that POSTs.

```
widget edit → localStorage (+ IndexedDB mirror) → host autosync → reconcile → claim → POST
```

One writer, one gate, one place where a refusal is explained.

### The changes

1. **`pushServer` stops POSTing.** It keeps its name and its gate, and becomes the call that tells
   the host there is something to send (see 2). Everything it guards today — `RO`, `!PID`,
   `stateLoaded`, the save gate — still applies, just to a local write.
2. **An explicit nudge, so saving stays immediate.** Today the widget's POST is instant and the host
   ticks every 5 s. The widget posts a `message` to the host (`iotSurveyDirty`) and the host flushes
   that key at once — same latency as now, through the gated path. `_flushers` already exists for
   exactly this; `retryToolSync()` is the same mechanism.
3. **`allowEmpty` moves with it.** The declared-clear intent is the one thing only the widget knows
   ("the person deliberately emptied this floor"). It rides the nudge as a flag the host attaches to
   that one write, keeping `emptyOverContent` meaningful. **This is the fiddly part** — a flag that
   authorises exactly one write, crossing a `postMessage` boundary.
4. **`serverSaveState` is driven by the host.** The widget stops inferring save state from its own
   fetch and listens for the host's status instead, so there is one source for "saved / queued /
   refused" rather than two that can disagree. The banner wording already proved they can.
5. **The route keeps refusing claimless writes.** No server change. A claimless POST stays an error,
   because after this nothing legitimate makes one.

### What does NOT change

- The lease, the reconcile gate, the signed-survey lock, `emptyOverContent`, the outbound payload
  gate — all unchanged, and all now apply to **every** write rather than two writes out of three.
- `survey-approve.jsx`'s `flushDraft` already goes through the host. Untouched.
- `/api/project-cameras` is a separate, deliberate server-side patcher with its own reconciler
  (`mergeSurveyCameraPatch`). Untouched.

---

## Tests (real code, per the TEST RULE)

1. **No direct POST survives.** The widget source contains no `fetch("/api/tool-data"` at all. This
   is the one source-level assertion worth keeping, because it is a statement about absence.
2. An edit in the widget reaches the row **through the host**, with a `baseRev`, an `editorId` and
   the lease held — driven through the real `startToolAutosync`.
3. The nudge makes it immediate: an edit lands without waiting a full interval.
4. A declared clear still empties the row; an **undeclared** empty copy still cannot.
5. While another editor holds the lease, a widget edit does not reach the row and the widget shows
   the host's reason, not a connection error.
6. A divergent device copy still blocks, and the widget shows the host's banner.
7. The existing widget tests that drive `pushServer` (`survey-delete`, `survey-floors`,
   `survey-blob-reclaim`, `consulting-customer-head`) are updated to assert the local write plus the
   nudge, not a POST. **Four test files change — that is the real cost of this work.**

## Risk

**Medium-high, and it is the save path for the tool that has already lost data twice.**

- The failure mode to fear is an edit that reaches neither the row nor `localStorage`. Every test
  above exists to catch that.
- `allowEmpty` crossing a message boundary is the subtle part; it is an authorisation, and
  authorisations that cross boundaries are how guards get bypassed. It must authorise exactly one
  write and expire immediately.
- Four existing test files assert the POST, so the change is not mechanical.

**Recommendation:** do it, but on its own branch with the same treatment as the sync fix — build,
full suite, live two-tab and stale-copy tests on a journey-test project, then merge on your word.
It is not urgent in the "data is being lost" sense: the dead path is already refused by the server,
so nothing is at risk today. It is urgent in the "the code lies about where writes go" sense, which
is what made the last three bugs so hard to see.
