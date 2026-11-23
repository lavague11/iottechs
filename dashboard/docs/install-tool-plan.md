# Install walkthrough — how to build it inside the Site Survey

**Proposal only. Nothing is built.** Awaiting the owner's OK.

Sources: [`camera-install-walkthrough.md`](camera-install-walkthrough.md) (the job checklist),
[`camera-install-training-manual.md`](camera-install-training-manual.md) (the v2.0 training draft),
and Q4 in [`survey-rules.md`](survey-rules.md) (AI pre-fill from a location photo).

---

## The shape of it in one paragraph

The survey already ends on a **Submit** step that summarises the job: floors, camera count, which
cameras are missing photos, and what is still open. That is the same information the checklist needs
on its first page. So the checklist is not a new page — it is a **section of the Submit step** that a
PM creates once for a job. Every technician on that job opens the same document, sees the survey's
own devices, photos, cable routes and derived materials already filled in, and ticks off what they
did. It never gates anything: the survey submits, the install proceeds and the job completes whether
the checklist is untouched or complete.

---

## The five decisions

### 1. Where it lives, and what owns it

**A new tool blob, `walkthrough`, on the project.** One row per project in `project_tool_data`
(`TOOL_KEYS` gains the key), rendered as a section of the Submit step in `system-planner.jsx`
alongside the existing `SubmitSummary`.

Why a new key rather than reusing `install`: the `install` blob already drives real gates —
`installProgress()` feeds `buildStageFacts`, which feeds `phaseGate()`. Anything written there can
block a stage. The checklist must never block anything, and the cheapest way to *guarantee* that is
to put it somewhere no gate reads. See decision 3.

One row per project means **every tech on the job opens the same checklist**, which is what was
asked. It also means two techs ticking at the same time write the same row — see "Concurrency" in
the risks.

Routing: the checklist carries no photos of its own (it points at photos that already exist), so it
goes through the existing server actions `getToolDataAction` / `saveToolDataAction`, exactly like
`install` and `qc`. It does **not** go on the `/api/tool-data` REST route, which is deliberately
restricted to the four geometry/photo blobs.

### 2. The PM creates it; the techs fill it

Nothing renders until a PM makes one. Before that, the Submit step shows a single action —
**+ Checklist** — visible to admin and manager only. After that, the section renders for everyone
with `walkthrough.view`.

```
walkthrough.create   admin, manager            (a job gets one checklist, by a decision)
walkthrough.edit     admin, manager, tech      (ticking, notes, quantities used)
walkthrough.view     admin, manager, sales, tech, readonly
                     — never customer
```

The customer never sees it. It names tools, materials, shortages, hazards and PM escalations; none of
that belongs on a customer surface. Server-side strip, not a hidden div.

Archive, never delete (house rule): a checklist is voided, keeping the record.

### 3. "Nothing ever blocks an install" — how that is enforced, not just intended

This is the rule most likely to erode by accident, so it gets a mechanical guarantee rather than a
convention:

- The `walkthrough` key is read by **no** gate function. Not `phaseGate`, not `buildStageFacts`, not
  `surveyStageSatisfied`, not `installProgress`, not `qcProgress`, not `getToolMeta`.
- **A test asserts that.** It greps those functions for the key and fails if one ever reads it. That
  is the kind of test that survives someone wiring it in "just for a badge" two months from now.
- No checklist state appears in `survey2Meaning`, so it cannot move a fingerprint or disturb a
  signature.
- Submitting the survey with an empty checklist is normal and silent — no warning, no "incomplete"
  badge, no nag. The Submit step's existing Ready/Incomplete badge keeps reading only survey facts.

The checklist may *show* its own progress ("12 of 47"), because that is useful to the tech. It just
never feeds anything that decides whether work can proceed.

### 4. What fills itself in

This is the part that earns the feature. The survey already knows most of page one.

| Checklist item | Comes from | Notes |
|---|---|---|
| Camera count, names, locations (§01) | `survey2` devices — `tag`, `name`, `locName` | The roster the Submit step already builds |
| Before / mounted photos (§01, §07) | device `photo`, and `media` rows tagged `install` | The checklist links the photo, never copies it |
| Indoor / outdoor per camera (§07) | `placementOf()` — derived from the painted structure | Drives outdoor-rated cable, boots, sealing |
| NVR location (§01, §02) | the Route step's head-end (`floor.head`) | It is already placed on the plan |
| Longest and shared routes (§01, §04) | `lib/survey-routes.js` — `bundles()` and run lengths | The manual's core principle *is* this data: the bundle view already computes which runs share a path |
| Cable-to-port map (§05) | per-run `dev` key → device tag | One row per run, pre-labelled |
| Drilling surfaces (§01) | Q4's AI suggestion, once a person confirms it | Unconfirmed suggestions never fill a checklist line |
| Mount height / ladder needed (§01 load-out) | Q4, confirmed | Ticks "Extension ladder" in the load-out |
| Junction box count (materials) | Q4, confirmed, counted | |
| Cat6 connectors, screws, anchors | camera count × the rates already written in the doc | 2 connectors + 3 screws per camera, plus spares |
| Hard drive, HDMI, patch cable | NVR count | |

Two rules on auto-fill, both from the house standard and from Q4:

- **Prefilled is not confirmed.** A derived value shows as a value the tech can change; a *suggested*
  value (anything from Q4) shows as a suggestion with its confidence and is not a value until a
  person confirms it.
- **Cable new vs existing is always manual.** Carried straight from Q4: a photo cannot tell whether
  a line works, and neither can the survey.

### 5. Where the training manual and the quiz live

**The manual → the Guides library that already exists.** The `sops` / `sop_steps` / `sop_versions`
tables, `/guides` and `/guide/[slug]`, with `status: published` and `visibility: internal`. The
manual becomes one guide whose steps mirror the nine checklist steps one-to-one — which the manual
already does by design ("it follows the same nine steps … so a technician trains on this manual and
works from the checklist").

That one-to-one mapping buys the real feature: **each checklist section carries a quiet link to the
matching guide step.** A tech standing at step 04 who wants the reasoning taps through to "Longest
shared routes first" rather than reading a manual end to end. Icon-only or one word; it is reference,
not instruction.

**The quiz → its own bank, reusing the assessment machinery, not the hiring assessment.**
`lib/assessment-bank.js` and `/assessment/[appId]` already do scored questions, AI-graded
explanations, categories and a pass line — but that instrument is bound to an `applications` row and
means *should we hire this person*. Chapter 12 is five questions for someone already employed, before
their first field walkthrough. Same shape, different bank, different record: a `training` bank keyed
to the user, surfaced from the guide and from the tech's own area. Scoring and AI grading are reused;
the hiring flow is untouched.

---

## What this does not change

- The survey's own steps, rules and gates (`survey-rules.md` R1–R9) are untouched.
- `install`, `qc`, the work order, payouts and the stage machine are untouched.
- No new page, no new nav entry, no second place to look for a job.

---

## Build order

Each stage is useful on its own and shippable on its own. **Small** ≈ hours, **Medium** ≈ a day or
two, **Big** ≈ several days with live verification.

### Stage 1 — The manual, as a guide · **Small**
Import `camera-install-training-manual.md` into the Guides library as one published internal guide
with nine steps. No survey changes at all. Immediately useful: techs can read it on a phone, and it
gives stage 3 something to link to.

### Stage 2 — The checklist model · **Small**
`lib/walkthrough.js`: the pure shape of the document — nine sections, their items, the load-out
table and the materials table, straight from the checklist doc. Plus `TOOL_KEYS` gains `walkthrough`
and the never-gates test lands. No UI. Everything after this is rendering and filling.

### Stage 3 — Create, render, tick · **Medium**
The Submit-step section: **+ Checklist** for a PM, then the nine sections rendering collapsed with
their items, ticking, free-text fields, notes, and the per-section link to the guide step. Saves
through `saveToolDataAction`. Role gates and the customer strip. At the end of this stage the
feature works, with nothing auto-filled yet.

### Stage 4 — Auto-fill from the survey · **Medium**
The table in decision 4, minus the Q4 rows: cameras, photos, indoor/outdoor, NVR location, shared
routes and the cable-to-port map, and the material quantities derived from counts. This is where the
feature stops being paperwork and starts being worth opening.

### Stage 5 — The load-out · **Medium**
Tools and materials: Need / Packed / Back, with Need pre-ticked from what the job implies and
quantities carried in. Shortages reported to the PM reuse the existing issue path rather than a new
one.

### Stage 6 — The quiz · **Medium**
The training bank and its record, surfaced from the guide. Reuses the assessment scoring; does not
touch hiring.

### Stage 7 — Q4 suggestions into the checklist · **Big**
Only after Q4 ships and its confirm-before-it-counts behaviour is proven. Mount surface, height and
ladder, junction box flow into §01 and the load-out — as confirmed values only. Big because it spans
the photo pipeline, a paid vision call per photo and the confirmation UI, and because the
indoor/outdoor conflict noted in Q4 has to be settled first.

---

## Risks worth deciding on before stage 3

**Concurrency — two techs, one checklist.** One blob per project means simultaneous ticks race, and
last-writer-wins would silently drop one tech's work. The B14 stale-write guard already refuses a
write made against a version the writer did not read, so nothing is *corrupted* — but the second tech
sees a refusal. Options: per-item merge (each tick is an independent fact, so this is natural and
mostly safe), or accept a refusal plus re-read. **Recommendation: per-item merge**, decided before
stage 3 rather than retrofitted.

**One checklist per job, or one per technician?** The ask says one per job, every tech gets it, and
that is what is proposed. Worth being deliberate: a two-tech job then has one shared tick for "Every
tool checked back in", and the signature line at the end is singular. If per-tech sign-off matters,
the cheapest answer is one shared checklist with a signature block per technician, not two documents.

**The checklist outlives the survey.** It is created on the Submit step but used during the install,
which may be weeks later and after the survey is locked. A submitted survey is read-only — the
checklist must stay editable regardless. That falls out of it being its own blob, but it needs
saying, and testing.

**Photos.** The checklist asks for photos at nine points; photos already have a home (`media`, tagged
`install`). The checklist should **link** them, never hold copies, or the blob grows without limit
and the same photo exists twice.

---

*Written 2026-11-23. Waiting for the owner before any of it is built.*
