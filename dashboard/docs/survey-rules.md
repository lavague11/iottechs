# Site Survey — the rules

**This file is the source of truth for the Site Survey tool.** Every fix and every test checks
against it. If behaviour and this file disagree, the behaviour is the bug.

Owner-set, 2026-11-23. Audit evidence that produced them: [`survey-walkthrough.md`](survey-walkthrough.md).

---

## The nine rules

**R1 — Survey Navigation on open.**
Opening Site Survey always shows Survey Navigation as a popup in the middle of the screen. You pick a
step and go there.

**R2 — Steps go in order, and every nav item works.**
The order is **Background → Layout → Placement → Route → Camera Angles → Approval**.
Next always goes to the next step, *even if that step is already complete*. Back always goes to the
previous one. Jumping around is only through Survey Navigation, and **every item in it works** —
including Background.

**R3 — The flow starts at Background, not Layout.**

**R4 — Floor picker shows on Background, Layout, Placement and Route only.**
Not on Camera Angles. Not on Approval.

**R5 — Placement and Route show the same hybrid view and photo as Layout.**
The aerial under the plan is the same on all three. It must not depend on the order the floor was
built in.

**R6 — Everything can be added, renamed, moved and deleted.**
Cameras, NVR, structure, rooms, cable runs. All four operations, for all five things.

**R7 — Undo/redo only affects the current step, and reverses the actual last action.**
Not an older action. Not a different object. If the last thing you did was move something, undo moves
it back.

**R8 — A reload never changes anything.**

**R9 — Read-only is for customers only. Staff can always edit.**

---

## The test rule

> **Every fix gets a test that RUNS the real code, not one that checks how the code looks.**

This is not a style preference. `placeAt` shipped completely broken — no device could be added to any
survey — and **1,977 tests passed**, because they asserted the *shape* of the guard line
(`/\|\|routing\) return;/`) while a `//` comment had swallowed the statement after it. The file still
parsed, so every structural check was happy.

A test earns its place only if it would fail when the behaviour breaks. In this codebase that means:
extract the real function and call it, or drive the real module and assert on the state it produced.
`tests/survey-place-device.test.mjs` is the reference example — it builds `placeAt` from the widget
source and calls it.

**Checking the fix has teeth:** reintroduce the bug, confirm the new test fails, restore the fix,
confirm it passes. A test never seen red is not known to work.

---

## Invariants the rules imply

These are the specific, checkable things the rules above mean in this codebase. They exist because
each one was broken at some point.

**Identity**
- A device's **tag and name are unique within a survey**, always — including after a delete, after an
  undo, and after a redo. The next ordinal is **the highest existing + 1**, never `count + 1`.
- A duplicate must never reach the customer layout or the proposal PDF (both read `d.tag` through
  `lib/survey2-model.js`).

**Referential integrity**
- Deleting a device deletes its cable runs. **No orphan runs** — no run may point at a `dev` key that
  no device carries.
- Undoing a device's deletion restores it with its original `cid`, so its runs re-attach.

**Persistence**
- The saved blob, the server row and the live editor state agree. A reload is semantically lossless.
- Fingerprints and signed surveys are never touched by a fix. `survey2Meaning`'s allow-list is
  signature-bearing: adding a field to it changes every existing signature.

**Status honesty**
- A status badge states the state of **the thing it is attached to**, computed from **the same facts**
  as everything shown beside it. Approval never says READY while open items are listed next to it.
- "Nothing saved yet" and "your copy cannot be read" are different states and must not share wording.

---

## Scope notes

- Work on **journey-test projects only**. Never a real customer project.
- Back up the database before any change that can write data.
- Never drop, truncate or rewrite `sign_documents` or any signed-PDF table.
- Never retro-lock existing projects — flag them instead.

---

# Progress

## URGENT — the overwrite bug, and ASC0055

**The cause, found 2026-11-23.** `toolWriteIsStale` returned FALSE when a writer sent no `baseRev`
("no claim made -> nothing to check"), so a tab that never successfully read the row could overwrite
it. `emptyOverContent` did not catch it because the blob was not empty. That is how ASC0055 lost six
named cameras off Floor 1 in a single write at 05:47 on 2026-11-23.

**Closed** in `7afb5929` (Group 5, built ahead of the rest of Group 2 because data was being lost in
real time): a write to a survey that already holds work must carry a claim, and a per-tab editing
lease means only one editor writes a row at a time. Both enforced on BOTH write paths. Verified with
two tabs.

**The clean source** was the Hostinger files backup **2026-11-22 02:30** — ASC0055 row written
2026-11-03 16:43:55, holding Floor 1 (6 cameras) AND Floor 2 (9 cameras) intact.

**Where NVR 29-38 came from: nowhere else.** ASC0055 is the only project in either backup that
carries an `nvr`-kind device at all. They were generated inside its own row, not copied in.

### THE REAL CAUSE — localStorage is pushed over the server row on every page open

The claim/lease fix above closed a real hole, but it was **not** the one that kept wiping ASC0055.
Proven live on 2026-11-24: the row was restored at 07:28:03, and **34 seconds later, simply opening
the project page in ONE tab wiped it again** (rev `c453f859…` → `e247b574…`, back to ten NVRs).

`startToolAutosync`'s prime (`tool-sync.js:415-425`) reads the server row **only to harvest its
rev** — `_setBaseRev(r.saved.rev)` and `_lastPushed.set(r.saved.data)` — and then `push()` sends
whatever is in **localStorage**. Every guard passes, because every guard only ever asked *"did you
read the row?"*, never *"is what you are about to push derived from it?"*:

| guard | why it passed |
|---|---|
| `toolWriteIsStale` | `baseRev` was fetched one tick earlier — perfectly current |
| `toolWriteNeedsClaim` | a `baseRev` was present, so it returns false |
| the editing lease | the tab legitimately holds it; it is the only editor |
| `emptyOverContent` | the stale blob is not empty — it has ten devices |

`seedToolData` makes it inevitable: at line 232, **when localStorage holds a copy with content it
returns without ever reading the server**, so the device copy is never reconciled. Any browser
carrying an old copy silently re-wipes the row every time the project is opened.

**Confirmed on the owner's own Chrome:** it held the exact 114,117-byte ten-NVR blob in BOTH
localStorage and IndexedDB — the source of the 05:47 write. That browser also carries survey copies
for **32 other projects**, each the same risk.

### The restore — DONE, 2026-11-24

Approved mode: **splice the devices only**, because production was no longer "the clean row minus
cameras". It held work done AFTER 11-03 that the backup does not have: Floor 1's traced floor plan
(53,887-byte drawn background + an 11,228-byte plan), Floor 2's head-end position, and 16 cable
runs — two of which (`cwq9ge1u`, `crfr9p5t`) are **Camera 8's and Camera 11's**, orphaned by the
wipe and reattached the moment the cameras came back. A full overwrite would have destroyed all of it.

Sequence: backed up the damaged row → cleared the poisoned device copy in both browsers → spliced
the 15 cameras onto the live row, asserting **every field except the two device lists was
byte-identical** → verified 6/9/0 with runs 1/16/0 and Floor 1's traced plan intact → three reloads,
rev unchanged at `42fdde7caddae5e2`. All ASC0055 JSON then deleted from the scratchpad.

**Still owed:** the code fix. Clearing a cache is not a fix — any staff browser holding an old copy
of any project can still do this. The guard chain must stop asking "did you read the row?" and start
asking "is this push derived from the row I read?", and a device copy that diverges from the server
must be surfaced to the person, never silently pushed.

## The fix pass

One commit per group; the owner approves each before the next begins.

| Group | What | Status |
|---|---|---|
| 1 | **Data** — identity ordinals (highest + 1, all six sites), delete cascades to cable runs, Placement undo reverses the actual last action | **DONE** · `7df33e4b` · 1,995 tests pass · verified live on ASC0122 |
| 2 | **Flow** — nav popup on open (R1), start at Background (R3), Back no longer stuck at Layout + the nav Background item works (R2), floor picker off Camera Angles and Approval (R4), an explicit "Use this background" on Background | **DONE** · `918ff739` · 2,009 tests pass · verified live on ASC0122 |
| 2b | **R5 — hybrid view on Placement and Route** | **NOT DONE, reported.** The draw tool emits a plan layer only with BOTH a seed and a context (`planLayerSVG`, draw-floorplan.html); a floor whose base was never traced has neither, so there is no aerial handed back to save. Real instance: **ASC0056 floor 1** — aerial present, `bgSource` satellite, `ctx` absent. The fix is a full-extent context mode inside the draw tool: geometry that feeds the customer layout and the proposal PDF, so it needs live alignment checks. Owner decides whether to take it on. |
| 3 | **Misleading screens** | **DONE** · `e47b9564` · 2,031 tests pass · verified live. Note: the "1 Issue" badge was the **Next.js dev overlay**, not our UI — but it was reporting a real hydration mismatch (a literal style tag inside a comment in the planner stylesheet), now fixed. |
| 4 | **Mobile** — full walkthrough at 375px | not started · blocked on the PIN (see queued item 2) |
| — | **Close-out** — rerun the whole walkthrough on desktop and phone, update `survey-walkthrough.md` with pass/fail for every rule | not started |

## Open decisions from Group 1 — the owner's call

| # | Item | Why it is open |
|---|---|---|
| D1 | **DONE** · ASC0122 repaired (`IC5`->`IC7`, "Camera 4"->"Camera 6"); ASC0112 hand-typed duplicates left alone by design. Prod still to run. Original note: **Repair the duplicate tags/names already in stored surveys.** ASC0122 still carries an `IC5 / Camera 4` pair minted by the old count-based rule. | **STILL OPEN — the owner decides.** Touches fingerprints and real customer data, so it is outside what gets decided without them. `survey2Meaning` hashes `name`: renaming a stored device moves the fingerprint of an already-signed survey. New duplicates are impossible now; repairing old rows is a separate, scoped job. |
| D2 | **A stray tap dropped a device**, because arming outlived the placing. | **DONE** · `3b77fc2e` · arming survives consecutive taps (eight cameras in eight taps) but not a move, delete, rename, undo or right-click. |

## Queued after the fix pass — do not start until the owner says

**Q1 — ASC0055 restore. Investigate only, no writes.**
The data is **node:sqlite on Hostinger** — `lib/db.js` → `dbDir()` → `dashboard.db`, where
`project_tool_data` holds ASC0055's `survey2` row. Not Supabase. The backup to find is therefore a
**Hostinger backup containing `dashboard.db`**.

1. Use Claude in Chrome on **Hostinger hPanel ▸ Backups**; the owner handles the login.
2. List the available backup dates.
3. **Restore nothing.** Not over the live database, not anywhere.
4. Download or extract **only `dashboard.db`** from the newest backup dated **before** Floor 2's
   cameras (Camera 7–13 plus Cash) turned into NVR 29–38.
5. Open that file **read-only**, locally (`new DatabaseSync(path, { readOnly: true })`).
6. Show ASC0055's `survey2` **Floor 2 devices side by side with today's**.
7. **Wait for the owner's OK before writing anything back.**

> Context that shapes the job: `project_tool_data` keeps **no version history** — one row per
> project+tool, overwritten in place. A point-in-time file backup is the only route to the original
> Floor 2 devices, so dating the backups against the change is the whole task.

**Q1 progress (2026-11-23) — backup dates listed, nothing downloaded or restored.**
Hostinger ▸ iot-techs.com ▸ Files ▸ Backups ▸ Restore and download ▸ **Files backup** (not the
"Database backup" tab — that is MySQL, and this app stores SQLite as a file). Daily automated.
18 restore points available:

```
2026-11-23 02:30   2026-11-22 02:30   2026-11-21 02:30   2026-11-20 02:30
2026-11-19 02:30   2026-11-18 02:30   2026-11-17 02:30   2026-11-16 02:30
2026-11-15 02:30   2026-11-14 02:30   2026-11-13 02:30   2026-11-12 02:30
2026-11-11 02:30   2026-11-08 02:30   2026-11-01 02:30   2026-10-25 10:55
2026-10-18 06:48   2026-10-11 06:41
```

Still needed before a backup can be called "before the change": the date Floor 2 changed. The
in-app row carries no history, so the way to find it is to read ASC0055's `survey2` row out of
candidate backups and compare — which means downloading `dashboard.db`, and that waits for the
owner. Hostinger also warns that "database export files" are excluded from backups; that means
`.sql` dumps, but whether `dashboard.db` is actually inside the archive is unconfirmed — the
backup file browser sat on "Loading files" and was not retried.

**Q2 — Phone test.** When Group 4 runs, **ask the owner to enter the PIN in the Claude browser pane.
Never enter it.** (Claude in Chrome cannot resize the owner's maximized window; the pane can emulate
375×812 but has its own cookie jar and lands on the PIN screen.)

**Q4 — AI pre-fill from a location photo.** Owner spec, 2026-11-23, item 5 of a list whose other
items have not arrived. NOT STARTED.

When a location photo is added, send it to Claude (Sonnet, vision) and suggest:
**mount surface · mount height / ladder needed · junction box · indoor/outdoor.**

- Every suggestion carries a **confidence** and is shown AS a suggestion.
- The tech **confirms or changes every field**. **Nothing counts as filled until a person confirms
  it** — an unconfirmed suggestion is not a value, and must not satisfy any gate, count toward
  completeness, or reach a customer surface.
- **Cable new vs existing stays manual.** A photo cannot tell whether a line works.
- The stored photo stays at **original size**; a **~1,000 px copy** goes to the AI.

Where it plugs in:
- Vision calls already have a pattern — `app/api/read-licence/route.js` proxies to
  `https://api.anthropic.com/v1/messages` with the server-held `ANTHROPIC_API_KEY`
  (`secretValue()`), client never sees the key. A new route should copy that shape, not re-invent it.
- Use the current Sonnet (`claude-sonnet-5-5`); check whatever model id the existing route sends
  before copying it, since it may predate the 5 family.
- Photos already move through `/api/media` (HEIC-safe). The downscaled copy is for the request only
  and is not something to store twice.
- The new fields belong on the device record. `survey2Meaning` hashes only
  `k/x/y/aim/fov/range/name` — so adding them is **signature-safe**, as long as they are NOT added
  to that allow-list.
- Suggestions, confidences and the model's reasoning are **internal**: role-visibility pass before
  anything renders, and nothing of this reaches the customer layout or the PDF.
- One paid vision call per photo: gate it behind the key being present, and behind a flag, so a
  survey with forty photos cannot quietly run forty calls.

> **CONFLICT to resolve before building — indoor/outdoor is already a DERIVED value, not a field.**
> `lib/survey-placement.js` `placementOf()` decides inside/outside geometrically from whether the
> device sits in a painted structure cell, and the owner's own earlier rule was that there is no
> manual indoor/outdoor field and only two states. Having the AI suggest it, and a tech confirm it,
> creates a second source of truth for the same fact and the two will disagree.
> Suggested resolution: the AI value is a **cross-check, not a field** — when it disagrees with the
> derived placement, raise it (a device the plan says is inside but the photo says is outdoors
> usually means the structure is drawn wrong, which is useful). The other three fields are new and
> have no such conflict. Owner decides.

**Q3 — Layout redesign.** Only after everything above passes. The map fills the screen on desktop and
phone; devices move to a side panel on desktop and a pull-up sheet on the phone; toolbars never cover
the drawing. Write the plan to `docs/survey-layout.md` **with mockups** and wait for the owner's OK
before building.
