# The sync fix — a device copy is never pushed over the server row unasked

**Status:** design, then staged on the `survey-sync-fix` branch. Not on `main`, so nothing is live.
Written 2026-11-24, after the second ASC0055 loss.

---

## What actually happens today

A survey lives in the browser's `localStorage` (mirrored to IndexedDB), and a 5-second loop pushes
that copy to `project_tool_data`. The row is the only durable copy.

On 2026-11-24 the ASC0055 row was restored at 07:28:03 with its fifteen cameras. **Thirty-four
seconds later, opening the project page in ONE tab wiped it again** — rev `c453f859…` →
`e247b574…`, back to ten NVRs. No second tab, no race, no stale `baseRev`.

Two lines of code produce it.

**1. The seed never asks the server.** `seedToolData` (`tool-sync.js:232`):

```js
if (!force && local != null && (!recoverable || toolHasData(tool, local))) {
  …
  return out;   // local draft wins
}
```

A device copy with content wins **without the server ever being read**. Nothing compares the two.

**2. The autosync prime reads the row only to take its rev.** `startToolAutosync` (`:415-425`):

```js
const r = await res.json();
if (r?.ok) _setBaseRev(accessId, tool, r.saved?.rev || "0");   // ← the row's rev
if (r?.ok && r.saved?.data != null) _lastPushed.set(mapKey, r.saved.data);
…
await push();                                                   // ← pushes localStorage
```

`push()` then sends whatever `localStorage` holds, stamped with a rev fetched one tick earlier.

Every guard passes, because **every guard asks "did you read the row?" and none asks "is what you
are about to push derived from it?"**:

| guard | why it passes |
|---|---|
| `toolWriteIsStale` (B14) | the `baseRev` is one tick old — perfectly current |
| `toolWriteNeedsClaim` | a `baseRev` is present, so it returns `false` |
| the editing lease | this tab legitimately holds it; it is the only editor |
| `emptyOverContent` | the stale blob is not empty — it has ten devices |

So any browser carrying an old copy silently re-wipes the row **every time the project is opened**.
The owner's Chrome held the exact 114,117-byte ten-NVR blob in both stores; it is the source of the
05:47 write on 11-23. A read-only sweep of that browser found copies for 30 projects, five of which
would destroy server content if pushed (see the tracker).

**This is not the hole the lease closed.** The lease stops *two editors*. This is *one editor*
pushing a copy that was never reconciled with the row.

---

## The rules this must satisfy

Owner-set, 2026-11-24:

1. **Never push a local copy that differs from the server row without asking.**
2. **On load, always read the server first.** If the local copy differs, show
   *"This device has a different copy — use the saved one, or push this one."* **Default to the
   saved one.**
3. **Tests must run the real `seedToolData` and autosync code**: open with a stale local copy and
   confirm the server row does not change.

---

## The design

### One new idea: a device copy is either *reconciled* or *divergent*

A local copy is **reconciled** when this device has seen the exact server bytes it is based on.
Only a reconciled copy may be pushed, and only for the part that changed *after* reconciliation.

A local copy that differs from the row at load time is **not an edit** — the person has not touched
anything yet. It is an unresolved difference from some earlier session, and the only honest thing to
do is stop and ask.

### Change 1 — `seedToolData` always reads the server

Replace the "local draft wins" early return with a comparison. Outcomes:

| local | server | result |
|---|---|---|
| absent | has content | seed from IndexedDB, else the server (unchanged) |
| absent | empty | nothing to do (unchanged) |
| present | **equal bytes** | reconciled. Record the rev. Sync runs normally |
| present | has content, **differs** | **divergent** → keep BOTH, render the **server** copy, ask |
| present | empty / no row | local is the only copy — keep it, it is the backup (unchanged) |
| present | **read failed** | `serverError`, as today. Never a divergence, and never pushed |

`force` (the customer/read-only path) is unchanged: the server always wins there and writes nothing.

The server bytes already fetched here are handed to the autosync so the prime does not re-fetch.

### Change 2 — the autosync never pushes an unreconciled copy

`push()` gains one precondition: this key must be reconciled. Concretely, the prime stops doing

```js
_lastPushed.set(mapKey, r.saved.data); await push();   // today: pushes localStorage regardless
```

and instead compares first. If `localStorage !== r.saved.data`, the key goes into the existing
`_conflicts` set — which `push()` already honours (`:364`) — and **nothing is sent**. The status
badge gains a `divergent` key so the UI can tell this apart from "offline" and from "broken copy".

Edits made *after* a reconciliation are untouched: `_lastPushed` holds the reconciled bytes, and any
later change to `localStorage` is a genuine edit and still pushes on the next tick.

### Change 3 — the question, asked once

A banner on the survey surface (the same place the "editing elsewhere" banner lives):

> **This device has a different copy** — Use the saved one · Push this one

- **Use the saved one** (default, and what is already on screen): overwrite `localStorage` +
  IndexedDB from the server bytes, clear the conflict, resume syncing. The device copy is gone, but
  the server copy is intact and that is the one everyone else sees.
- **Push this one**: write the device copy to the server through the normal path (claim + lease +
  `baseRev`), clear the conflict, resume syncing.

Nothing is auto-resolved, and no timer ever answers this question. Two words per button, per the
design constitution.

### What is deliberately NOT changed

- The claim/lease work (`7afb5929`) stays exactly as it is — it solves a different problem.
- `reconcileStale` / `mergeSurveyCameraPatch` stay: they handle the *other* writer
  (`/api/project-cameras`), which is a real merge, not a divergence.
- No server-side change. The server cannot tell a stale copy from an edit — only the device knows
  whether it ever reconciled. Server guards stay as the second line.
- Nothing is retro-applied to existing devices' stored copies. A browser holding an old copy simply
  gets asked the next time it opens that project.

---

## Tests (must run the real code, per the TEST RULE)

In `tests/survey-sync-divergence.test.mjs`, against the real `seedToolData` / `startToolAutosync`
with the existing `hostEnv` harness (stubbed `localStorage`, `fetch`, IndexedDB absent):

1. **The ASC0055 case.** localStorage holds a stale copy; the server row holds a different one with
   content. Seed, start the autosync, run several ticks → **zero POSTs to `/api/tool-data`**, and
   the server bytes are unchanged. This is the regression test for the live loss.
2. The seed reports `divergent` and leaves the **server** copy in localStorage (default to saved).
3. Identical local and server bytes → not divergent, no POST, and sync is live.
4. A real edit made *after* a clean seed **does** push (the fix must not freeze normal work).
5. Server read fails → no divergence, no POST (never guess when the row could not be read).
6. Server has no row and the device has content → the device copy IS pushed (first backup still works).
7. "Push this one" sends exactly the device bytes, once.
8. "Use the saved one" leaves the row untouched and resumes syncing.
9. The customer `force` path still overwrites locally and still writes nothing.

---

## Risk

Medium, and it is the **persistence path** (RED lane), so it is staged on a branch and not merged.

- The failure mode of the fix is *refusing to save* rather than *overwriting* — the right direction,
  but it must not strand a genuine offline draft. Test 4 and test 6 exist for exactly that, and the
  "Push this one" button is the escape hatch.
- One extra GET per tool at load. The prime already made it; it is now shared, so the request count
  does not go up.
