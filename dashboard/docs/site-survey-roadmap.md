# Site Survey / Hybrid Plan — Roadmap & Progress

One concise status file for the "one scaled site model" build. Canonical model: logical grid/cell geometry + physical scale metadata + render transform (NEVER migrate geometry to feet). Satellite / Plan / Hybrid are render modes over ONE canonical site. AI never owns canonical geometry — it suggests; humans accept/edit.

## DONE

- **Phase 1 — Persistence + floor lifecycle.** Structure lives in the `survey2` floor record (server-synced); stable floor ids; aerial transform + north persisted; LOADING/LOADED gates.
- **Phase 2 — Outline precision.** Zoom/pan/pinch while outlining; vertex add/move/delete/undo/redo; per-floor outline draft (tied to its capture); in-product replace-structure confirm (no `window.confirm`).
- **Phase 3 — Shared transforms + north.** `lib/site-transform.js` (siteToScreen/screenToSite/imageToSite/siteToImage/gridBoxFeet/northArrowAngle), inlined in widgets with drift guards; north arrow in planner/export/walkthrough.
- **Phase 4 — Hybrid + grid.** Satellite | Plan | Hybrid on ONE context-crop plate, devices pinned identically across views; ctx-feet scale; permanent "1 box = N ft" grid overlay; exterior side labels; hide Rotate on ctx floors.
- **Phase 5 — Boundary + zones.** Editable site boundary ("Estimated boundary", not a legal line) + 9 typed/colored zones, Regions-mode polygon editor (add/move/delete/close/undo), plate-% coords, persisted, estimates-only.
- **Phase 6 — Room/opening polish.** Room merge (union cells, shared wall drops out, undoable); pole-of-inaccessibility interior labels (L-shapes); doors/openings on wall units (gap + swing arc), reconciled away when a merge makes a wall interior.
- **Owner 17-point field spec.** Hybrid now shows the aerial (two root causes: tight crop + opaque white plan layer occluding the aerial — both fixed: full leveled aerial kept + aspect-padded viewport windowed in render + transparent plan layer); draw-tool floor selector; immediate server flush on discrete actions; derived-floor lineage; validCtx hardened to inline-image-or-own-media only.

Persistence model: the `survey2` blob (all floor geometry + ctx/aerial/scale/north/boundary/zones/sides/openings/devices + selected floor) mirrors to the server every 5s via `/api/tool-data` (8MB cap, server-side role check) and seeds fresh devices from the server → the server is the authoritative backup, localStorage is the working copy. Approval fingerprint (`survey2Meaning`) is an allow-list (name, bg-hash, devices, planHash) — boundary/zones/sides/view/lineage are NOT in it.

## DONE (cont.)

- **Phase 7 — Site Intelligence (AI, gated)** ✅ — `/api/site-intel` (server + client); suggestion-first (draft → Apply writes canonical); ZERO AI calls except the explicit "Analyze Site" tap (verified live: load fires only a probe GET, never a POST); env-gated on `OPENAI_API_KEY`; persisted runs, cost-reuse by source hash, outdated-not-rerun; mocked tests.
- **Phase 8 — Device Intelligence** ✅ — `lib/device-context.js` (device→room/zone, FOV∩zone coverage ranking, mounted side, facing) + in-widget name SUGGESTIONS (coverage→room→zone→side, Left/Right dedup, "<room> Speaker"); suggestion-first, never auto-overwrites.
- **Phase 9 — Walkthrough + mobile** ✅ — canonical stops (cameras + speakers), desktop plan|detail, mobile swipe cards + thumbnails, selected-device coverage emphasis; wired into planner + customer + visualize.
- **Phase H1 — "Create Hybrid Floor Plan"** ✅ — derived `· Hybrid` floor (inherits enhanced aerial + lineage, fresh device cids) → satellite level step → existing outline/draw/ctx engine; source floor untouched (verified).
- **Phase 11 (partial)** ✅ — customer/proposal PDF export now re-draws the scaled grid + site boundary + typed zones (parseSurveyFloors carries them; estimates only).
- **Fix** — boundary/zone Undo: Regions mode hides the device undo/rotate so the boundary Undo is the one control (removes last vertex / backs out). Reported + fixed.

## REMAINING

- **H2 — Use Enhanced Background + enhancedRegistration.** Swap a hybrid floor's aerial to a later-approved enhanced image WITHOUT redrawing Structure; registration (translate/scale/small-rotation) on the visual layer only. Needs an "approved enhanced aerial" asset concept (fuzzy — H1 already inherits the enhanced aerial for the enhance-before case).
- **Phase 10 — AI Enhanced Floor Plan (gated).** AI visual layer UNDER canonical vectors (today enhance REPLACES the plan raster); stale-on-edit "Update"; cache by plan revision.
- **Phase 11 (rest).** Interactive customer "Your System Layout" + install view rendering boundary/zones (PDF done; interactive uses the walkthrough/raw image); the role-visibility sanitize pass (OWNER CHECKPOINT — reuse roles.js/can() + server-side sanitize).

## PHASE H — "Create Hybrid Floor Plan" workflow (owner redirect, HIGH priority)

Reframe hybrid creation as ONE grid rooted in the Structure. Mostly ADDITIVE on the existing ctx engine (reuse tracing/draw/ctx; do NOT rewrite geometry or migrate to feet). The canonical insight: the Structure's calibrated grid (from the outline seed / metersPerPx) IS the one site grid, extended outward over the aerial; the aerial is aligned UNDER the grid (imageToSite), never a second grid.

Target flow: exterior floor → **Create Hybrid Floor Plan** → NEW derived floor "<name> · Hybrid" (derivedFromFloorId, independent state, source untouched) → uses the APPROVED ENHANCED aerial if one exists (else original) → focused **Level** step (Hybrid-floor-only transform) → **Outline Building** (reuse the outline tool) → Use Outline → canonical Structure → that grid is the Hybrid grid, extended across the context → draw rooms → Aerial/Plan/Hybrid are layer-views of this one aligned floor.

Gaps vs current (what to BUILD; the rest is already satisfied by Phase 4's ctx plate + grid overlay + windowed aerial):
- **H1** A top-level "Create Hybrid Floor Plan" action (replaces the technical "Outline/Trace" entry as the primary workflow verb) that CREATES a derived `· Hybrid` floor via createFloor(from, Background+items by default) with derivedFromFloorId, picks the enhanced aerial as its bg source, then enters the flow — instead of transforming the current floor in place.
- **H2** Prefer the APPROVED ENHANCED aerial as the Hybrid bg; "Use Enhanced Background" action to swap the visual later WITHOUT touching Structure/rooms/devices/grid; keep DEFAULT_AERIAL visual-only; "Regenerate Enhanced" explicit (paid, never auto).
- **H3** A dedicated Hybrid-floor Level step (rotate/level/pan/zoom/reset) that transforms the HYBRID background only (its own transform), not the source exterior floor. (Reuse the satellite level UI, scoped to the Hybrid floor.)
- **H4** `enhancedRegistration {translateX,translateY,uniformScale,smallRotation}` applied to the VISUAL image layer only (align an updated/enhanced image to the existing grid), NEVER to Structure geometry; flag + allow regenerate if distortion is bad.
- **H5** Make the "one continuous grid extends outward" explicit/visible (the grid overlay already spans the plate = ctx viewport; ensure it reads as one site grid from the Structure, and the viewport is generous enough to show driveway/street/parking — already aspect-padded in trCtx).
- **H6** Hybrid masking already correct (transparent plan layer over aerial; structure 0.85-white; exterior aerial shows). Verify driveway/parking/street are never covered by white plan fill (only the Structure polygon gets architectural treatment).
- **H7** Autosave/persist every stage (Hybrid floor creation, chosen asset, Hybrid level transform, outline draft, structure, grid calibration, imageToSite/registration, rooms, devices, view) + the §21 acceptance test (round-trip: create → level → outline → structure grid → extend → switch views registered → grid on/off stable → back to source unchanged → back to hybrid restores).

Sequencing: starts AFTER the in-flight Phase 7 client frees site-survey-merged.html. Supersedes Phase 10/11 ordering until done.

## DEFERRED / NOTES

- Export (`lib/survey2-export.js`) renders a ctx floor's gridless `floor.bg` without the scale grid or hybrid layers → lands in Phase 11.
- Door swing-arc side is decorative (not interior/exterior aware) — cosmetic.
- Zone label centroid is area-weighted → now uses the pole-of-inaccessibility helper path for interiors.

## BLOCKED

- (none)
