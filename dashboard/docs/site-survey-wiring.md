# Site Survey Wiring Diagram: Spec + Prompt

IOT TECHS FSM platform. New Wiring step in the Site Survey tool: draw cable routes on top of the finished survey, shown to the customer and on the work order. Big change: investigate first, build in stages, demo projects only for testing. Save a copy in the Obsidian vault under Projects/IOT TECHS/.

## The Route step

1. New step "Route". Order: Background → Layout → Placement → Route → Camera Angles → Approval. Added to Survey Navigation in that slot; the Placement step's next button becomes "Route".
2. Background is the finished survey for that floor: floor plan or aerial and placed devices (no angle cones yet, since Route comes before Camera Angles). Routes are drawn on top.
3. Head-end marker: place a rack/NVR marker where runs terminate.
4. Drawing a run: tap the device first, then tap points along the path back to the head-end (or to another device for daisy chain). Free multi-point lines that can pass straight through the structure.
5. Run type per line: Home run (default) or Daisy chain.
6. Cameras stay as numbered circles with their angle cone. Triangles are reserved for risers.
7. Devices are labelled with their existing device IDs (e.g. IC7, IC14), and the same IDs appear on the work order lines.

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
2. It opens view-only: no dragging, placing, drawing or deleting until the user taps an "Edit" button (top right). Moving between steps stays view-only.
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
| 1 | Route step, drawing, head-end, cable types and colours | not started |
| 2 | Bundles, risers, editing rules, undo, lock | not started |
| 3 | Submitted/signed survey opening, legend, run summary, work order + both PDFs | not started |

**Open for the owner** (logged, not blocking Stage 1):
- D — device IDs read `C7` today, not `IC7`. Built to match the existing system; say the word to change the canonical code instead.
- C — routes in the approval fingerprint. Additive-safe for every existing project, but it is a signature-binding change, so it lands in Stage 2 rather than being assumed.
- G — §Opening a submitted or signed survey changes behaviour for existing live surveys, and would add a second unlock control beside the one already in the submit-lock banner.
