# Site Survey — walkthrough audit

**Status: desktop walkthrough COMPLETE (steps 1–9). The 375px pass is BLOCKED** — see
"The 375px pass" near the end for the two one-step ways to unblock it.
Test-and-report only — nothing in this audit was fixed, committed or deployed.
**14 bugs found; the ranked fix list grouped by root cause is at the end.**

- **Environment:** `localhost:3100`, Claude in Chrome, one tab on the survey.
- **Project:** `ASC0122` — **[JOURNEY-TEST] Riverside Diner**. No real customer project was touched.
- **Date:** 2026-11-23. Build at audit time: `6d598887` for steps 1–2, `419e4803` for steps 3–9
  (the `placeAt` fix landed mid-audit as the one approved exception; see below).

**One fix was made during this audit, with the owner's explicit approval, and nothing else.**
Walking step 4 surfaced that `placeAt` had been shipped broken in `ef5350cc` — a `//` comment
appended to the guard line had swallowed `var p=planPctFromClient(cx,cy)`, so the function threw
`ReferenceError: p is not defined` and **no device could be added to any survey**. 1,977 tests missed
it because they assert the guard's *shape*, and the file still parsed. Fixed in `419e4803` with a
test that actually executes `placeAt` (`tests/survey-place-device.test.mjs`), and confirmed live:
an NVR and four cameras placed on ASC0122. Every other same-shaped edit from that day was swept;
only the one instance existed.

## Why not production

Production has **no journey-test projects** — the app's own search returns *"No results for 'JOURNEY'"*,
and all 19 projects there are real customers. The journey-test set is a local-only harness. Since this
walkthrough deletes and re-adds devices by design, and ASC0055 still has an unexplained device problem
with no backup, it was run locally. The owner agreed and explicitly ruled out the prod Demo button,
which writes to the same database ASC0055 lives in.

---

The full rule scorecard is at the end of this report, after the evidence it rests on.

---

# Where the tool thinks the flow starts

**Your rule:** Background.
**The tool:** **Layout.**

On a survey with *nothing saved at all* (`savedLastStep: null`), measured on load:

```
railOnLoad            "Layout"        ← the host rail
widgetInternalStep    0               ← the widget is on Background
bgChooserVisible      "block"         ← "What's the base for this floor?" is on screen
workingVisible        "none"
navPopupOnLoad        false
```

The rail and the canvas **disagree on a brand-new survey**: the footer says Layout while the canvas is
asking for a background. Root cause is a hard-coded default in two places — `useState(() => initialStep
|| "layout")` in `system-planner.jsx`, and `surveyLastStep()` which also returns `"layout"` when nothing
is saved (there is a test asserting that: *"no saved step → the old default"*). Neither consults whether
a background exists.

---

# Walkthrough

## Step 1 — Open Site Survey

**Clicked:** opened `/project/ASC0122?view=survey`.
**Expected (rule 1):** Survey Navigation opens as a centre popup, every time.
**Actual:** no popup. It lands directly on the canvas with the rail reading **Layout** and the
background chooser showing.

- Screenshot: landing state — floor bar, "What's the base for this floor?" (Satellite / Upload / Draw),
  footer `‹ Back · Layout ^ · Placement ›`.

**BUG 1 — Survey Navigation never auto-opens. Severity: Medium.**
Reproduce: open any project's survey. Expected a centre popup; got the canvas.
Root cause: nothing calls the nav popover on mount — `renderNavPop` is driven only by the ••• and the
footer centre button. The resume path (`surveyLastStep` → `goRail`) is what runs instead.

**BUG 2 — The rail claims Layout on a survey with no background. Severity: Medium.**
Reproduce: open a project that has never had a survey. Rail reads Layout; canvas asks for a base.
Root cause: the `"layout"` default described above, taken without checking `bgReady`.
Same root cause as BUG 1's resume behaviour — see fix group A.

**Observation — a red "1 Issue" badge sits bottom-left from the moment the survey opens**, before any
work has been done. Not yet investigated; logged for the next pass.

## Step 2 — Background: set a satellite address

**Clicked:** Satellite.
**Expected:** an address field and a map.
**Actual:** works. The address field is **pre-filled** with the project's own address
(*100 Demo Street, Springfield, IL 62700*) — a good smart default, no retyping. Map and pin load.
The rail corrected itself from Layout to **Background** once the tool opened.

- Screenshot: satellite view, address pre-filled, dock reading `Level · Crop · Enhance`.

**BUG 3 — A brand-new survey shows a red "Not saving" badge before you have done anything.
Severity: Medium.**
Reproduce: open a project with no survey; the badge appears immediately.
Measured: the local blob is the empty placeholder —
`{"floors":[{"name":"Floor 1","bg":null,"devices":[],"started":false,…}]}` — and the outbound gate
refuses empty surveys *on purpose* (that gate is what stops an empty blob overwriting a real survey).
So the refusal is correct; **the presentation is not.** `st.blocked` renders as a red alarm reading
"Not saving" with the title *"This device's copy can't be read — it is not being saved"*, which
describes corruption, not "there is nothing to save yet". It cleared by itself once real content
existed. Root cause: one status flag covers both "your copy is broken" and "your copy is empty".

Also worth noting: `snapshot()` reports `blocked: _status.blockedKeys.size ? … : null` — **any** blocked
key sets it, while the comment directly above claims it is per project:tool. On this project only the
survey was blocked, so the badge happened to be about the survey; with a blocked mockup or schedule it
would say the *survey* is not saving.

**BUG 4 — There is no way to accept a satellite background. Severity: Low (clarity).**
The dock offers `Level · Crop · Enhance` and nothing else. The only way forward is the footer's Next,
which silently doubles as the commit (`bgToolOpen==="satellite"` → `iotCaptureCommit`). Nothing on
screen says that Next will commit the capture.

**Measured after committing:**

```
bgHasImage true · floorHasBg true · ctx.src TRUE
bgCtx false · planSvg false  →  hybridCapable FALSE
bgToolOpen "draw"   (the Structure editor auto-opened)
blob 328 → 1433 bytes · "Not saving" badge cleared
```

This is the key finding for rule 4: **hybrid capability needs two halves.** The satellite capture sets
`ctx.src`; `bgCtx` and `planSvg` are only set when the **draw** tool returns a plan. A floor is
`hybridCapable` only with all three. ASC0055 Floor 1 is the mirror image — it has a plan but no `ctx`,
because its structure was drawn without a satellite base first — which is exactly why Placement and
Route show no photo there.

## Step 3 — Layout: draw the structure, name rooms

**Did:** painted the building footprint on the grid (1080 cells), named two rooms (Kitchen, Dining).
**Actual:** works. After Background → Layout **in that order**, the floor measured
`ctx.src true · bgCtx true · planSvg true → hybridCapable TRUE`, and the aerial does render under the
plan. **This is the rule-4 control case**: the hybrid view is not broken in general — it requires the
satellite capture to happen *before* the structure is drawn, which is the documented order.
ASC0055 fails it because its structure was drawn with no satellite base, so `ctx` was never set.

Floor picker present (rule 3) — `Floor 1 ▾ +` on the floor bar.

## Step 4 — Placement: add, rename, delete, re-add, move

**Did:** added 1 NVR + 4 cameras, renamed 2, deleted 1, added it back, moved one.

Everything functions. Smart defaults are good: cameras auto-name (`Camera 1…4`) and auto-resolve their
room from the painted structure (`Kitchen 1`, `Kitchen 2`, `Dining 1`), placement derives as `inside`
with no manual field, and tags issue as `IC1…IC5`. Moving a device persists exactly (live and saved
agree to the decimal), and a manual name **survives** a later move rather than being overwritten by
the new room — correct.

**BUG 5 — Delete a device, add another, and the new one takes the deleted one's ID and name.
Severity: HIGH. This is the most serious finding in the audit.**

Reproduce (done on ASC0122, evidenced):
1. Add 4 cameras → `IC2 Camera 1`, `IC3 Camera 2`, `IC4 Camera 3`, `IC5 Camera 4`.
2. Delete `IC4`.
3. Add one more camera.
4. The new camera is **`IC5` / "Camera 4"** — a tag *and* a name that already exist.

Measured straight after: `dupTags: ["IC5"] · dupNames: ["Camera 4"]`, and the collision is **written to
the saved blob**, not just held in memory:

```
"devs": [ … {"tag":"IC5","name":"Camera 4","x":70.51,"y":31.82},
              {"tag":"IC5","name":"Camera 4","x":61.41,"y":31.82} ]
```

Root cause: the ordinal is a **count, not a maximum**. Four sites in
`public/widgets/site-survey-merged.html` compute it the same way —
`…devices.filter(…).length + 1` at **2418 / 2419** (`addDevice`), **2428 / 2429**
(`addUnplacedCamera`) and **3138 / 3139** (`reAdd`, the undo/redo path). Any delete frees an ordinal
that the next add then re-issues. `reAdd` being one of them means **undo/redo can mint duplicates
too**, not just delete-then-add.

Why it matters beyond the widget:
- The internal `id` stays unique (1,2,3,5,6), but **`id` is not persisted** — `stripDevs` drops it and
  it is re-derived on load, so after a reload the two devices are distinguishable only by coordinates.
- `lib/survey2-model.js:182` passes `d.tag` straight through as the device `code`, and `:190–191`
  take `name` for the label and identity. So a duplicate reaches the **customer's "Your System
  Layout" and the proposal PDF's SITE SURVEY pages** as two devices both labelled C5 / "Camera 4".
- `survey2Meaning` hashes `name`, so two identical names also make the approval fingerprint
  ambiguous between two different physical devices.
- This is a plausible mechanism behind the ASC0055 device problem and should be read alongside that
  report. **Not fixed, per the audit's terms.**

*Checked and clear:* routes are NOT affected — `rtDevKey` keys on `cid`/`id` (2094), not the tag, so
cabling stays attached to the right device.

**BUG 6 — Rename and delete use the browser's own `prompt()` / `confirm()`. Severity: Medium.**
`dcRename` (1697) calls `window.prompt("Name this device")` and `eraseDevice` (1718) calls
`window.confirm("Delete …?")`. Three native dialogs in the file. These are OS-chrome modals in a
vault-dark tool — against the UI constitution — and they are untestable by automation because they
block the page. The in-tool rename elsewhere is inline; this path should match it.

**Observation — a cable run deletes on a single tap with no confirmation**, while deleting a *device*
confirms. Mitigated by route undo, but the two destructive actions in one step behave differently
(rule 6).

*Checked and clear:* the add-device menu holds 23 kinds and **scrolls** (`scrollHeight 509 >
clientHeight 345`), so every kind is reachable — not the clipping it first appeared to be.

## Step 5 — Route: head-end, runs, delete, redraw, move

**Did:** placed the head-end on the NVR, drew a home run from every camera, deleted one and redrew it,
moved the head-end, and drew two runs over a shared path to test bundling.

This step is in good shape — the recent work holds up:

- **Head-end `+` → tap the map** works, and snapped onto the NVR (head `44.07,62.3` vs NVR
  `44.086,62.394`). Persisted.
- **Cable picker** is the top-left `+` dropdown as specified — Cat6 ✓ / Speaker wire / HDMI / Power.
- **Runs** commit on tap-device → tap-head, each anchored to its own `cid`; 4 runs, all saved.
- **Delete a run** by tapping it works and persists, and the redraw correctly **re-uses the freed id**
  (`r1`), rather than climbing.
- **Moving the head-end takes every home run with it** — all 4 endpoints moved from `44.07,62.3` to
  `73.76,53.31` in one step, server copy included. `rtReanchorHomeRuns` does its job.
- **Bundling works.** Two runs sharing one leg produced exactly one bundle —
  `{"1|5": {a:[62,38.08], b:[73.76,53.31], n:2, mixed:false}}` — with the `2` badge drawn on the
  shared segment. Four runs that merely *converge* on the head produce no bundle, which is correct:
  they share a point, not a path.
- **Escape cancels a half-drawn run cleanly** (`rtDraft: null`, no stray geometry, 6 runs intact).
- Device dragging is correctly disabled while routing — a canvas drag on Route does not move a camera.

**BUG 7 — The head-end control moves position once a head exists. Severity: Low.**
Before placing, it is `#rtHeadAdd` at bottom-**right** (as instructed: "keep the + bottom-right").
After placing, that button goes `display:none` and a second control — `.rtBtn.on` titled "Head-end"
inside `#rtBar` — renders at bottom-**centre**. Two controls for one job, and the target moves
mid-task.

**Observation — arming the head-end gives no visible mode feedback.** `rtHeadMode` goes true, but the
body class, cursor and canvas are unchanged and there is no hint; the only signal is the button's own
state. Tap `+` and look away and you cannot tell you are armed. (Cancelling is clean, so this is
cosmetic.)

## The sync chip — one status flag for every tool

While routing, the status chip turned red: **"Changed elsewhere · Reload"**, in a single tab with no
second editor. Investigated, because that is the ASC0055 failure mode.

**The survey was saving correctly the whole time.** Evidence — after the banner appeared, a camera
move went straight to the server:

```
server rev  9af3e1f807dcc2d1 → faded2503d6d35e7      updated_at 06:43:53
local 91,663 bytes  ==  server 91,663 bytes          byte-identical
DB row: project_tool_data ASC0122/survey2, 91,661 → 91,663 bytes
```

**BUG 8 — The sync chip aggregates every tool but presents as the survey's. Severity: Medium.**
`app/project/[accessId]/tool-sync.js:241` reports `conflict: _conflicts.size ? … : null` and
`blocked: _status.blockedKeys.size ? … : null`. Both sets are keyed **per project:tool**, but the
chip reads `.size` — so a conflict or block on *any* tool (the mockup row here, 68 bytes) renders as
**the survey's** status, complete with a Reload button, while the survey is saving perfectly. This is
the same root cause as BUG 3 ("Not saving"), and it is how a healthy survey can look corrupted.

**BUG 9 — A conflicted key never retries until the page is reloaded. Severity: Medium (code read,
not reproduced for survey2).** `tool-sync.js:283` short-circuits the autosync loop on
`_conflicts.has(mapKey)`, and the only clear paths are a fresh seed (276) or a successful push (317)
— which 283 prevents. So for the tool that *is* conflicted, edits stop reaching the server until a
reload, with the chip as the only warning. Given BUG 8, the user cannot tell which tool that is.

## Step 6 — Undo / redo on every step

**Rule 6 — "undo/redo only affects the current step" — HOLDS. Not once did an undo on one step touch
another step's data.** That is the part that was reported broken and it is genuinely fixed. But undo
is wrong *within* Placement.

| Step | Undo | Redo | Crossed into another step? |
|---|---|---|---|
| Layout | no-op | — | no (devices, routes, `planSvg` all unchanged) |
| Placement | **wrong — see BUG 10** | correct, restores `cid` | no (routes + head untouched) |
| Route | correct | correct | **no — devices stayed 5 through 3 undos** |

**Route, verified in detail:** three undos removed `r6`, `r5` and reverted the head-end move
(`73.76,53.31` → `44.07,62.3`); device list stayed `IC1 IC2 IC3 IC5 IC5` throughout. Three redos
restored all six runs and the head position exactly. **The originally reported bug — "undo/redo on
the Route step removes cameras" — is fixed and confirmed.**

**BUG 10 — On Placement, undo ignores moves and deletes a device instead. Severity: HIGH.**
Reproduce: move a camera, then press undo.
Measured: before — 5 devices, `IC2` at `41.192,42.568` (the move). After one undo — **4 devices**, and
`IC2` **still at `41.192,42.568`**. The move was never undone; undo popped the most recent device
*add* instead. A second undo removed another camera (down to `IC1 IC2 IC3`).
So pressing undo after moving something silently deletes a different device you did not touch — the
most destructive behaviour found in this audit. Moves are not in the Placement undo stack at all.

**BUG 11 — Deleting a device leaves its cable runs behind, as saved orphans. Severity: HIGH.**
`removeDevice` (widget 2968–2972) never touches `f.routes`; the only route filter in the file (2207)
removes by *route* id. So every path that removes a device — the context-menu Delete, the panel's ×,
and undo of an add — strands that device's runs.
Measured right after the two undos above: **4 of 6 runs orphaned** (`r3 r4 r5 r6`, pointing at cids
`ctw81b39` / `cyqn11gq` that no longer existed), and **persisted that way** — saved blob held 3
devices and 6 routes. Those orphans feed the wiring diagram and the work order as cable runs to
devices that do not exist.
*Mitigating:* redo restores a device with its original `cid`, so the runs re-attach (verified: 0
orphans after redo). The orphans only become permanent if you don't redo.

## Step 7 — Camera Angles, then Approval

Both render. **Camera Angles** is the per-camera photo viewer (`View 1 of 4 · CAM 1–1`) with a
"No Photos Available / tap · drop · paste" empty state and **Skip ›** as the forward action — gating
on the earliest valid signal rather than blocking, which is right.

**I deliberately did not press Approval.** Submitting would lock the survey (`frozen()`) and change
project state, which is outside a read-only audit. Everything up to that button was exercised.

**BUG 12 — The Approval step says READY and "Everything looks complete" while the same card says
4 photos are missing. Severity: HIGH (this is the gate that sends a survey to the customer).**
Measured on arrival, before any reload:

```
Review  [READY]   "Everything looks complete — ready to send for approval."
Floor 1 · 4 cameras · [4 missing photos]
"4 cameras total · 4 still need a photo"
```

After a reload, with **identical** underlying counts, the same step reads:

```
Review  [INCOMPLETE]   OPEN ITEMS → Floor 1 · 4 cameras need a photo
```

So the READY verdict and the "4 missing photos" badge beside it are **not derived from the same
facts** — the verdict reflects the facts as of page load and does not account for work done in the
session, while the badge does. The post-reload answer is the correct one. A survey edited and
submitted in one sitting can therefore show READY when it is not.

**BUG 13 — Approval leaves ~600px of empty pane. Severity: Low (visual).**
Measured: shell 768px tall, Approval content ≈130px, no canvas (plan pane and iframe both height 0).
The shell keeps its full plan-height reservation on a step that has no plan.

**Copy (constitution):** "Review" + a READY/INCOMPLETE pill + "Everything looks complete — ready to
send for approval." is three statements of one fact, and the sentence is instructional copy sitting
above an obvious button. The button itself is labelled **"Approval"** — the step's own name rather
than a verb ("Submit" / "Send").

## Step 8 — Reload three times

**The headline result: a reload does not corrupt anything.** Devices, routes, head-end, names and
tags all survived three reloads unchanged, and the server row matched local every time.

| | bytes | hash | devices | routes | head |
|---|---|---|---|---|---|
| before reload | 91,663 | `d024137b2b288662` | IC1 IC2 IC3 IC5 IC5 | 6 | 73.76, 53.31 |
| reload 1 | **91,648** | **`7bcdf35d83e6dcb1`** | identical | 6 | identical |
| reload 2 | 91,648 | `7bcdf35d83e6dcb1` | identical | 6 | identical |
| reload 3 | 91,648 | `7bcdf35d83e6dcb1` | identical | 6 | identical |

**Observation — the first reload after an editing session rewrites 15 bytes.** A structural diff of
reload 2 vs reload 1 found **zero** differences, and re-running the widget's own `queueSave()` now
reproduces the stored bytes exactly, so the current state is a fixed point. The 15 bytes were a
mid-session transient that the reseed normalises away; it is semantically lossless and converges
after one reload. The exact field was **not** isolated (it no longer reproduces from this state).
Worth naming before anyone treats a byte-level diff on a survey row as evidence of corruption — on
this evidence, a one-off 15-byte change across a reload is **normal**, not damage.

The reload also **cleared the "Changed elsewhere" banner**, which is the documented recovery path
(`tool-sync.js:276`, a fresh seed clears the conflict).

## Step 9 — Survey Navigation jumps, and Next / Back

**Forward order is correct (rule 2, forward half: PASS).** Walking Next from Layout:
`Layout → Placement → Route → Camera Angles → (Skip) → Approval`. Every Next went to the next step,
never further.

**Back is correct until it reaches Layout:**
`Approval → Camera Angles → Route → Placement → Layout → Layout → Layout…`

**BUG 14 — Background is unreachable once a base is set, and Back on Layout is a dead control.
Severity: Medium.** Measured: four consecutive Back presses from Layout all stayed on Layout, and the
Back button stayed **present and enabled** (`disabled: false`) rather than disappearing on what the
tool treats as the first step. Clicking **Background in Survey Navigation also did nothing** — still
Layout, next still Placement. So the only step you cannot jump to via Survey Navigation is the first
one, even though the popover lists it with a ✓.
Root cause is the same as BUG 2: Background and Layout share one widget mode (the body carries
`bgtool` on both), so the host rail cannot distinguish them and neither control can move between
them. Either Background should be reachable — showing the current base with a replace option — or
the nav should show it locked, rather than offering an item that silently does nothing.

**Survey Navigation itself is good:** correct order, completion ticks on the done steps
(Background ✓ Layout ✓ Placement ✓), the current step outlined, and a separate TOOLS section
(Full screen). Its only faults are that it never auto-opens (BUG 1), Background does nothing
(BUG 14), and **Route never earns a tick** even with a head-end and six cable runs saved.

**Observation — the footer moves vertically between steps** (measured at y≈477 on Layout/Placement/
Route, y≈516 on Camera Angles, y≈355 on Approval), because each step's pane is a different height.
Next and Back are the two most-used controls in the tool and they are not in a stable place.

## Rule 8 — read-only means customers only

**PASS.** Previewed as the customer (`?preview=customer&view=survey`) on the same project:

```
RO true · body class "ro planner embed no-fov"
addDeviceBtn none · undoBtn none · rtHeadAdd none
devices 5 (visible, not editable) · no payout/margin/cost/commission anywhere in the page text
footer: "Being prepared — we'll notify you."
```

The customer sees the plan and devices, gets no step rail and no editing affordances, and is given an
"awaiting" state rather than a blocked screen — which is the house rule. Staff editing on the same
project is unaffected.

**Observation for the role matrix — the customer sees the cable runs.** The routing lines render in
the customer view. That may well be intended (it is their system layout), but the wiring diagram was
specified as the thing that feeds the **work order**, so it is worth a deliberate decision rather than
inheriting it by default.

## The 375px pass — BLOCKED, not done

I could not run it, and I am not going to report a mobile pass I did not perform.

- **Claude in Chrome cannot resize this window.** `resize_window` returns success but the viewport
  stays 1920×897 (`window.innerWidth` unchanged after requesting both 375×812 and 1000×800). The
  Chrome window is maximized and the extension's resize is a no-op against it.
- **The built-in browser pane *can* emulate 375×812** — and does, correctly — but it has its own
  cookie jar and lands on the **PIN screen** for `localhost:3100`. PINs are the owner's; I did not
  enter one.

**To unblock, either** un-maximize the Chrome window (then I can resize it and run the pass), **or**
enter the PIN once in the Claude browser pane.

What can be said without measuring: the mobile rules exist and look deliberate, not accidental —
`@media (max-width:700px)` collapses the devices roster to a one-line "Devices (N)" toggle
(`system-planner.jsx:944`), wraps the footer so the step label stays dead-centre on row one and the
CTA drops to row two (`:1076`), and clamps the plan frame to the plan's own aspect rather than a
fixed height (`:1162`). **This is a code read, not a verdict** — the 375px walkthrough is still owed.

---

# Rule scorecard — final (desktop)

| # | Rule | Verdict | Why |
|---|---|---|---|
| 1 | Survey Navigation opens as a centre popup, every time | **FAIL** | never auto-opens (BUG 1) |
| 2 | Steps in order; Next goes to the next; jumps via Survey Navigation | **PARTIAL** | forward is perfect; Back dead-ends on Layout and the nav cannot reach Background (BUG 14); rail and canvas disagree on a new survey (BUG 2) |
| 3 | Floor picker on Background / Layout / Placement / Route only | **FAIL** | also visible on Camera Angles and Approval |
| 4 | Placement and Route show the same hybrid view as Layout | **PASS**, conditionally | true on a floor built in the documented order (`ctx.src` + `planSvg` + `bgCtx`); fails on floors whose structure was drawn with no satellite base first — which is ASC0055 |
| 5 | Everything can be added, edited, deleted | **PARTIAL** | all four operations work, but delete-then-add duplicates a device's identity (BUG 5) and any delete orphans its cable runs (BUG 11) |
| 6 | Undo/redo only affects the current step | **PASS** * | never crossed steps in any test — the reported Route bug is fixed. *But Placement's undo is itself wrong and destructive (BUG 10) |
| 7 | A reload never changes anything | **PASS** | three reloads, no semantic change; one benign 15-byte normalisation on the first |
| 8 | Read-only means customers only; staff can still edit | **PASS** | verified in customer preview |

Not scored: the 375px pass (blocked, above).

# Ranked fix list, grouped by root cause

**Group A — device identity (the one to fix first)**
1. **BUG 5** — ordinals are `count + 1` instead of `max + 1`, at widget **2418/2419, 2428/2429,
   3138/3139**. One shared helper that takes the maximum existing ordinal fixes all six lines and
   closes the undo/redo path at the same time. Duplicates already reach the customer layout and the
   proposal PDF via `survey2-model.js:182`.
2. **BUG 11** — `removeDevice` (2968) must drop `f.routes` entries whose `dev` matches the device
   being removed, the way `rtDeleteRun` (2207) drops by route id. Keep the redo path's `cid` restore
   working so an undone delete still re-attaches.

**Group B — undo on Placement**
3. **BUG 10** — moves never enter the Placement undo stack, so undo silently deletes an untouched
   device. The Route step already has the right shape (`rtHistPush` on every committed change);
   Placement needs the same.

**Group C — the step model treats Layout as the start**
4. **BUG 2 / BUG 14 / BUG 1** — one root cause: Background and Layout share a widget mode, and the
   host defaults to `"layout"` in two places (`useState(() => initialStep || "layout")` and
   `surveyLastStep()`). That is why a new survey shows the wrong rail, why Back dead-ends, why the
   nav's Background item does nothing, and it sits next to the nav-popup rule that is simply not
   implemented. Fix the step model once and all four move together.

**Group D — status that does not match the facts**
5. **BUG 12** — the Approval READY verdict is computed from page-load facts while the "missing
   photos" badge beside it is live. They must read the same facts; the gate is the one place a stale
   "complete" is expensive.
6. **BUG 8 / BUG 3 / BUG 9** — `tool-sync.js:241` reports `.size` on per-tool sets, so one tool's
   block or conflict is displayed as the survey's. Make the chip per-tool, give "nothing to save yet"
   its own wording distinct from "your copy is broken", and let a conflicted key retry after a
   successful reconcile instead of waiting for a reload (line 283).

**Group E — surface**
7. **BUG 3 (presentation half)** — "Not saving" on a brand-new empty survey.
8. **BUG 6** — replace `prompt()`/`confirm()` with the in-tool inline rename and the existing
   confirm pattern.
9. **BUG 7** — one head-end control in one position, not two.
10. **Rule 3** — hide the floor picker on Camera Angles and Approval.
11. **BUG 13** + the footer moving vertically between steps — give the shell a stable footer position.
12. **Copy pass on Approval** — drop "Everything looks complete — ready to send for approval.",
    label the button with a verb, and let the pill carry the state alone.
13. **Route never earns a completion tick** in Survey Navigation despite a head-end and six saved runs.
14. The red **"1 Issue"** badge is present from the moment the survey opens, before any work — still
    unexplained, logged in step 1 and never resolved during this walkthrough.

# Optimization ideas (not defects)

- **`cid` for everything, not just cameras.** `rtDevKey` falls back to `"id" + d.id` for non-cameras,
  and `id` is not persisted — it is re-derived on load. A run anchored to an NVR is therefore bound to
  a number that is regenerated on every load. Giving every device a stable `cid` would make routes
  durable by construction. (No breakage observed; this is a latent sharp edge.)
- **One tag authority.** Tags are re-derived from floor composition on load, which is why they renumber
  silently. If the tag is the device's public identity — the C7 decision — it should be minted once and
  stored, not recomputed.
- **The device menu is 23 flat items** in a scrolling list. It works, but grouping would make the
  long tail (fire, hazard, keypad…) findable without scrolling.
- **The audit harness itself:** every measurement in this report was taken through the widget's own
  state and the `/api/tool-data` row. That pairing — live object vs saved blob vs DB row — caught both
  the duplicate-tag persistence and the false conflict, and would make a good standing check.

---

*Audit complete for desktop, steps 1–9. Nothing in it was fixed, committed or deployed.
The 375px pass remains owed and is blocked as described above.*
