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

## IN PROGRESS

- **Phase 7 — Site Intelligence (AI, gated).** `/api/site-intel` reusing the enhance OpenAI/vault infra; suggestion-first (AI suggestion → reviewed draft → canonical); ZERO AI calls except an explicit "Analyze Site" action; env-gated (off without `OPENAI_API_KEY`); persisted runs with cost protection (reuse by source hash, mark outdated on change, no auto-rerun); mocked in tests.

## PLANNED

- **Phase 8 — Device Intelligence (deterministic-first).** Geometry utils (device→room/zone, FOV∩zones, mounted wall, facing); coverage-driven camera/speaker name SUGGESTIONS (never auto-overwrite a user name); AI naming separately gated/optional.
- **Phase 9 — Walkthrough + mobile polish.** Consumes canonical floors/rooms/zones/devices/photos/FOV/speaker coverage; desktop map+media, mobile swipe cards (subtle slide/crossfade, no cinematic zoom); speakers as stops.
- **Phase 10 — AI Enhanced Floor Plan (gated).** From canonical vectors (not a screenshot); AI visual layer UNDER canonical walls/labels/openings/devices; never alters geometry; stale-on-edit ("Update"); cache by plan revision.
- **Phase 11 — Customer / Proposal / Install integration.** Same canonical survey; customer read-only polish (hide handles/confidence/tools); proposal + install consume canonical device names/locations/coverage; server-side role visibility; the deferred PDF/export ctx-plate + grid gap (`lib/survey2-export.js`).

## DEFERRED / NOTES

- Export (`lib/survey2-export.js`) renders a ctx floor's gridless `floor.bg` without the scale grid or hybrid layers → lands in Phase 11.
- Door swing-arc side is decorative (not interior/exterior aware) — cosmetic.
- Zone label centroid is area-weighted → now uses the pole-of-inaccessibility helper path for interiors.

## BLOCKED

- (none)
