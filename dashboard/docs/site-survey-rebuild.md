# Site Survey — Simplified Flow

Goal: one control per job, no edit mode, no redundancy. Everything auto-saves.

## Core rules

- No edit mode. The map is always live and editable unless the survey is submitted.
- No in-canvas Done buttons. Moving to any other step (footer Next, Back, rail jump, floor switch) auto-saves the current state first.
- One footer Next, one footer Back (hidden on the first step), one floor menu at the top. Remove the duplicate in-canvas Back and floor sheet.
- No Build splash. Remove the Build button. The Floor Plan rail step is the only entry point.

## 1. Background

- An empty floor shows the Satellite / Upload / Draw cards directly, with a small "Skip survey" link underneath.
- Footer Next is disabled until a base exists.

## 2. Satellite capture

1. The map opens on the project's site address (never a default or device location) with a pin.
2. The user confirms the building: tap it, or drag the pin if it's off.
3. On confirm, the image is automatically:
   - **Leveled** off the top (no Level tab or Auto click needed).
   - **Cropped** with a box centered on the pin, about 3 lots wide so the neighbors on the left and right show. (Quick version for now; footprint-based crop comes later.)
4. Crop and Level buttons stay available to adjust manually at any time.
5. Footer Next saves and continues. There is no Done button.

## 3. Enhance (version stack)

- The original leveled and cropped satellite photo is kept and never overwritten.
- Each enhance, including prompted fixes like "clean up the backyard" or "clean up the pavers", saves as a new version on top.
- A **Remove enhancement** button reverts to the original.
- Tapping **Crop** or **Level** after an enhance prompts: "Edit the enhanced photo" or "Revert to original".
- The before/after slider opens at 50%.
- Measurements, scale, and device positions are anchored to the original photo, never the enhanced one.

## 4. Floor plan + cameras (one live map)

- Draw walls and areas directly on the map.
- Tap + to drop a camera, and drag to place and aim it.
- The rail (Floor Plan, Cameras) only shows progress and focuses the right panel. It doesn't change modes.

## 5. Views and Review

- Unchanged shell steps. Footer Next leads into them.

## 6. Submit / lock

- Submitting locks the map with a visible banner: "Submitted — locked" plus an **Unsubmit** button.
- No silent no-ops: any blocked action states why.

## 7. Walkthrough additions (ASC0060)

**Satellite**

- Auto level and auto crop run on pin confirm. Enhance is never automatic; it's a button he presses when he wants it.

**Floor plan editor**

- Floor plan stays manual (no auto-draw). Order: Structure, then Room / Area / Opening.
- Never auto-switch modes after drawing a structure; the user picks the next mode.
- Grid snap defaults to 0.5.
- Bottom bar: type dropdown · ½ snap · Eraser. Eraser leaves the dropdown and only erases the type currently selected (Area mode can't delete the structure).
- Room and area fills are semi-transparent; area outlines are high-contrast.
- One naming field. It opens right after a shape closes and flips above the shape when near the bottom, never leaving the canvas.
- Footer label always matches the active mode. Remove the "tap Done" hint.
- Bug: the structure editor only appeared after a page refresh (stale state). Fix it so the editor mounts on first entry.

**Cameras**

- Cameras auto-name from their room or area (Kitchen 1, 2, 3). Keep it.
- Map labels collide. Show a short number on the map and the full name on tap or hover.
- Fix the footer CTA: it said Place Cameras with cameras already placed, then skipped to Review.

**Views (folded into Cameras)**

- Remove Views as a separate step. Photos are added in the device cards or the phone mockup, which already sync.
- Remove both gates (Start Views splash and Build splash).
- Mockup tiles and the hover preview use the device name (Kitchen 1, not Camera 1). Drop the redundant "Camera view" label.
- Photos stay editable after submit; geometry locks. The Submitted lock badge should not imply photos are locked.

**Review & submit**

- Hide the floor bar on Review (it covers all floors).
- Show a real summary: plan thumbnail per floor, camera count, cameras missing photos flagged.
- One Submit button (remove the duplicate row link). Remove the "Optional — not started" row.
- Status must be consistent: no Resubmit flash on first submit, and the project pill must not say Awaiting Survey after submission.

## 8. The rebuild: 5 steps become 3

This supersedes the rail in sections 1–5. Same tool in both the simple and advanced project views; only the frame around it differs. No deck-style sliding between steps — three cards, the way the simple project page works.

**Step 1 · Base** Satellite, Upload, or Draw, shown immediately on an empty floor. Satellite: project address prefilled, confirm the building by its pin, then auto-level and auto-crop (box on the pin, ~3 lots wide). Enhance stays a manual button with a version stack on top of the untouched original. Crop and Level stay available; after an enhance they ask whether to edit the enhanced copy or revert.

**Step 2 · Plan** One live map, no modes and no edit button. Draw the structure, then areas, rooms, and openings (type dropdown · ½ snap · scoped eraser). Drop cameras with +, drag to aim, set angle and radius on tap. Cameras auto-name from their room or area. Add each camera's photo right here in the device cards or the phone mockup — the old Views step disappears. Everything reads one device name everywhere.

**Step 3 · Submit** No floor bar. Plan thumbnail per floor, camera count, cameras missing photos flagged. One Submit button. After submitting, geometry locks with a visible banner and an Unsubmit action; photos stay editable.

**Carried across all three**

- Auto-save on every step change. No Done buttons anywhere.
- One footer Next, one Back (hidden on step 1), one floor menu.
- Footer label always names the real next step and commits the active tool before advancing.
- Progress % counts completed work only, and matches between the simple and advanced views.
- No silent no-ops: any blocked action says why.

## 9. Non-negotiables

**Autosave everything.** Every change writes as it happens — a crop, a wall, a camera moved a few pixels, a name typed, a photo added. Nothing waits on a button. Leaving a step, switching floors, closing the tab, or losing connection never loses work. If a save fails, say so inline and retry; never block the user behind it.

**Everything is editable in place.** No edit buttons anywhere — no Edit background pencil, no Build, no Done, no Start Views. Tap the thing and change it. Tap the background to recrop or re-level it, tap a wall to move it, tap a camera to re-aim it, tap a name to rename it. The only thing that ever stops an edit is a submitted survey, and that says so out loud with an Unsubmit next to it.

**Seamless enhanced / non-enhanced.** One toggle switches the view instantly, both ways, any number of times. Nothing is lost or recomputed when switching: the original and every enhanced version stay side by side, walls and cameras hold their exact positions, and the toggle costs nothing (no re-enhance, no re-charge). Removing an enhancement is the same instant switch, not a destructive undo.

## Must-fix bug

- The footer button was ignored while the capture tool waited for its own Done. Fix: footer navigation always commits (auto-saves) the active tool, then advances.

## Acceptance checks

1. Empty floor → cards show directly, no Back, Next disabled.
2. Satellite → project address, pin confirm → leveled and cropped with neighbors, zero extra clicks.
3. Enhance → Remove enhancement restores the exact original crop.
4. Crop or Level after enhance → the prompt appears.
5. Footer Next from the capture tool → saves and advances in one tap.
6. No screen ever shows two primary buttons or two ways to do the same thing.
