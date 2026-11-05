# Site Survey — Navigation Fix List

One rule: every step uses the same bottom bar and the same logic.

## 1. One bottom bar, every step

- **Left:** Back (one step back). Hidden on the first screen (Background source choice).
- **Center:** Current step name + down arrow (e.g. "Layout ▾"). Clicking opens **Survey Navigation** upward.
- **Right:** Next (one step forward), labeled with the next step name. No wrapping text, same style on every step.
- Remove the top-right three-dots menu. Survey Navigation lives only in the center button.
- Applies to Background (satellite, upload, draw), Layout, Placement, Camera Angles, Submit. No step gets its own bar.

* The bar is identical and seamless on EVERY step, including Review: Back (left) · step menu (center) · Next step / Submit (right). Nothing else in the bar. No three-dots button beside Submit. Label is just "Submit" (not Re-submit).

- Remove the top-left Map / Photos toggle. The photos view IS the Camera Angles step — reach it through the step order/menu.

## 2. Step tools

- Step tools (Level, Crop, Enhance, Download, Structure, etc.) go in a small floating pill on the canvas, just above the bar. Never in the bar's center.
- **Undo:** bottom-left corner of the canvas. Only shown once the user has made a change.

* Satellite tools: Level, Crop, Enhance move out of the bottom bar into a floating pill at the bottom of the image. Give Enhance a text label like the others.
* Download moves into the step menu (captures save to the platform anyway).

## 3. Step order and names

- Background → Layout → Placement → Camera Angles → Submit.
- Use these names everywhere. Delete the old set (Base / Cameras / Camera Photos).
- Add a new floor lives on Submit.

## 4. Next / Back logic

- Next always goes to the very next step in order. Never skip based on ticks.
- Next on Background must **save the capture first**, then go to Layout. (Currently it doesn't save, then jumps to random steps.)
- Placement → Camera Angles (currently jumps to Review & Submit).
- Back always goes exactly one step back. (Currently Back on Layout does nothing — should return to Background.)

* If a step needs something before Next works (e.g. Layout needs a structure drawn before Place Cameras), show Next as disabled with a short hint like "Draw the structure first". Never a silent click that does nothing.

- Placement step (Floor 3): can't place cameras, no tools show. Devices panel shows a "Submitted" lock — likely the cause. A new floor must be editable even if another floor was submitted.
- Placement's Next must say "Camera Angles" (aim FOV cones, like the mock-up), not Review & Submit. Review & Submit only comes after Camera Angles.

## 5. Ticks / completion

- Ticks are kept **per floor**. Floor 1's cameras must not tick Placement on Floor 2.
- A step is only ticked once it's actually done on that floor.

* Cameras belong to the whole system, not a floor. Camera Angles (photos page) shows all system cameras on any floor — that's correct.
* Empty 4th tile ("No Camera") — hide unused slots.

## 6. Each step must show its tools

- Going back to Layout must load the grid, Structure tools and bar. (Currently it shows the finished view with no tools while the menu says Layout.)
- Survey Navigation's current step must match what's on screen.

## 7. Refresh / autosave

- On refresh, open in **Map** view (not Photos) on the last autosaved step and floor.

## 8. Submit / lock

- Survey was submitted and locked while incomplete (Floor 3 no plan, Floors 2–3 no cameras, 3 missing photos). Block Submit until every floor is complete, and list what's missing.
- Banner says "Use Unsubmit to change the plan" but there's no Unsubmit button. Add it next to "Awaiting customer approval".
- Adding a new floor after submit should unlock (or prompt to unsubmit), not leave the new floor stuck and locked.

* Review screen: two Re-submit buttons (card + bottom bar). Keep only the bottom-bar one.
* A floor with no cameras is fine — don't flag it. Only flag real gaps (missing photos, no plan). Each floor row is clickable and jumps to the step that's missing.
* Keep the top floor bar and the same bottom bar on this screen (center = "Submit ▾").

- Replace the Consulting Deliverables card with the devices list, grouped by floor, each showing photo status. Deliverable status becomes a small badge next to the Review & Submit title. Hide the bottom Devices panel on this screen.

* Remove Add camera from the Review & Submit screen. Adding cameras only happens on Placement (a floor's "No cameras" tag links there).

## Look and feel

- Floor switcher: no pill. Keep the ‹ › arrows on either side of plain text "Floor 1 ▾" (no background or border). Hide the left arrow on Floor 1. On the last floor, the right arrow becomes a + that adds a new floor.
- Everything pure white: top bar, bottom bar, page background, panels. Remove all the off-white/grey bands. Use thin borders to separate areas.

## 9. Leave for now

- Google watermark in captures and the sample imagery are fine for now.

---

## Definition of done

### 1. One bottom bar
- [x] One shared bottom-bar component rendered on every step (Background/Layout/Placement/Camera Angles/Submit).
- [x] Left = Back (one step back), hidden on the Background source-choice screen.
- [x] Center = "Current step ▾", opens Survey Navigation upward.
- [x] Right = Next, labeled with the next step's name; on Submit the right control is "Submit" (not Re-submit).
- [x] Top-right three-dots menu removed; Survey Navigation only in the center button.
- [x] Top-left Map/Photos toggle removed.

### 2. Step tools
- [x] Satellite Level/Crop/Enhance (with text labels) in a floating pill above the bar; Download removed from the bar (see Decisions).
- [x] Draw Structure tools in a floating pill above the bar.
- [x] Undo in the bottom-left of the canvas, shown only after a change.

### 3. Step order & names
- [x] Order Background → Layout → Placement → Camera Angles → Submit everywhere; old names gone.
- [x] "Add a new floor" lives on Submit (the + on the last floor's switcher, which the Submit screen shows too).

### 4. Next / Back logic
- [x] Next goes to the very next step (no tick-based skipping).
- [x] Next on Background saves the capture, then goes to Layout.
- [x] Placement → Camera Angles; Camera Angles → Review/Submit.
- [x] Back goes exactly one step back (Layout → Background).
- [x] Prereq-missing Next is disabled with a short hint (e.g. "Draw the structure first").
- [x] A new floor is editable even if another floor was submitted (adding a floor unlocks).

### 5. Ticks / completion
- [x] Ticks are per-floor; a step ticks only when done on that floor.
- [ ] Unused device slots ("No Camera") hidden. — not done (lives in cctv-mockup.html; see Decisions).

### 6. Each step shows its tools
- [x] Returning to Layout loads the grid + Structure tools + bar.
- [x] Survey Navigation's current step matches the screen.

### 7. Refresh / autosave
- [x] On refresh, opens in Map view (last floor; step defaults to a Map step — see Decisions).

### 8. Submit / lock
- [x] Submit blocked until every floor is complete; missing items listed.
- [x] Unsubmit button added next to the submit CTA (and "Awaiting customer approval").
- [x] Adding a floor after submit unlocks.
- [x] Only one Re-submit (bottom bar); label is just "Submit".
- [x] No-camera floors not flagged; only real gaps; floor rows jump to the missing step.
- [x] Top floor bar + same bottom bar (center "Submit ▾") on the review screen.
- [x] Consulting Deliverables card replaced by a per-floor summary with photo status; deliverable status a small badge; bottom Devices panel hidden on this screen.
- [x] Add camera removed from the review screen.

### Look & feel
- [x] Floor switcher: no pill; ‹ › arrows + plain "Floor N ▾"; left arrow hidden on Floor 1; right arrow becomes + on the last floor.
- [x] Pure white surfaces (top bar, bottom bar, review, devices panel); thin borders separate areas.

## Decisions

- **The bottom bar is planner-owned (React), shared on every step.** The iframe build tools (satellite,
  draw) no longer render their own dock — their toolbars float as pills at the bottom of the canvas, and the
  one planner bar carries Back / center-step / Next. This is the only way to get a single identical bar when
  the tools live inside iframes.
- **Download (satellite):** removed from the bar rather than relocated to a menu. Captures autosave to the
  platform, so an explicit Download is near-vestigial; left out for now instead of adding a new menu entry.
- **"No plan" gap = no background.** The spec listed "Floor 3 no plan" for an *empty* floor, so a floor is
  flagged incomplete when it has **no background** (not when it merely lacks a drawn structure). A floor with
  a base but no cameras is never flagged. A placed camera with no photo is a gap. Simplest reading of "only
  flag real gaps".
- **Refresh opens on a Map step.** Staff always open in Map (never Camera Angles). The exact *last* step is
  not yet persisted per-session; it defaults to the layout/map entry. "Not Photos" is the firm part and is met.
- **Review "devices list":** implemented as the per-floor summary (thumbnail + camera count + "all have
  photos / N missing") plus the clickable gap rows, rather than a full flat device list. Same information,
  fewer rows; can be expanded to a full list later.
- **Empty "No Camera" tiles** are in the phone-mockup widget (cctv-mockup.html), a separate surface from this
  navigation pass — left for a focused follow-up.
