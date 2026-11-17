# Fix plan — site-survey-fixes

Where each section of `site-survey-fixes.md` actually lives, from the read-only scout pass (rule 2).
Paths are relative to `dashboard/` unless marked otherwise. Line numbers were accurate at the start of
the run; verify before relying on one.

**Stack correction that applies to every section:** the spec assumes Supabase + RLS + SQL migration
files + typecheck + lint. None exist here — it is **node:sqlite** via `lib/db.js`, permissions are
server-side role checks, schema changes use the ensure-column pattern, and the gates are `npm test`
and `npm run build`. See `docs/decisions.md` D1.

---

## Order of work (rule 3)

`L → A → B, C → G, H, I → M, O → N → J → E, D, F, K`

Deviation, logged as D5: **J and K start immediately, in parallel with L.** Rule 38 permits
independent sections in parallel when they touch different files and names J and K as examples. J is
`lib/appointment-reminders.js` + `lib/email.js`; K is `app/components/screenshot-annotator.jsx` +
`bug-reporter.jsx`. Neither touches the survey store, the proposal components or the schema. Everything
that does touch those runs strictly sequentially.

---

## L + A — Site Survey saving, loading and step flow

**The survey tool is an iframe**, not React: `public/widgets/site-survey-merged.html` (3248 lines).
The React side is only a host wrapper.

| Piece | Path |
|---|---|
| Host wrapper | `app/project/[accessId]/site-survey-widget.jsx` — iframe src :75, `WIDGET_VERSION` :14, seed :90, autosync :96, message handler :104-122 |
| Planner rail (the 5 spec steps) | `app/project/[accessId]/system-planner.jsx` — `railStep` :38, step defs :256-268, rail→iframe mapping :231-233 |
| Page mount | `gateway-client.jsx:2423` and `:3250` (`<SystemPlanner initialStep=…>`) |
| Tool itself | `public/widgets/site-survey-merged.html` |
| Devices list | `app/project/[accessId]/survey-devices.jsx` ("No cameras yet" :163) |
| Camera Angles | `public/widgets/cctv-mockup.html` :380, :434, :442 — **a different widget** |

### Storage
Tool key is **`survey2`** (legacy `survey` is fallback only, `lib/db.js:7970-7975`).

- Client: `localStorage` key `iottechs_survey2_<accessId>` (`merged.html:2447`), IndexedDB mirror via
  `lib/tool-sync.js`.
- Serialize `merged.html:2460` → `{floors, curFloor, step, dim, submitted, iconSize, showFov,
  gridMode, sideCollapsed, allAngles, bgTool}`; `save()` :2473 writes localStorage then `pushServer()`
  :2468 → `POST /api/tool-data`; debounce 400ms (:2454).
- Server: `app/api/tool-data/route.js` → `lib/db.js:7218 saveToolData` upsert on
  `(project_access_id, tool)`; table at `lib/db.js:1415`.
- Load: `seedToolData` (`lib/tool-sync.js:25`) — **localStorage wins when non-null**; the server copy is
  read only when localStorage is empty. Then `startToolAutosync` (:78) pushes localStorage to the
  server every 5s.

### Four distinct root causes found

1. **The empty-blob overwrite (the "cameras vanish" bug).** `restore()` (`merged.html:2922`) swallows
   every exception — the catch only calls `renderFloorTabs`. A throw anywhere in restore leaves
   `floors = [default]` in memory, and the next `save()` 400ms later overwrites **both** localStorage
   and the server row with that empty default. Nothing warns. This is the prime suspect for L's
   "TOP PRIORITY — survey data is not being saved" and needs a regression test.
2. **Step is clamped to 0..1.** `goStep` (`merged.html:3048`) does
   `idx = Math.max(0, Math.min(1, idx))`. Any saved step ≥ 2 is clamped to 1, so Placement, Camera
   Angles and Approval can never be restored — this is exactly "reopen always lands on Layout" (L) and
   "after a refresh the survey opened on Layout" (A.1). The same clamp, combined with the rail mapping
   at `system-planner.jsx:231-233` where **Layout and Camera Angles both map to iframe step 1**, is why
   Next from Background lands on Placement (A.1 first bug).
3. **Two different camera arrays** — the clue in L is literal. The Devices list is fed only by
   `postMessage "iotSurveyDevices"` (`merged.html:2313`, built by `reportDevices` :2303 from the
   iframe's **in-memory** `devices`); Camera Angles reads `getProjectCameras` (`lib/db.js:7486`), which
   parses the **server** `survey2` row. Either can be full while the other is empty. Both must read one
   saved list.
4. **Scale reset.** `f.scale {ftW,ftH}` per floor. There is no literal "4.3" — the grid label is
   computed by `gridBoxFtFor` (`merged.html:2657`), and when `curFloorScale` is null it silently falls
   back to a derived default, which is the "1 box = 4.3 ft → 20 ft" jump. Any path that leaves scale
   null causes it.

### Submit lock (L's silent read-only)
`frozen() = RO || submitted` (`merged.html:2894`) hides tools **by CSS alone** (:591-592, :291, :297,
:91, :101) with no banner — the only text is the status label "Submitted" (:2902). The spec's
"Submitted — read-only · Edit survey" banner does not exist yet; unsubmit is staff-only today. Server
truth is `stage_acceptances` via `acceptStage("submit_site_survey", …)`
(`proposal-actions.js:1311`), pushed back into the iframe as `iotSurveySubmitState` (:2915).

### Landmines
- **Two separate cache-busters**: `site-survey-widget.jsx:14` and `merged.html:934` (`draw-floorplan.html?v=`).
  Bump both or the iframe serves stale code.
- `tests/consulting-messages.test.mjs` pins the `iotSurvey*` message names and `EXPECTED_SURVEY_CMDS`
  by design — renaming a message breaks it deliberately.
- Changing the blob shape (`devices`, `bg`) **voids every customer approval** via
  `survey2HasData`/`survey2Meaning` fingerprints (`lib/tool-data.js:47-80`), and breaks
  `getProjectCameras`, `survey2CameraCount`, `getSurveyLibrary` (`db.js:2120`), `getSvcSurveyMap`
  (`db.js:4545`).
- `POST /api/tool-data` returns "Read-only for your role." for non-office roles, and
  `tool-sync.js:104` then latches that tab read-only forever.

---

## B, C, D, E, F — Survey widget surface work

All inside `public/widgets/site-survey-merged.html` plus `survey-devices.jsx` (B) and the project-page
card (F). These share the survey store, so per rule 38 they run **sequentially after L lands**, not in
parallel. A dedicated scout runs once L's root cause is fixed, since L's changes will move these lines.

- **B** (device-card X + 5s Undo) — `survey-devices.jsx`; must keep camera IDs stable (`cid`).
- **C** (delete the only floor) — floor tabs in `merged.html`.
- **D** (Enhance smears the Google watermark) — background enhance path in `merged.html`.
- **E** (mode menu, Stairs, Block, shapes, Select tool, nested rooms, right-click menu, Street/Backyard,
  dimension-label overlap) — the drawing tools; the largest surface in the spec.
- **F** (survey card shows "Completed ✓" after submit) — the project-page tool card; must match the
  Proposal card's language, which is the one tool-card language per the `tool-card-status-language`
  convention.

---

## G, H, I — Proposal and Addendum

Scout pending (dispatched in parallel; different files from L). Known anchors:

- Proposal item editor and picker: `app/project/[accessId]/proposal-items-editor.jsx`,
  `proposal-start.jsx`, add-bar presets (client `localStorage` key `iot_price_defaults`).
- Proposal truth model is **LOCKED** (`CLAUDE.md`): `getActiveProposal()` = staff working draft,
  `getPublishedProposal()` = customer/contractual truth. Sent versions are immutable, row-per-version.
- **I is RED-lane** — signed-addendum totals feeding project TOTAL / BALANCE / payment plan is money
  calculation and signature binding. Implement the document, version history and PDF; do **not**
  silently rewrite the financial resolvers. Anything that changes how a balance is computed stops and
  goes in `docs/blocked.md` for the owner.
- Signing must reuse `lib/esign/` (the only signing path) — `proposal-source.js`, `store.js`,
  `session.js`, `complete.js`, `flatten.js`, `certificate.js`.
- Addendum PDF reuses `lib/proposal-pdf.js` and must take its filename from `lib/doc-filename.js`.

---

## M, N, O — One portal, My Projects, legacy migration

**There are two customer code paths today**, which is the whole of M:

1. **Portal V2** (new, 3-step): `app/project/[accessId]/customer-portal.jsx`, mounted at
   `gateway-client.jsx:3105` inside the `isCustomerView && customerPortalV2` branch (:2984). Logic in
   `lib/customer-portal.js` — eligibility :9-12, `customerPortalV2For` :17-23, `viewAvailability`
   :101-114, `portalCards` :123-129.
2. **Legacy deck** (old 5-step): `gateway-client.jsx:2300` (`deckMode`, hard-true at :1610), mounted
   for customers at :3436 when V2 is off.

A customer gets V2 only if the project is eligible (type A/B; null type defaults to "A") **and**
(`portal_version === "v2"` or (`portal_version` null and the `CUSTOMER_PORTAL_V2` secret is on)).

**Root cause of M's staff/customer mismatch:** `staffHubFor` (`lib/staff-hub.js:13-18`) ignores the
`staff_view` column, so **staff always get the new hub** for A/B projects while the customer still gets
the old deck unless the flag is on. Two different views of one project.

**Why 50% vs 45%** — three different percent formulas, not a data bug:

| Surface | Formula |
|---|---|
| Legacy deck bar | `phasePct` `gateway-client.jsx:2138-2145` (index over the stage list) |
| Legacy customer readout | `custProgressPct` :2817-2818 (item count: survey, mockup, accepted, signed, deposit, balance, completed) |
| Hub + V2 | `simpleProgressPct` `lib/staff-hub.js:44-56` (milestones 33/40/45/50/66/90/100) |
| /my-projects | `stageNum/stageTotal` index, `my-projects-client.jsx:54-56` |

**N — `/my-projects` never recomputes stage.** The loader (`app/my-projects/page.jsx:16`) uses
`getProjectsByContactEmail` and passes the **raw `projects.stage` column** straight through
(`db.js:2859`). A project whose proposal is signed but whose stored stage is still "proposal" renders
"Stage 2 of 5 · Needs Review" — that is exactly the Pizza Bay and ASC0041 symptom. The fix is to
recompute through `resolveProjectStatus` (`lib/project-status.js:34-67`), not to reword the copy.
Secondary: that loader matches on `contact_email` only (`db.js:3325`), while project ownership is
canonically email **OR** phone.

### Found during the live pass — a tech sees customer financials (belongs to M)

**A technician is shown the PROJECT BALANCE card: total, paid, remaining and pending add-on amounts.**
Observed live on ASC0128 (`?view=addendum&preview=tech`): "Total $3,107 · Paid $0 · Remaining $3,107 +
$200 pending · Pending add-on · awaiting approval +$200". This contradicts the Definition of Done rule 4
("tech never sees retail prices or customer financials") and rule 7 of the run spec (enforce server-side).

It is **pre-existing**, not caused by any section in this run — section G touched neither file. The chain:

1. `resolveSessionView` (`page.jsx:48-86`) returns the preview role as the real `initialView`, so this is
   the genuine tech path, not a cosmetic projection. A normally-logged-in tech resolves to
   `initialView === "tech"` the same way.
2. `page.jsx:393-399` sets `staffFinance = financeSummary(...)` whenever `staffHub` is true — **no role
   check at all**. `staffHubFor(p)` (`lib/staff-hub.js:13-18`) keys off project type only.
3. `staff-hub.jsx:374` renders the card gated solely on `finance?.hasContract`.

So the figures are computed and sent by the server, not merely hidden in the UI. Section M must strip
`staffFinance` for roles without a customer-financials capability (`can(role, "customer.financials.view")`
already exists and is what `readonly` holds), rather than hiding the card client-side.

### Found during section J's verification — belongs to M, not J

`pickUpcomingAppt()` in `lib/customer-portal.js` returns the **whole schedule event object** to the
customer portal — including the staff `invited` list, the booker's `notes` and `changeRequests`. That is
internal data reaching a customer, which breaks rule 7 and the Definition of Done's role-visibility
rule, and it is pre-existing rather than anything section J introduced (J's new `bookedAt` is a bare
timestamp carrying no cost, payout, commission or margin). The same function also parses with
process-TZ `new Date(\`${e.date}T${time}:00\`)`, the same bug class section J just fixed in the reminder
sweep. **Section M must sanitize this to the fields the appointment card actually renders, server-side,
and reuse the explicit-zone helper.**

**O — migration.** No migration script exists yet. `db.js:346-353` (`OLD_TO_NEW`) renames legacy stage
keys only; it does not recompute percent or status. The migration must recompute from real evidence
through the existing resolvers (`lib/project-status.js`, `lib/stage-flow.js`, `db.buildStageFacts`) and
read the **published** proposal, never the working draft. Two traps: a signed proposal whose payload
drifted reads as unsigned by fingerprint (`db.js:2914-2915`), so the migration must not treat drift as
unsigned-on-purpose or vice versa; and `deposit_recorded` means *confirmed*, while `deposit_submitted`
means *any pending* — `customerTodo` uses recorded, which is why a pending deposit still says
"Pay your deposit". **Dry-run only** (rule 6) → `docs/migration-report.md`.

---

## J — Appointment reminder (in flight)

| Piece | Path |
|---|---|
| Sweep | `lib/appointment-reminders.js` — parse :26, window :28-29, dedupe key :31, claim :33, send :38 |
| Template | `lib/email.js` — "tomorrow" hardcoded at :896, :1035, :1039, :1042; `techName` fallback :890, rendered :959-960 |
| Helpers to reuse | `lib/send-schedule.js:21,40-49` (`tomorrowLocalAt`, `friendlyWhen`) |
| Scheduler | `instrumentation.js:19-25` — first sweep 90s after boot, then every 30 min (the "hourly" comment at `db.js:7293` is stale) |

**Root cause:** the sweep has no day-before concept. `diff = t - now; if (diff <= 0 || diff > H24)` is a
sliding millisecond window, so it fires the first time an event falls inside 24 hours — 1:25 PM for a
3:00 PM same-day appointment — and the wording is a hardcoded literal, so it still says "tomorrow".
Two extras the scout found: the claim is taken before the send and never released, so a failed send is
never retried; and the dedupe key uses `ev.id`, which survives a reschedule, so a moved appointment
never re-arms.

---

## K — Crop in the bug-reporter screenshot editor (in flight)

| Piece | Path |
|---|---|
| Host | `app/components/bug-reporter.jsx` :38, editor open :115 / :280, `onAnnotated` :120-133, `uploadMedia` :20 |
| Editor | `app/components/screenshot-annotator.jsx` :24 — **632 lines, already over the 500-line limit** |
| Coords | `pt()` :159-162; shapes are in natural canvas px; the view transform is CSS only |
| Output | `flatten()` :319 (natural resolution), `attach()` :334 — returns only pages with `key == null` or in `dirtyRef` |

**Main landmine:** the undo history `H = {stack: shapeArrays[], i}` holds **no base image**
(`commit()` :74 pushes a shapes array). Crop cannot be undone through the existing stack without
extending each entry to carry `{shapes, base, w, h}`. Second: a crop-only change with no shape edits
must still be added to `dirtyRef`, or Attach silently skips it and uploads the uncropped image. Third:
the file is already over the line limit, so crop state belongs in a sibling module. Note the Trash icon
labelled "Clear" is what the spec calls Delete, and the Delete *key* is wired to undo (:307).

---

## Not yet verified anywhere

- Where `initialStep` for `<SystemPlanner>` comes from.
- Whether `restore()` can actually throw on a real blob (the hypothesis behind L's root cause) — the
  first thing the L fix must prove with a test.
- The floorplan viewer's unit handling (O: "1 m" should be feet).
- Whether ASC0041 / ASC0065 have `portal_version` or `staff_view` set, and each one's `project_type`.
- Whether the `staff_view` column is still read anywhere.
