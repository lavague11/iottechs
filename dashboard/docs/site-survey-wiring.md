# Site Survey Wiring Diagram: Spec + Prompt

IOT TECHS FSM platform. New Wiring step in the Site Survey tool: draw cable routes on top of the finished survey, shown to the customer and on the work order. Big change: investigate first, build in stages, demo projects only for testing. Save a copy in the Obsidian vault under Projects/IOT TECHS/.

## The Route step

1. New step "Route". Order: Background → Layout → Placement → Route → Camera Angles → Approval. Added to Survey Navigation in that slot; the Placement step's next button becomes "Route".
2. Background is the finished survey for that floor: floor plan or aerial and placed devices (no angle cones yet, since Route comes before Camera Angles). Routes are drawn on top.
3. Head-end marker: place a rack/NVR marker where runs terminate.
4. Drawing a run: tap the device first, then tap points along the path back to the head-end (or to another device for daisy chain). Free multi-point lines that can pass straight through the structure.
5. Run type per line: Home run (default) or Daisy chain.
6. Cameras stay as numbered circles with their angle cone. Triangles are reserved for risers.
7. Devices are labelled with their existing device IDs (e.g. C7, C14), and the same IDs appear on the work order lines. **Owner decision 2026-11-22: C7, not IC7** — the canonical code in `lib/survey2-model.js` strips the leading `I` on purpose, and the diagram and work order must match what the customer layout, the AI device resolver and every other surface already show. Do not change the canonical code.

   **Indoor / outdoor is DERIVED from placement, never typed.** A device inside the structure drawn on
   Layout is indoor; outside it, outdoor. Computed from the device's position against that floor's
   structure outline (`lib/survey-placement.js` `placementOf`, mirrored in the widget's `rmPlacement`;
   a drift test keeps them equal). There is no manual field and there must never be one — the planner
   already knows the footprint, so a second human-entered answer could only disagree with it.

   It is a derived property, kept **out of the name**: identity (`C7`) ≠ location (`Dining 1`) ≠
   placement. It shows where it is useful — the device roster, the equipment list, outdoor-rated camera
   checks — and `needsOutdoorRating()` treats an unconfirmed device as needing the rating.

   **Two states, one sentence** (owner decision 2026-11-22, simplifying an earlier three-state rule):
   inside the drawn structure is indoor, **anything else is outdoor** — the wall-mount band just off the
   footprint, a device exactly on the outline, and a floor with no structure drawn all read outdoor.
   That default is the safe direction, not merely the simple one: an outdoor-rated housing works
   indoors, while an indoor one in the weather fails, so where the geometry cannot prove a device is
   inside the building, outdoor over-specs rather than under-specs. Structure = painted cells ∪ room
   cells; areas and zones are driveway / yard / parking, i.e. the outdoors, and never count as building.
   Placement is **not** in the approval fingerprint (`survey2Meaning` hashes k/x/y/aim/fov/range/name),
   so recomputing it on an existing survey cannot void a signature — there is a test asserting that.

## Cable types and colours

Bright, near-neon colours with a thin dark outline so they read on white floor plans and aerial photos.

| Cable | Colour |
| --- | --- |
| Cat6 | Neon teal |
| Speaker wire | Neon orange |
| HDMI | Neon purple |
| Power | Neon red |
| Mixed-type bundle | Dark grey + count badge |

## Bundles and risers

1. Where runs share a path segment, they merge into one thicker line with a circle badge showing the cable count, calculated automatically. Tapping a badge lists the runs in it.
2. Multi-floor riser = triangle marker. Pointing up = continues to the floor above; pointing down = floor below. Shown on both floors at the matching spot.

## Editing rules (before approval only)

These are critical; build exactly as written.

1. Tapping a line deletes the whole run (device to head-end), never a partial segment.
2. Tapping a bundled segment opens a picker listing every run in it by device and cable type (e.g. "Speaker 3 · Speaker wire"). Selecting one highlights that exact run on the plan, then confirm delete. The badge count updates immediately and disappears when one run remains.
3. Dragging a point on a bundled segment moves the whole bundle by default.
4. Deleting a middle daisy-chain link warns "Devices X–Y will be disconnected" before confirming.
5. Deleting a run that crosses floors removes it on both floors.
6. Devices with no run show a red outline. Approval shows a warning listing unconnected devices (warning, not a block).
7. Undo reverses any draw, move or delete, including bundle and multi-floor deletes.
8. Lock: once the customer approves the survey, the diagram is locked. Later changes go in notes only (techs use the work order line Notes box).

## Legend and run summary

1. Legend in the corner of the diagram and in every PDF: cable colours, riser triangles, head-end, bundle badge.
2. Run summary under the diagram and in both PDFs, counts only, no footage: "Cat6: 8 runs · Speaker wire: 6 runs · HDMI: 1 run · Power: 2 runs".

## Where it shows

1. Customer: in the survey they approve and in the proposal/survey PDF.
2. Work order: at the bottom, under the line items, with a small "Wiring diagram" button near the top that jumps to it.
3. Work order PDF: one page per floor after the line items, with legend and run summary.

## Opening a submitted or signed survey

1. A submitted or signed survey opens with the Survey Navigation popup already showing, titled "Where would you like to go?" (all steps with checkmarks, plus Tools: Full screen, Walkthrough). Closing it leaves the user on the last step. Applies to every role and entry point, including ?view=survey links. In-progress surveys open as today.
2. It opens view-only: no dragging, placing, drawing or deleting until the user taps an "Edit" button (top right). Moving between steps stays view-only. **Owner decision 2026-11-22: ONE unlock control.** Extend the existing "Edit survey" button in the submit-lock banner — do not add a second unlock beside it.
3. Editing a signed survey does not automatically require re-approval. After saving, an optional "Send for re-approval" button appears; nothing is sent unless it is pressed.

## Verify

On a demo/journey-test project only: place a head-end; draw home runs and a daisy chain with all four cable types; add a riser between two floors; overlap runs so they bundle; delete one run from a bundle through the picker; drag a bundle point; delete a middle daisy-chain link and check the warning; undo each; check red outlines; approve and check the lock. Screenshot each, plus the customer view, work order view and both PDFs. Use the Claude in Chrome extension for browser steps.

## Prompt for Claude Code

```
BIG CHANGE, fully automated. Read /docs/site-survey-wiring.md (also save a copy in my Obsidian vault under Projects/IOT TECHS/). The step is named "Route", order: Background > Layout > Placement > Route > Camera Angles > Approval. Devices use their existing IDs (IC7, IC14...).

Run ALL stages end to end without waiting for my go:
(1) Route step, drawing, head-end, cable types and colours
(2) bundles, risers, editing rules, undo, lock
(3) opening submitted/signed surveys ("Where would you like to go?" popup, view-only + Edit button, optional re-approval), legend, run summary, work order section and both PDFs

For EACH stage: investigate the code first and log conflicts in a "Build notes" section in the file; build; run build and tests and fix anything you broke; commit naming the stage; deploy; verify on the live site with a demo/journey-test project only and take screenshots. Use the Claude in Chrome extension for all browser steps. Update a "Progress" section in the file after each stage so a fresh session can resume.

Hard stop only if a build or deploy fails and you can't fix it, or a change would break live projects. Then stop, report, and leave prod on the last working deploy.

Final report: per stage done/partial with deploy links and screenshots, what's unverified, and a checklist of what I must test by hand.
```

---

# Build notes

Written against the code, not from memory. Each entry names the file and line that decides it.

## Stage 1 investigation — 2026-11-22

### A. Where the step order actually lives (affects §The Route step 1)

`lib/survey-state.js:18` is the single source:

```js
export const RAIL_STEPS = ["background", "layout", "cameras", "views", "review"];
```

Everything else derives from it — `stepAfter` / `stepBefore` (`lib/survey-rail.js:8-9`) are pure index maths, so inserting `"route"` after `"cameras"` moves Back/Next correctly with no other change. What does NOT derive from it, and must be updated by hand:

- `system-planner.jsx` `NEXT_PROMPT` and `STEP_LABEL` (two literal maps, ~line 377). A missing key renders an empty Next label, not an error.
- `railFromEcho` (`lib/survey-rail.js:38-54`) short-circuits on `if (cur === "views" || cur === "review") return keep;` — the "don't let the iframe's echo drag the rail" guard. `"route"` belongs in that list: Route has no counterpart in the widget's internal two-step model (0 Background / 1 Setup), so an echo arriving while the user is on Route would otherwise pull them back to Layout or Placement.
- `surveyLastStep` (`lib/survey-state.js:105`) reads the persisted `lastStep`; it is allow-listed through `normalizeRailStep` (:20), which filters against `RAIL_STEPS`, so it follows automatically.

**Conflict (tests):** `tests/planner-nav-reorg.test.mjs:13-14` asserts a four-label rail and `!/label: "Views"/ && !/label: "Plan"/`. A six-step rail fails it. This is a frozen-by-design test, so it gets updated to the new intent, not deleted.

**Conflict (drift guard):** `tests/consulting-messages.test.mjs:24-39` freezes every `iot*` cross-iframe message type. Any new route message (`iotSurveyRoute…`) must be added there deliberately or the suite fails — which is the guard working.

### B. Routes have to be a floor field, and the floor shape is an allow-list (affects everything downstream)

The floor record is `{ name, bg, bgSource, devices, started, plan, planSvg, ctx, bgCtx, planXf, boundary, zones, scale, aerial, view }`. Two gates decide whether a new field survives:

- `lib/survey2-model.js:135-154` `parseSurveyFloors` maps a **fixed list** of fields. A field not named there is dropped before the customer layout, the proposal PDF and the camera roster ever see it. `routes` must be added here or §Where it shows 1 silently renders nothing.
- The widget's own `snapFloor()` (`site-survey-merged.html:2534`) copies only `bg/started/bgSource/scale/aerial/devices` back onto the floor. `boundary` and `zones` are deliberately written **straight onto the floor row, not through snapFloor** (:1700, :1758). Routes follow the zones pattern.

**Precedent to reuse, not reinvent:** site zones are the same shape as routes — many per floor, typed, coloured, id'd, point-array geometry, drawn with the shared editor, validated on restore, capped. See `ZONE_TYPES` / `ZONE_COLORS` / `ZONE_MAX` (:1735-1737), `zValidZones` (:1747), `rgZones` (:1758), `renderZones` (:1775), and the carry-through in `duplicateFloor` / restore (:3398). A route is a polyline where a zone is a polygon; the validation, capping, id-minting and render-layer machinery transfer almost unchanged. Building a second parallel system here would be the mistake.

### C. The approval fingerprint — RED lane, but additive-safe (affects §Editing rules 8)

`lib/tool-data.js:62-78` `survey2Meaning` is an explicit allow-list: `submitted`, and per floor `name`, hashed `bg`, `devices` (k/x/y/aim/fov/range/name), and `planHash` **only when a Structure exists**. Zones, boundary, ctx, planSvg and planXf are all deliberately outside it — the widget says so in as many words at :1012 ("These arrays are NEVER part of the fingerprint").

§Editing rules 8 locks the diagram on customer approval, which only means anything if routes are *inside* the fingerprint — otherwise editing a route after approval leaves the approval standing and the customer is bound to a diagram they never saw.

The safe construction already exists in this file: `planHash` is emitted **conditionally** (`...(ph ? { planHash: ph } : {})`), so floors without one hash exactly as they did before it was added. Routes can enter the fingerprint the same way — `...(routes.length ? { routes: … } : {})` — and **not one existing approval changes**, because no existing floor has routes.

Still a RED-lane change by the CLAUDE.md lanes (it changes what a signature binds to going forward), so it is flagged rather than assumed. It is **not** built in Stage 1; Stage 1 stores routes outside the fingerprint, and Stage 2 turns it on with the lock.

### D. Device IDs: the spec asks for `IC7`, the system produces `C7` (affects §The Route step 7)

`lib/survey2-model.js:176`:

```js
const code = String(d.tag || "").replace(/^I/, "") || `${g.letter}${perGroup[g.key]}`;
```

The widget's stored tag **is** `IC7`, and this line strips the leading `I` on purpose. `code` is what every consumer renders: the customer layout markers and device list (`proposal-customer-view.jsx:653,656`), the AI device resolver (`lib/device-resolver.js:50-51,74`), coverage labels, and `db.js:8291`. So the IDs the user sees today are `C7`, `C14` — not `IC7`.

Two coherent options, and they must not be mixed, because §7 also requires the diagram and the work order to agree:

1. **Match what exists** — label routes `C7` / `C14`, same as the layout and the resolver. Zero risk, but the spec's literal examples are wrong.
2. **Change the canonical code to `IC7`** — one line, but it moves every existing surface at once, including the AI resolver's matching and anything the owner has in print.

Built as (1) for now, since §7's real requirement is *the diagram and the work order use the same IDs as everything else*, and (1) is the only option that satisfies that today. Flagged for the owner.

### E. Triangles are free; the riser marker has no collision (affects §Bundles and risers 2)

`SURVEY_ICONS` (`survey2-model.js:34-46`) is eleven glyphs — camera, nvr, net, disp, spk, pos, print, door, motion, alarm, dot. No triangle, and no device kind renders one. §The Route step 6's reservation holds with nothing to undo.

### F. Pre-existing conditions worth stating

- `public/widgets/site-survey-merged.html` is **3,430 lines** against a 500-line house limit. It is already the exception; a drawing engine makes it materially worse. Routes should land as their own IIFE section with its own `/* ===== */` banner (the file's existing convention) so it can be extracted later.
- There is no typecheck and no lint in this repo (`suite-cannot-see-syntax-errors`). `tests/source-parses.test.mjs` parses `app/`, `lib/` **and the widget's inline scripts**, so a broken widget edit is caught — but only for parse errors, not for logic.

### G. Live-project risk in §Opening a submitted or signed survey (Stage 3)

§56-61 changes how **every existing submitted or signed survey** opens, for every role and every entry point including `?view=survey`. That is a behaviour change on live projects, which the standing rules say to flag rather than apply silently. It also interacts with the widget's existing `frozen()` submit-lock and the "Edit survey" affordance that already exists in the submit-lock banner (`system-planner.jsx:442-448`) — the spec's new top-right "Edit" button risks being a *second* unlock control for the same state. That needs resolving in Stage 3 so there is one unlock, not two.

---

# Progress

| Stage | Scope | State |
|---|---|---|
| — | Spec into the repo + vault mirror, Stage 1 investigation, conflicts logged | **done** |
| 1 | Route step, drawing, head-end, cable types and colours | **done** — drawing verified live at 375px |
| 2 | Bundles, risers, editing rules, undo, lock | not started |
| 3 | Submitted/signed survey opening, legend, run summary, work order + both PDFs | not started |

## Stage 1 — what is in, what is not

**In (committed, 1907 tests green, production build clean, verified live on ASC0113):**
- The step itself. `RAIL_STEPS` is now `background · layout · cameras · route · views · review`, so Back/Next
  move through Route with no other change (`stepAfter`/`stepBefore` are pure index maths). Placement's Next
  reads "Route"; Route's Next reads "Camera Angles". Route has a nav tile between Placement and Camera Angles.
- `railFromEcho` now guards `route` alongside `views`/`review`. Route draws over the SAME Setup canvas, so the
  iframe echoes dock `"cameras"` the whole time it is open; without the guard that echo dragged the user back
  to Placement mid-run.
- `focus:"route"` returns early in the widget's `step` handler. Falling through reached `contextualEdit()` and
  opened the Layout **draw editor** — found before shipping, not after.
- `lib/survey-routes.js` — the shared model: the four cables with their colours, run types, validation and
  caps on restore, head-end validation, `routeCounts` / `runSummary`, and `unwiredDevices` for §Editing rules 6.
- Routes + head-end carried through `parseSurveyFloors`, the allow-list every renderer reads through.
- `#routeLayer` renders stored runs: dark outline under a neon stroke (what makes a bright cable readable on a
  white plan AND a dark aerial), daisy chains dashed, the head-end as a marker. Inside `#planWorld`, so runs
  ride the hybrid alignment transform like devices and zones. Under the device markers (z4 vs z5), so a run
  never covers the camera it starts at.
- Drift tests: the widget's `RAIL_STEPS` and its `ROUTE_CABLES` are now pinned equal to the lib copies. Neither
  had a guard before; a silent divergence would have reopened surveys on the wrong step, or drawn the same run
  in two different colours in the planner and the PDF, with no error either way.
- Duplicate a floor: the head-end copies (pure geometry), the runs deliberately do not — `cloneDevices` mints
  fresh cids, so every route's `dev` would point at a device that no longer exists.

**The drawing interaction (added 2026-11-22, Stage 1 now complete):**
- Tap a device → tap points along the path → tap the head-end (home run) or another device (daisy chain).
  Verified live on journey-test ASC0129 at 375px: both endings, the chip override, undo and cancel.
- Head-end: arm the control, tap once to place. It disarms itself; tapping again moves it, never adds a second.
- Cable chips: the picker AND the legend, in one row at the bottom of the canvas, within thumb reach.
- `frozen() || RO` blocks every write, so a submitted survey cannot be drawn on (§Editing rules 8).

**Two decisions worth knowing, both departures from a literal reading of the spec:**

1. **The run type is DERIVED, not a toggle.** §5 reads like a Home/Daisy control, but §4 already says a run
   ends at the head-end *or* at another device — which is the same fact. Deriving it removes a control from a
   one-handed bar and makes it impossible for the label to contradict the geometry. The field still stores
   `home`/`daisy`, so an explicit override can be added later without a migration.
2. **The cable prefills from the device kind** (speaker → speaker wire, display → HDMI, outlet → power,
   everything else → Cat6), with the chips as the override. Smart defaults rule: the system already knows.

**The head-end: an on-map + and a real connection (2026-11-22).** There was never a placeholder in the
Route step — the dark box where the runs converge *is* the head-end marker, drawn only when one exists,
and it read as an empty placeholder because it was a featureless square. It now carries the same rack
glyph the toolbar uses. Placing one used to be possible only from a toolbar button, so there is now a
**+ bottom-right of the canvas**, shown only while routing with no head-end: tap to arm, tap the map
where the rack actually is, tap + again to cancel. Once one exists the + is gone and the toolbar's
control arms the MOVE, so the two never offer the same action at once.

And the connection was real: a home run copied the head's coordinates at commit time, so moving the
head-end left every endpoint behind (measured at 51 percent-units of gap). `rtHeadMoveTo` now re-anchors
every home run — daisy chains are untouched, since they end on a device — and `renderRoutes` additionally
draws a home run's last point at the live head-end, so a row saved before this fix cannot render floating
either. Verified at 375px: head-end moved, both home runs followed with **maxGap 0**.

**Undo/redo is scoped to the step (fixed 2026-11-22).** The floating undo button is not a general history
— it is "pop the last placed device", and the region editor keeps its own separate `bdHist`, which is why
`body.regions` hides the device one in CSS. Route draws over the same Setup canvas and that handler never
learned about it, so on Route undo deleted a **camera** and left every cable run in place (reproduced
live: 3 cameras → 2, routes unchanged). Route now has its own snapshot stack of `{routes, head}` per
floor, and `undoAction`/`redoAction` check the step first and **return**, so a Route undo with nothing to
undo is a no-op that cannot reach a device. The same two buttons serve both steps; on Route they are
hidden while a run is being drawn, because the bar's own undo owns the in-progress points.

**Still Stage 2, as scoped:** bundles and their count badges, risers, the full editing rules (tap-to-delete,
the bundle picker, dragging a bundle point, the daisy-chain-break warning), the undo stack across multi-floor
deletes, the red outline on unwired devices, and the approval lock.

**Settled by the owner, 2026-11-22** (was "open"):
- D — **C7 stays.** Do not change the canonical code; the diagram and work order match every other surface.
- C — routes in the approval fingerprint: **agreed, Stage 2**, via the `planHash` pattern so existing approvals are untouched.
- G — **ONE unlock control** in Stage 3: extend the existing "Edit survey" button in the submit-lock banner, never a second one.

### Placement rule — 2026-11-22

The rule already half-existed: `rmDevCtx` in the widget wrote `d.placementType` from structure
containment, persisted it, and surfaced it through `surveyDevices`. What it lacked was a pure, testable
home — and it conflated two questions, because one variable answered both "which room names this device"
and "is it indoors". That is how a camera bolted to an exterior wall could be named for the room behind
it *and* declared inside.

Now: the rule lives in `lib/survey-placement.js`, the widget mirrors it under a drift test, and the
naming tolerance is deliberately separate from the placement decision — so "Dining 1" still names the
wall-mounted camera while its placement reads **outdoor**, which is what decides the housing.

A three-state version (with a `review` state for the wall band and for floors with nothing drawn)
shipped first and was simplified away the same day on the owner's call: outdoor is already the
fail-safe answer for those cases, so a third state asked a question the default had answered.
