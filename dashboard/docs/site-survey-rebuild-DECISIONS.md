# Site Survey Rebuild — Decisions Log

Implementation decisions and judgment calls made while building `site-survey-rebuild.md`.
Rule: where the spec was ambiguous, the sensible choice was made and recorded here rather than asking.

## Structure / rail (5 steps → 3)

- **Rail collapsed to 3: Base · Plan · Submit.** `background`→**Base**, `plan`(now also absorbs Cameras)→**Plan**, `review`→**Submit**. The internal rail keys stay `background`/`plan`/`review` to minimize churn; only labels + flow changed.
- **Cameras folded into Plan.** The "Cameras" rail step is gone; placing/aiming cameras happens on the same live Plan map. Completion of Plan = structure drawn OR cameras placed OR submitted.
- **Views removed as a gating step.** The phone-mockup photo surface is still reachable as a non-gating **Camera Photos** entry in the `•••` Go-to menu (photos also live on the device cards). The old "Start Views / Skip" splash is deleted.
- **Submit CTA gates on the survey only**, not the mockup — photos are no longer a blocker (spec: "photos stay editable after submit; geometry locks").

## Submit / lock

- Submitting locks geometry and shows a **"Submitted — locked"** banner with an **Unsubmit** button. Photos remain editable (badge copy says "geometry locked", not "everything locked").
- Blocked actions surface a reason (no silent no-ops) via an inline toast/hint.

## Items implemented in the planner shell (system-planner.jsx / site-survey-widget.jsx)

- 3-step rail + nav, Next disabled until a base exists, Back hidden on step 1.
- Review/Submit summary: per-floor plan thumbnail, camera count, cameras-missing-photos flag.
- "Skip survey" affordance on the empty Base chooser.

## Items in the in-canvas tool (site-survey-merged.html)

- Camera map labels: short number on the map, full name on tap/hover.
- Remove "tap Done" footer hint; footer label names the active mode.
- Grid snap default 0.5.
- No in-canvas Done; footer navigation commits (auto-saves) the active tool before advancing.

## Acceptance checks — status (verified live where noted)

1. **Empty floor → cards directly, no Back, Next disabled** — ✅ DONE (Build gate removed; Base is step 1 so no Back; Next disabled until a base exists). Verified live (the "What's the base for this floor?" chooser).
2. **Satellite → project address, pin confirm → leveled + cropped, zero clicks** — ✅ DONE. Auto-level + auto-frame now fires once automatically on the first landing (client-side, no billing). Verified `autoLeveledOnce` fires. (Footprint-based crop is the spec's own "later" item; auto-frame is the quick version.)
3. **Enhance → Remove enhancement restores original** — ⚠️ PARTIAL. The non-destructive version stack (bgVersions/ctxVersions, pin-on-submit) and before/after compare already exist; a dedicated "Remove enhancement" button + exact-restore UX was NOT added this pass (RED-lane: enhance touches /api/enhance billing — not rushed).
4. **Crop/Level after enhance → prompt** — ❌ NOT DONE this pass (same RED-lane caution).
5. **Footer Next from the capture tool → saves + advances one tap** — ✅ DONE + verified live (Base → "Floor Plan" committed the aerial and landed on the Plan map).
6. **No screen shows two primary buttons / two ways** — ✅ Largely DONE (removed: Build gate, dead "Create Floor Plan" CTA, Views Start/Skip splash, the in-canvas satellite Done). Draw tool's own dock Done remains (deferred with §7).

## Merge: System Preview → Site Survey

- **System Preview card removed** from the project page; Site Survey is the only entry. Its copy becomes "Map & photos."
- **Map / Photos toggle** added top-left of the planner bar. Map = floor plan; Photos = the camera photos + phone mockup. Reuses the existing survey (plan) + mockup (views) panes — same camera data underneath (cameras flow survey↔mockup by cid; nothing duplicated).
- **Photos opens straight to the phone grid** (no Build splash) via `startBuilt`, and **works with no map** (the mockup renders standalone).
- **A project with no survey opens straight to Photos** (preview-only jobs never touch the floor plan); a project that already has a survey opens on Map.
- The `?view=mockup` route still resolves but no card points at it (Photos is the entry).

## Offline-first saving

- The tools already write localStorage first (device-persistent, survives reload) and the autosync retries failed pushes every 5s (implicit queue). Added: an explicit **online/offline indicator** + flush-on-reconnect.

## Deferred / partial (couldn't fully land in this pass — flagged honestly)

- **Unplaced-cameras tray + fully unified camera record (merge)**: a camera added in Photos with no map becoming an "unplaced" survey device, shown in a Map tray to drag into place, is a multi-file data-model change (survey2-model + the mockup + the survey widget). In this pass the mockup's standalone camera slots back a photos-only job and the proposal PDF still pulls the mockup photos; the explicit unplaced→placed tray drag is the remaining deep piece.
## IndexedDB device store (done, with a documented boundary)

- `idb-store.js` provides async `idbGet/idbSet/idbDel` with the SAME string read/write shape the sync layer used for localStorage. `tool-sync` now treats **IndexedDB as the durable on-device store**: migrates any existing localStorage draft into IndexedDB on first load, seeds from IndexedDB (then the server) when localStorage is empty, and mirrors every change into it. Verified live: the survey blob lands in `iot_tools/kv`.
- **Quota errors are surfaced, never silent**: an IndexedDB `QuotaExceededError` sets a real badge message ("Device storage full — free space to keep saving photos").
- **Photos**: online, each photo already uploads to `/api/media` and only its small URL rides in the blob. Offline captures are base64 in the blob until reconnect uploads them — IndexedDB (not ~5 MB localStorage) is the durable home.
- **Boundary (honest)**: the two in-canvas iframes still also write localStorage synchronously as their fast working copy. A single offline blob larger than ~5 MB would fail that synchronous iframe write before the sync layer sees it; converting both iframes' sync save/load to async IndexedDB-only is the remaining rework, not rushed to avoid breaking the shipped save path.

- **Enhance polish (§3)**: Remove-enhancement button, before/after slider pinned at 50% (currently an auto-scanner), "edit enhanced vs revert" prompt. The version-stack + compare infra exists; these are UX deltas on a billing-sensitive flow left for a focused, careful pass.
- **Draw tool (§7)**: one naming field that flips above when near the bottom; the "structure editor only mounts after refresh" stale-state bug. (½-snap-default and the Structure/Room/Area/Opening/Eraser order already shipped — confirmed present.)
- **"Skip survey" as an inline link under the chooser (§1)**: the capability already exists as a project menu action (`skipSurveyAction`); surfacing it as a chooser link needs iframe→host wiring, deferred.
- **Status pill consistency (§7)**: "Awaiting Survey" after submit lives in the project-status derivation, outside the planner; not touched this pass.

- **Satellite footprint-based auto-crop**: the spec itself calls footprint crop "later"; the ~3-lot pin-centered crop + auto-level on confirm is the target. Where the capture sub-tool already auto-levels/crops, it's wired; a brand-new footprint detector is out of scope for this pass.
- **Enhance before/after slider at 50% + "edit enhanced vs revert" prompt**: the non-destructive version stack (bgVersions/ctxVersions, pin-on-submit, Remove-enhancement) already exists in the tool; slider/prompt polish is layered on where the hooks exist.
- Anything touching `/api/enhance` billing is left on its existing non-destructive path (RED lane — never re-bills on toggle/revert).

## Round 3 — One bar, not two (§1)

- **The problem:** every build step stacked TWO bars at the canvas bottom — the in-canvas tool row (satellite Level/Crop/Enhance, draw Structure/+/grid, or the cameras undo) and the planner footer (`.syp-nav`: Back + next-step). The tools are iframe-internal (satellite-capture.html / draw-floorplan.html docks, or the survey map controls); the nav is planner-level React. They can only share one row if the nav lives inside the iframe dock (tools can't leave the iframe without mirroring every control + its state across the frame boundary).
- **Decision: the in-canvas dock becomes the single bar on every build step — tools left, Back + next-step right.** The planner footer is hidden whenever an in-canvas dock is present (`bgTool==="satellite"|"draw"`, or the Cameras map dock). It stays as the one bar only where there is no dock: the empty chooser, Camera Photos, and the Submit step.
- **Nav crosses the frame via ONE message, `iotSurveyNavGo {dir:"next"|"back"}`.** The planner owns the 4-step order and resolves dir → the real next/prev step (via `navRef`, kept current each render). The draw dock (nested in `satFrame`) relays through the survey as `iotSurveyNavGo`; the survey map dock and satellite dock post it up directly.
- **Cameras gets a real dock** (`#camBar` in site-survey-merged.html): undo/redo on the left, Back + Review & Submit on the right — so its bar sits at the same canvas-bottom position/height as the satellite and draw docks (no jump when flipping Layout↔Cameras). The old floating undo cluster is folded into it.
- **Go-to / Walkthrough** (previously in the footer `•••`) move to a `•••` on the top floor bar, so they stay reachable when the footer is hidden.
- **Reported as not cleanly followable:** the survey's Base→Layout satellite-commit path is timing-fragile (the capture commits, the rail advances to Layout, but the draw editor doesn't always open — it can land on the raw map). Addressed by making "reach Layout" reliably open the draw tool; noted here as the one flow that needed a behavior nudge rather than a pure UI move.

## Round 3 — Draw & Upload base audit (§3)

Verified live on ASC0056 (added a blank floor to reach the chooser):

- **Draw base — fully follows.** Choosing *Draw* lands directly on the **Layout** draw dock, which is now the single bar (tools left: Structure ▾ / + / grid / •••; nav right: Back + Place Cameras). No aerial, so Level/Crop/Enhance are simply ABSENT (they live only in the satellite dock). Back returns to the chooser; geometry autosaves; there is no "Done" button (Place Cameras is the next-step). Same ½-grid snap + Structure/Room/Area/Opening/Eraser toolset as when the draw tool is reached from Satellite → Layout (it is the same `draw-floorplan.html` dock, so the one-bar change applies uniformly).
- **Upload base — now lands on Layout too (owner follow-up).** Originally an upload landed on Cameras because the Structure build path was aerial-gated (`canBuild` = `floorHasAerial && !hybridCapable`). Fixed by extracting the aerial build's core — measure the image, synthesize a full-frame `ctx`, hand the four image corners to the draw tool as the working-area base — into a reusable `buildPlanOver(f, lcBg)`, shared by the Create-Floor-Plan build (aerial, still `canBuild`-gated) AND the Upload handler (ungated: an upload is an explicit "build a plan over this image" intent). An upload now lands directly in the **Layout** draw dock, so you trace walls/rooms over the uploaded floor plan; it becomes the floor's `ctx` backdrop. A re-upload onto a floor that already has a plan (`hybridCapable`) does NOT rebuild. No real-world scale is assumed (ftW/ftH = 0, like a blank Draw base) — the draw tool's own grid scale applies until set.
- **Net:** all three bases get ONE bar at the same canvas-bottom slot, and all three route through Layout (Satellite / Upload land in the draw editor over the image; Draw starts it blank). Upload → Cameras is no longer the behaviour.
