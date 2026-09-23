# Lifecycle sources of truth — phases / stages / steps trace

Investigation 2026-09-21 (read-only at the time); resolution shipped 2026-09-21/22 — see **Resolution** below. Paths are relative to `dashboard/`.

## Resolution — what shipped

| Commit | Change | Closes |
|---|---|---|
| `8510c71` | `stageProgress` counts only cards carrying a `state`; `mergedPage` (and the Consulting wrapper) derive `state` from their children → admin and tech read the same "N of M". Deleted dead `TECH_STAGES` + `STATUS_BUCKETS`; `spec.js` asserts `STAGES` ≡ `MASTER_ORDER` key order at load; "4-phase" comments fixed; `PHASE_BLOCKS` / `ROLE_NOTES` / `FINDINGS` re-synced to the live deck (stale `CUSTOMER_PHASES` finding removed); role map shows "N steps · M gated" (10 of 16); `deck-preview` slide names derive from `PHASES`. | M1 (stale text), **M3**, M4, §4 repoints |
| `e8c56ed` | Tech's Proposal card tracks `tech_signed_name` (their "Accept" step), not the proposal's sent/accepted status. | follow-up noted under M3 |
| `4c369c2` | **Survey-skip gate:** `projects.survey_skipped_at/_by`; fact `survey_skipped` satisfies both Consulting requirements in `STAGE_FLOW`; deck ••• "Skip survey / Restore survey" (admin/manager, two-step confirm, logged `override`/`change`); skip auto-advances, restore never rewinds. Also fixed a client/server fact-name mismatch: `custFacts` now carries `date` (stage-flow's inquiry check), not only `appt_date`. | **M6**, plus a bug not in the original report |
| `c6eb6ba` | Role map renders a per-phase **GATE OUT** block from `STAGE_FLOW`'s check-backed requirements; requirements may declare a `waiver` (Consulting → "or survey skipped"). Phase strip + flow grids are 5 columns (were 4 for a 5-phase bar). | M2 (visibility of enforceable vs advisory) |
| `b1499fb` | Static briefing re-synced to the live model and checked in at `docs/role-flow-map.html`. | D17 |
| `ee38599` | `/dev` links the briefing; admin-only route `/dev/role-map/static` serves it. | — |

Still open by design: Phase-2 facts for install-complete + joint QC sign-off (6 advisory steps); Sales has no Install branch; Vendor/Readonly have no render branch.

## Headline answers

**Hypothesis (CUSTOMER_PHASES = 5, dead, superseded by a 4-entry bar): DENIED — it no longer exists.**
`CUSTOMER_PHASES` was born in `18bed97` (2026-07-13, 5 entries: Getting Started · Your Proposal · Approved · Installation · Complete), superseded the same day by the unified 4-phase `PHASES` (`f1ef8f6`), which was split to 5 two days later (`f5bdc35`, 2026-07-15). The dead trio (`CUSTOMER_PHASES`, `customerStagesForType`, `masterToCustomerKey`) was **deleted in `b7c2435` on 2026-08-24**. Zero references remain in code. The only survivors were two stale *strings*: `lib/project-blocks.js:85` (the FINDINGS entry shown on /dev/role-map) and the static `role-flow-map.html` export — both removed (`8510c71`, `b1499fb`). **There is no 4-entry bar constant anywhere in the live codebase.** Every progress bar renders `phasesForType(project_type)` → `PHASES` (5).

**Symptom A (bar shows 4, map shows 5): not a Level-1 constant disagreement.** The only way the live bar renders 4 dots is a **type C (Service Call) project** — `TYPE_STAGES.C` has no `proposal`/`approval_deposit`, so `phasesForType("C")` drops `ph_proposal` → Consulting · Install · Closeout · Completion. That is INCLUSION DIFFERENCE and correct. Everything else that says "4" is stale text (see Mismatches §M1).

**Symptom B (Admin "0 of 1" vs Tech "0 of 2" on Install): TRANSFORM DRIFT, and neither number is a lifecycle level.** Both come from `deck-view.jsx:25 stageProgress()` = `tools.length` / `tools.filter(state==="done")`. It counts **UI tool cards** on the slide. Admin/manager Install goes through `mergedPage()` (`gateway-client.jsx:2218`), which collapses Addendum + Work Order into ONE wrapper card **with no `state`** → `0 of 1`, permanently. Tech skips the merge (`:2482 return tools`) → two raw cards, Addendum has no `state` → `0 of 2`, max reachable `1 of 2`. Same source list, different transform; and the denominator includes stateless cards on both sides. Proof at §M3. **Fixed in `8510c71`** — verified live: admin and tech both read `0 of 1` on Install.

---

## 1. Definitions

| # | Name | Level | File:line | Count | Entries (in order) | Last meaningful edit |
|---|---|---|---|---|---|---|
| D1 | `PHASES` | **L1 phase** (canonical) | `lib/spec.js:62` | 5 | ph_survey Consulting · ph_proposal Proposal · ph_install Install · ph_wrap Closeout · ph_complete Completion (+ `techLabel` Survey/Accept/Install/Closeout/Completion, `status` word, `members`, `primary`) | `f5bdc35` 2026-07-15 (4→5 split); created `f1ef8f6` 2026-07-13 |
| D2 | `phasesForType(type)` | L1 derived | `lib/spec.js:73` | 5 (A/B) / **4 (C)** | filters D1 members by `stagesForType`; drops empty phases | 2026-07-13 |
| D3 | `STAGES` | **L2 backend stage** (labels/buckets) | `lib/spec.js:15` | 9 | inquiry · site_survey · proposal · approval_deposit · schedule("Fulfillment") · install · qc · payment · completion | `d8404e7` 2026-07-10 (label rename 07-07 note) |
| D4 | `MASTER_ORDER` | **L2 backend stage** (order, canonical for gating) | `lib/stage-flow.js:9` | 9 | identical key order to D3 | 2026-07-10 |
| D5 | `TYPE_STAGES` / `stagesForType` | L2 derived (per type) | `lib/spec.js:35` | A=9, B=9, **C=6** | C: inquiry · schedule · install · qc · payment · completion | 2026-07-10 |
| D6 | `STAGE_FLOW` | **L3 requirement step** (canonical) | `lib/stage-flow.js:19` | **16** | inquiry 1 · site_survey 1 · proposal 2 · approval_deposit 4 · schedule 2 · install 2 · qc 2 · payment 1 · completion 1 | `4397ab6` 2026-09-21 (gate helpers added; matrix itself `d1377c3` 2026-07-15) |
| D7 | `AUTO_STAGES` | L2 subset | `lib/stage-flow.js:17` | 5 | inquiry, site_survey, proposal, approval_deposit, payment | 2026-07-12 |
| D8 | `TECH_STAGES` | L1-ish (old tech 4-step bar) | `lib/spec.js:45` | 4 | proposal "Work Order Created" · install · qc · payment "Payout" | 2026-07-10 — was DEAD, 0 usages → **deleted `8510c71`** |
| D9 | `STATUS_BUCKETS` | L2 grouping | `lib/spec.js:9` | 3 buckets / 9 keys | OPEN 4 · IN_PROGRESS 3 · CLOSED 2 | 2026-07-10 — was DEAD, 0 usages → **deleted `8510c71`** |
| D10 | `UPCOMING` | L2-keyed copy map | `app/project/[accessId]/gateway-client.jsx:1372` | 9 | one `{label,sub}` per master stage | 2026-07-10 — alive (`:2856`) |
| D11 | `STATUS_CLASS` | L1 status-word → css | `gateway-client.jsx:1369` | 4 words | Pending · Reviewing · In Progress · Finalizing (Closeout+Completion share "Finalizing") | 2026-07-13 |
| D12 | `customerStatus(stage)` | L2-keyed translation | `lib/customer-status.js:17` | covers all 9 | if-chain over master keys | `84e96de` 2026-09-08 |
| D13 | `customerNextAction` switch | L2-keyed | `lib/customer-action.js:74-114` | 9 cases | one `case` per master stage | 2026-09 |
| D14 | `stageFloorFacts` / `statusMilestones` | L2 / L3-ish | `lib/project-status.js:17,45` | 5 milestones | Site survey · [Mockup] · Proposal accepted · Agreement signed · Deposit paid | 2026-08 |
| D15 | `PHASE_BLOCKS` | L1-keyed **tool block** list (not lifecycle) | `lib/project-blocks.js:33` | 5 phases / 21 blocks | hand-maintained mirror of the deck's tool cards per role | was stale vs. deck (listed Shipment Tracking, Install Scheduling, "Proposal Views") → **re-synced `8510c71`** to Addendum / Work Order / Project Ready / Set Up Your Phone etc. |
| D16 | `STAGES` (sample) | L1 sample data | `app/deck-preview/page.jsx:9` | 5 | now `SAMPLE` + `STAGES = PHASES.map(...)` — names/pills derive from D1 (`8510c71`) | preview-only page |
| D17 | `MODEL` | L1 + L3 counts, static | `docs/role-flow-map.html` (was `~/Downloads`) | 5 phases, steps 2/6/4/3/1 = 16, gated 2/6/1/1/0 = 10 | hand-maintained snapshot, re-synced + checked in `b1499fb`; served admin-only at `/dev/role-map/static` (`ee38599`) | dated in its footer (2026-09-22) |
| D18 | `STAGE_FOR_STATUS`, `OLD_TO_NEW` | L2 migration maps | `lib/db.js:48, :286` | — | legacy status → master key | 2026-07-10 |
| D19 | `custSteps` | customer % item list (L3-ish, item-based) | `gateway-client.jsx:2624` | 5–7 (conditional) | [survey] [mockup] accepted · signed · deposit · balance · completed | `a518293` 2026-08-25 |
| D20 | Hardcoded key subsets | L2 subsets | `app/project/[accessId]/page.jsx:144` (PRE_APPROVAL 3), `app/sales/page.jsx:33,41`, `app/tech/page.jsx:15`, `app/projects/projects-client.jsx:52`, `gateway-client.jsx:2434` | 2–5 each | filter/branch arrays over D3 keys | various |

DB: `projects.stage` is free TEXT holding a D4 key; no CHECK/enum. `stage_history` / `logProjectEvent` store keys. No seed enumerates the set beyond D18.

---

## 2. Surface → constant → transform → count

| Surface | Level shown | Constant read | Transform | Rendered count | file:line |
|---|---|---|---|---|---|
| Project progress bar (`<ProgressBar>`) | L1 | D2 `phasesForType(project_type)` → `stageList` (tech gets `techLabel`) | `stages.length`; `pctOverride = phasePct` (index into **D5 master stages**, clamped 10–97, 100 only when `completed_at`) | **5** (A/B) · 4 (C) · % is L2-based | `gateway-client.jsx:2030-2036, 2069-2076, 3053-3059`; `:489-501` |
| Deck rail / slides (`deckStages`) | L1 | D2 `phaseList` + `phaseGate()` | one slide per phase; `locked` from D6-backed gate; `pct` coarse ramp | **5** (A/B) · 4 (C) | `gateway-client.jsx:2584-2621` |
| Deck footer "N of M complete" | **L4 — UI tool cards** (not lifecycle) | `deckToolsFor(pk)` output | `stageProgress`: `total = tools.length`, `done = state==="done"`; **admin/manager lists pass through `mergedPage()` → 1 stateless card** | Admin Install **0 of 1**, Tech Install **0 of 2**, Consulting 0 of 1 (all roles) | `deck-view.jsx:25-29, 499-518`; `gateway-client.jsx:2218-2236, 2481-2482` |
| Deck readout % (top) | customer: item-based; others: coarse | D19 `custSteps` (customer) else slide `pct` | `filter(Boolean).length / length` | 0–100 in 1/5–1/7 steps | `gateway-client.jsx:2624-2633`; `deck-view.jsx:448` |
| Role & Flow Map (/dev/role-map) | L1 + L2 + L3 | D1 `PHASES`, D6 `STAGE_FLOW`, D15 `PHASE_BLOCKS` | `PHASES.length`; `Σ members.length`; `Σ STAGE_FLOW[m].length` | **5 · 9 · 16** | `app/dev/role-map/role-map-client.jsx:18-28` |
| Static role-flow-map.html | L1 + L3 | D17 hand-typed | none | 5 · 9 · 16 (10 gated) | `docs/role-flow-map.html` via `/dev/role-map/static` |
| Role map GATE OUT block (new, `c6eb6ba`) | L3 (enforceable only) | D6 `STAGE_FLOW` | `filter(r => r.check)` labels + `waiver` | per phase: 2 / 6 / 1 / 1 / terminal | `role-map-client.jsx` `gate:` |
| Header status pill word | L1 | D1 `status` via `phaseStatusWord(masterToPhaseKey(stage))` | lookup; D11 maps 4 words | 1 word | `gateway-client.jsx:1369`; `lib/project-status.js:35` |
| Gate banner (`.dv-gate`) + locked rail segments | L1 lock, L3 reason | `phaseGate(floorFacts, assignments, type, stage)` → D2 + D6 (`blockingReqs`, check-backed only) | walks D4 order forward from current stage | 5 lock flags + 1 reason | `lib/spec.js:95-114`; `deck-view.jsx` `.dv-gate` |
| Customer "Stage X of Y" card (/my-projects) | L1 | D2 `phasesForType(type)` (falls back to D1) | `indexOf(masterToPhaseKey(stage))+1` / `length` | X of **5** (A/B) · of 4 (C) | `app/my-projects/my-projects-client.jsx:15,27-29,838` |
| Customer status copy | L2-keyed → 1 label | D12 `customerStatus(stage, facts)` | if-chain | 1 label | `lib/customer-status.js:17` |
| Customer next action | L2-keyed | D13 switch | per-stage | 1 action | `lib/customer-action.js:74` |
| Status popover milestones | L3-ish | D14 `statusMilestones(facts)` | 4–5 items, conditional mockup | 4–5 | `lib/project-status.js:45` |
| Technician work-order view (Install slide) | L4 cards + install-checklist internals | `deckToolsFor("ph_install")` for tech → `[Addendum, Work Order]`; InstallChecklist reports `{allDone, pct, items}` | footer counts cards; checklist % counts **line-item stages** (pay-weighted for staff, step-weighted for customer) | "0 of 2" footer; separate `%` inside the checklist | `gateway-client.jsx:2408-2427, 2482`; `install-checklist.jsx:320-334` |
| Admin work-order view (Install slide) | L4 cards | same list → `mergedPage("Install", tools, {labelFirst:true})` | collapses to `[{name:"Install", wide, node}]` — **no `state` key** | "0 of 1" | `gateway-client.jsx:2481, 2218-2236` |
| Server stage advance / auto-advance | L2 + L3 | D4 `MASTER_ORDER`, D6 via `missingReqs`, D7 `AUTO_STAGES`; `canAdvanceTo` (D6 check-backed) | `maybeAutoAdvance` cascades forward only | — | `lib/db.js:2405-2413`; `actions.js:338-365` |
| Server completion % | none | — | **no server-side percentage exists**; all % is client-side | — | — |
| Old-layout upcoming card | L2 | D10 `UPCOMING[projectStage]` | lookup | 1 | `gateway-client.jsx:2856` |

---

## 3. Conditional / skippable inclusion

| Item | Level | Always? | Where the inclusion decision lives |
|---|---|---|---|
| `ph_proposal` phase | L1 | **Conditional** — absent for type C | `spec.js:35-42` `TYPE_STAGES.C`, applied by `phasesForType` |
| `proposal`, `approval_deposit`, `site_survey` stages | L2 | Conditional (type C omits) | same |
| Survey requirement `site_survey[0]` | L3 | Always listed for A/B; **never "explicitly skipped"** in code — `check: !!p.survey_accepted` only. The ADT/monitoring skip described on the map does not exist as a code path; ADT jobs live in a separate `adt_applications` flow (`adt_completed` stage key, `projects-client.jsx:53`) | `stage-flow.js:23` |
| `schedule[1]`, `install[0-1]`, `qc[0-1]`, `completion[0]` | L3 | Always listed, **never enforced** (no `check`) — advisory only; `blockingReqs` ignores them | `stage-flow.js:36-53, 73-77` |
| Mockup milestone / mockup custStep | L3-ish | Conditional on `mockup_has` | `project-status.js:47`, `gateway-client.jsx:2626` |
| Deck tool cards: Addendum (customer), Shipment Tracking, Create Work Order, System QR (customer), Project Ready, Set Up Your Phone | L4 | Conditional on role/data; Tracking archived behind a const | `gateway-client.jsx:2351, 2394-2400, 2408, 2430-2460, 2494` |

### Mismatches

**M1 — "4 phases" vs 5.** Tag: **STALE TEXT + INCLUSION DIFFERENCE**, not REAL DRIFT. *Stale text cleared in `8510c71`; the type-C 4-phase rendering is correct and unchanged. The role map's own 4-column grids (a real 5-in-4 layout drift) fixed in `c6eb6ba`.*
No 4-entry L1 constant is live. Sources of "4": (a) comments still say "4-phase" — `spec.js:80`, `gateway-client.jsx:2027-2031` ("the 4 phases present for this type"); (b) `project-blocks.js:85` FINDINGS string and the static HTML FINDINGS both assert "superseded by the 4-phase bar (2026-07-13)" — true for 48 hours, false since 2026-07-15; (c) D11 has 4 status words because two phases share "Finalizing"; (d) dead D8 `TECH_STAGES` is 4 entries; (e) a **type C project legitimately renders 4** dots and "Stage X of 4". If the observed bar had 4 dots on a real project, it was a Service Call (correct) — verify by access-id prefix `C`.

**M2 — Role map 16 steps vs. gate.** Tag: **CROSS-LEVEL / INCLUSION DIFFERENCE (correct).**
The map sums all 16 D6 rows; `phaseGate` only enforces the 10 rows that have a `check()` (inquiry 1 · site_survey 1 · proposal 2 · approval_deposit 4 · schedule 1 · payment 1). Same constant, deliberate filter (`blockingReqs`). Not a bug — but the map did not distinguish enforceable from advisory steps (now shows "N steps · M gated").

**M3 — Admin "0 of 1" vs Tech "0 of 2" (Install).** Tag: **TRANSFORM DRIFT** (same source list, different post-transform), and **CROSS-LEVEL** relative to any lifecycle level (it counts L4 tool cards, not D6 steps). ***RESOLVED `8510c71`*** (transform fixed as recommended below). *Follow-up `e8c56ed`: the tech's Proposal card read "Stage complete" as soon as the proposal was sent — it now tracks their own work-order acceptance.*
Trace of the **1**: `deckToolsFor("ph_install")` for admin builds `tools = [Addendum{no state}, Work Order{state: installDone?"done":"active"}]` (`:2409, :2414`) → `:2481 mergedPage("Install", tools, …)` → returns `[{ name:"Install", label, wide:true, node }]` (`:2222`) — the wrapper has **no `state`** → `stageProgress` → `total=1, done=0` → "0 of 1 complete" beside the Continue button (`deck-view.jsx:511`). Can never reach 1 of 1.
Trace of the **2**: tech is not staff → `:2482 return tools` unmerged → `total=2`; Addendum has no `state` so `done ≤ 1` → "0 of 2" (`deck-view.jsx:517`), max "1 of 2". Same defect on Proposal (admin 0 of 1 vs tech 0–1 of 1) and Closeout (admin 0 of 1 vs tech 0–2 of 2), and Consulting reads 0 of 1 for everyone because the Planner wrapper is stateless (`:2311`).
Neither number reflects D6 `install` (2 advisory steps) nor the checklist's own line-item progress (`install-checklist.jsx:320`). The Continue button's `ready` (`:2618`) ignores `pg` entirely, so the text is decorative and wrong. Fix belongs in the transform (`mergedPage` should derive `state` from its children; `stageProgress` should count only cards that carry a `state`), not in any constant.

**M4 — `PHASE_BLOCKS` vs live deck tools.** Tag: **REAL DRIFT (documentation surface).** ***RESOLVED `8510c71`*** (re-synced by hand; still a mirror, not generated). At the time of the trace D15 no longer matched `deckToolsFor` (lists Install Scheduling, Shipment Tracking, Proposal Views; lacks Addendum, Project Ready, Set Up Your Phone, Create Work Order gating). /dev/role-map therefore shows blocks the project page doesn't render.

**M5 — `custProgressPct` vs `phasePct`.** Tag: **CROSS-LEVEL (intentional).** Customer readout is item-based (D19); staff readout is L2 index-based. Documented in code; not a bug.

**M6 — Survey "explicitly skipped" gate on the map.** Tag: **REAL DRIFT (spec vs code).** ***RESOLVED `4c369c2`*** — the skip now exists in code (see Resolution); map gate text reads "or survey skipped" from a `waiver` on the requirement (`c6eb6ba`). The map/HTML states the Consulting gate accepts a skipped survey; `STAGE_FLOW.site_survey` has no skip path, and `blockingReqs` will hard-lock Proposal for any A/B project without `survey_accepted`. ADT/monitoring work avoids this only because it isn't a `projects` lifecycle at all.

---

**M7 (found during the fix, not in the original trace) — client/server fact-name mismatch.** Tag: **REAL DRIFT.** `custFacts` carried the survey date only as `appt_date`, but `STAGE_FLOW.inquiry` reads `date` (the name `buildStageFacts` uses), so the client-side gate showed "Waiting on the team: Survey appointment scheduled" on projects that already had one. ***RESOLVED `4c369c2`*** — `custFacts.date` added. Lesson recorded in memory: client facts must use `buildStageFacts` field names verbatim.

## 4. Recommended single source + repoint list

Status after shipping: every repoint below is done except generating `PHASE_BLOCKS` from `deckToolsFor` (left as a hand-maintained mirror) and repointing the D20 literal key arrays (left as-is; `STATUS_BUCKETS` was deleted rather than adopted).

| Level | Single source | Repoint | Delete |
|---|---|---|---|
| **L1 phases** | `PHASES` + `phasesForType` — `lib/spec.js:62,73` (already canonical) | `deck-preview/page.jsx` STAGES → derive from `PHASES`; fix the "4-phase" comments (`spec.js:80`, `gateway-client.jsx:2027-2031`); replace `project-blocks.js:85` FINDINGS string; regenerate the static HTML from the live map | `TECH_STAGES` (`spec.js:45`, 0 usages), `STATUS_CLASS` only if merged into D1 `status` |
| **L2 backend stages** | `MASTER_ORDER` — `lib/stage-flow.js:9` for order; `STAGES` — `spec.js:15` for labels (keep both — one is pure order for the gate, the other carries labels/buckets; they must stay identical in key order — add a one-line assert) | hardcoded key arrays in D20 could read `STATUS_BUCKETS`-style helpers instead of literals; `UPCOMING`, `customerStatus`, `customerNextAction` are keyed maps (fine) but should be validated against `MASTER_ORDER` at module load | `STATUS_BUCKETS` (0 usages) unless D20 is repointed to it — then it becomes the source, not dead |
| **L3 requirement steps** | `STAGE_FLOW` — `lib/stage-flow.js:19` (already canonical; `phaseGate`, `missingReqs`, `blockingReqs`, role-map all read it) | role-map should expose enforceable vs advisory (`!!req.check`) so the 16 vs 9 distinction is visible | — |
| **L4 tool cards (do NOT collapse)** | per-role `deckToolsFor` output | `stageProgress` (deck-view) should count only cards with a `state`; `mergedPage` should propagate a derived `state` (`every child done → "done"`, `some active → "active"`) so admin and tech agree on the same list | `PHASE_BLOCKS` should be generated from `deckToolsFor`'s shape or dropped; today it is a third hand copy |

Legitimately different granularities that must NOT be merged: L1 (bar), L2 (server stage / gate order), L3 (to-do + gate reasons), L4 (tool cards per role), customer item-% (D19), install-checklist line-item % (pay-weighted vs step-weighted by role).

---

## Confidence / couldn't determine

- **Verified** by reading code + `git log -L`: everything in §1–§3; D17 was an offline file at trace time and is now in the repo, its script parsed with node (5 phases / 16 steps / 10 gated).
- **Symptom B**: traced in code and, after the fix, verified in the browser on ASC0058 (admin 0 of 1 / tech 0 of 1 on Install). The survey-skip gate was verified end-to-end on ASC0055 (skip → auto-advance to `proposal` + `override` event; restore → stage unchanged + `change` event).
- **Symptom A**: verified that no live 4-entry constant exists. **Could not determine which project the "4" was observed on**; the only rendering path producing 4 is a type C project. If it was seen on an A/B project, that would be new evidence and worth a screenshot with the access-id.
- Edit dates come from `git log -L` line ranges; `d8404e7` (2026-07-10, initial commit) means "unchanged since import", not the true authoring date.
- `dashboard/docs/deck-design-system.md:70,203` also states 5 phases — consistent, not re-audited line by line.
