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

## The fix pass

One commit per group; the owner approves each before the next begins.

| Group | What | Status |
|---|---|---|
| 1 | **Data** — identity ordinals (highest + 1, all six sites), delete cascades to cable runs, Placement undo reverses the actual last action | **DONE** · `7df33e4b` · 1,995 tests pass · verified live on ASC0122 |
| 2 | **Flow** — nav popup on open (R1), start at Background (R3), Back no longer stuck at Layout + the nav Background item works (R2), floor picker off Camera Angles and Approval (R4), aerial saved to the floor when the structure is drawn so Placement and Route always match Layout (R5), an explicit "Use this background" on Background | not started |
| 3 | **Misleading screens** — Approval never READY with open items, no "Not saving" or "1 Issue" on a clean new survey, no false "Changed elsewhere" leaking from another tool, Approval fills the screen | not started |
| 4 | **Mobile** — full walkthrough at 375px | not started · blocked on the PIN (see queued item 2) |
| — | **Close-out** — rerun the whole walkthrough on desktop and phone, update `survey-walkthrough.md` with pass/fail for every rule | not started |

## Open decisions from Group 1 — the owner's call

| # | Item | Why it is open |
|---|---|---|
| D1 | **Repair the duplicate tags/names already in stored surveys.** ASC0122 still carries an `IC5 / Camera 4` pair minted by the old count-based rule. | `survey2Meaning` hashes `name`, so renaming stored devices moves the fingerprint of an already-signed survey. New duplicates are now impossible; repairing old rows is a separate, scoped job — unsigned surveys only, with a dry run first. |
| D2 | **A stray tap still drops a device.** Arming persists after a placement, so a mis-aimed click adds a camera (it happened during Group 1 testing: it minted `IC7 / Camera 6` correctly, then had to be deleted). | Not in any listed group. Fold into Group 2, or leave. |

## Queued after the fix pass — do not start until the owner says

**Q1 — ASC0055 restore. Investigate only, no writes.**
Use Claude in Chrome on the Supabase dashboard for IOT TECHS; the owner handles any login.
1. List the available backups and their dates.
2. Find the newest one from **before** Floor 2's cameras (Camera 7–13 plus Cash) turned into NVR 29–38.
3. **Never restore a backup over the live database.** Restore to a separate project or branch.
4. Pull **only** ASC0055's `survey2` row.
5. Show the Floor 2 devices side by side with today's.
6. **Wait for the owner's OK before writing anything back.**

> **Resolve first, before this item starts:** the IOT TECHS app on Hostinger runs on **node:sqlite**
> (`lib/db.js` → `dbDir()` → `dashboard.db`), not Supabase — `project_tool_data` is a SQLite table, and
> that is where ASC0055's `survey2` row lives. A Supabase project may exist for something else in the
> business. So the first question of this item is **which store actually holds the row to be compared**,
> and therefore where its backups are. Ask the owner rather than assuming either answer. Everything
> above still applies whichever store it turns out to be.

**Q2 — Phone test.** When Group 4 runs, **ask the owner to enter the PIN in the Claude browser pane.
Never enter it.** (Claude in Chrome cannot resize the owner's maximized window; the pane can emulate
375×812 but has its own cookie jar and lands on the PIN screen.)

**Q3 — Layout redesign.** Only after everything above passes. The map fills the screen on desktop and
phone; devices move to a side panel on desktop and a pull-up sheet on the phone; toolbars never cover
the drawing. Write the plan to `docs/survey-layout.md` **with mockups** and wait for the owner's OK
before building.
