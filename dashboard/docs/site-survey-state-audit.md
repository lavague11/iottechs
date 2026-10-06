# Site Survey — State Ownership Audit (Phase 0)

Audited 2026-10-06 before the "one scaled site model" program. Purpose: record who owns each piece of survey state, what is persisted server-side vs localStorage vs transient, and the defects found. Decisions locked afterwards are listed at the end. Paths are relative to `dashboard/`.

## Headline finding

The editable building geometry (Structure + rooms) lives only in one browser's localStorage: `public/widgets/draw-floorplan.html` keys it `iot_struct_<project>_<floorIndex>` (keyed by floor INDEX). Nothing in `app/` registers that key with `tool-sync`, and the draw tool's only server call is `/api/enhance`. What reaches the server is the flattened plan IMAGE (the floor background inside the `survey2` blob). Consequence: cleared cache, second device, or a deleted/copied floor → "Edit background" reopens an empty Structure under a plan you can see but cannot edit.

## Ownership map

| State | Owner | Server | localStorage | Notes |
|---|---|---|---|---|
| Floors (name, bg, bgSource, scale, devices, started, curFloor, step) | survey widget `public/widgets/site-survey-merged.html` | ✅ `survey2` row (`project_tool_data`) | ✅ `iottechs_survey2_<id>` | Mirrored by `app/project/[accessId]/tool-sync.js`: seed from server on start when local is empty; 5 s poll pushes changes. Healthy. |
| Floor background image | survey widget | ✅ (`/api/media` URL or inline) | ✅ | Fine. |
| Structure + rooms (geometry) | draw tool | ❌ none | ✅ only, keyed by floor index | The gap; index-keyed → fragile. |
| Plan scale | split | survey `scale:{ftW,ftH}` ✅ | draw `metersPerPx` ❌ (localStorage only) | Two derived representations; the editable one is unsynced. |
| Aerial transform (level/rotation/crop/north) | `public/widgets/satellite-capture.html` | ❌ | ❌ | Transient — baked into the capture, then lost. Re-editing a satellite floor restarts from the live map at 0°. |
| Devices (pos/aim/fov/range/name/photo) | survey widget | ✅ | ✅ | Canonical; roster/mockup/proposal read from this one source. Healthy. |
| Editing session (open tool, step) | survey widget | ✅ (in blob) | ✅ | Refresh mid-edit reopens draw/satellite (`restore()`). |
| Submission revision | `app/project/[accessId]/survey-approve.jsx` | ✅ `stage_acceptances` fingerprint | — | Fingerprint of the survey2 blob. |
| Loading vs Empty (survey) | `app/project/[accessId]/site-survey-widget.jsx` | — | — | Seeds BEFORE mounting the iframe (`synced` gate) with `localHasData`; already correct. |
| Write access | `app/api/tool-data/route.js` | role-gated | — | admin/manager/sales write; tech read-only; `TOOL_KEYS` whitelist (`lib/db.js`); 8 MB cap. |

## Confirmed defects

1. Structure/rooms not persisted server-side (above).
2. Structure keyed by floor index, not a stable id — floors have no `id`. Deleting Floor 2 shifts Floor 3 to index 2, which then loads Floor 2's old geometry. Copied floors get an empty structure (image copies, geometry doesn't); "copy independence" is true only by losing data.
3. `createFloor` (survey, ~L1401) clones bg/bgSource/devices but drops `scale` → a "Background only / + items" floor loses real-world coverage (falls back to px).
4. Background-only jumps straight to Setup (`goStep(1)`) instead of landing on Background.
5. No Duplicate in the floor menu — only Rename / Delete.
6. Aerial transform not persisted — blocks persistent north and editing the capture.
7. Re-submit dirty detection misses raw geometry edits — the fingerprint covers the survey2 blob, so a Structure edit only trips "Edited · Re-submit" once Done re-exports the image.

## Healthier than feared

Survey seed/autosync, role gating, device canonicality, the LOADING→LOADED gate, and session restore are sound. Phase 1 is narrower than the blueprint assumed: give Structure a home + give floors an id, plus the small bugs above.

## Accidental duplication

- Legacy `survey` (v1, key `iottechs_sitesurvey_v2_*`) still exists beside `survey2`; service calls read it (`app/components/svc-cam-map.jsx`). Not urgent; a second store.
- Scale exists twice (survey `ftW/ftH` vs draw `metersPerPx`); resolves once geometry + scale live together.

## Decisions locked after the audit

- Grid cells stay the canonical geometry; physical scale is attached metadata (`gridBoxFeet`); pixels are only the renderer. No feet migration.
- Structure lives INSIDE the `survey2` floor record as `floor.plan = {v, cells, rooms, metersPerPx}` (rides the existing seed/autosync/fingerprint/role rails); localStorage becomes crash recovery only.
- Floors get a stable `id`.
- Persist the aerial transform + north (`floor.aerial`) in Phase 1, not at Hybrid time.
- One shared transform library (`lib/site-transform.js`) before Hybrid; widgets inline identical copies guarded by drift tests.
