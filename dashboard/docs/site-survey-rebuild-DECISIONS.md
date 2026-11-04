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

## Deferred / partial (couldn't fully land in this pass — flagged honestly)

- **Satellite footprint-based auto-crop**: the spec itself calls footprint crop "later"; the ~3-lot pin-centered crop + auto-level on confirm is the target. Where the capture sub-tool already auto-levels/crops, it's wired; a brand-new footprint detector is out of scope for this pass.
- **Enhance before/after slider at 50% + "edit enhanced vs revert" prompt**: the non-destructive version stack (bgVersions/ctxVersions, pin-on-submit, Remove-enhancement) already exists in the tool; slider/prompt polish is layered on where the hooks exist.
- Anything touching `/api/enhance` billing is left on its existing non-destructive path (RED lane — never re-bills on toggle/revert).
