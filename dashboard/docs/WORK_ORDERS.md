# Work Orders · Technician Flow · Payroll — build spec

Branch `feat/work-orders-payroll` · DB backed up to `dashboard/data/dashboard.pre-workorders-20261119-043147.bak.db` (+ `-wal`/`-shm`).
Served admin-only at `/dev/docs/WORK_ORDERS`.

This is the spec the owner asked for before any code. Part 1 is what exists today (read, not assumed).
Part 2 is the architecture decision that follows from it. Part 3 is the data model. Part 4 maps all 27
requirements to stages. Part 5 is the five decisions that change money or signatures and need a yes.

---

## 1 · What exists today

### 1.1 There is no work order entity

The "work order" is a **derived read of the proposal row**. Four components render it, all off
`proposals`:

| Surface | File | What it is |
|---|---|---|
| Payout editor (live) | `app/project/[accessId]/work-order-sheet.jsx` (337) | Admin types a payout per line → `saveTechPricingAction` → Submit (`finalizeWorkOrderAction`) → tech signs (`acceptWorkOrderAction`) |
| Payout editor (older) | `app/project/[accessId]/proposal-tech-pricing.jsx` (330) | A **second** editor for the same `techPrice` field, collapsible, with Reset-to-standard + apply-to-all |
| Field sheet / PDF | `app/project/[accessId]/proposal-workorder-view.jsx` (381) + `lib/workorder-scope.js` | Read-only three-pass sheet: Equipment Locations · Equipment · Labor, derived by name regex (`LABOR_RX`) |
| Assign + create | `app/project/[accessId]/work-order-card.jsx` (239) | Assign techs, "Internal job" toggle, **"Create Work Order · Not created"** — the duplicate card |

State lives on the proposal row: `techPrice` inside `payload`, plus columns
`wo_finalized_at`, `wo_finalized_by`, `tech_signed_name`, `tech_signed_at`, `tech_signature_data`.
Payout defaults come from `rate_book` through `defaultTechPayout()` / `seedTechPricingMap()`
(`lib/proposal.js`).

Consequences that matter:

- **Editing the work order edits the signed proposal row.** `saveTechPricingAction` writes into the
  proposal's `payload` in place — deliberately, so it doesn't mint a customer version, but it means the
  work order has no independent lines, no scope of its own, and no versions.
- **`wo_finalized_at` is a single freeze marker**, cleared on every other version of the project
  (`db.js:7092`). There is no work-order revision history.
- **One signature, one tech.** `tech_signed_name` is a single column; signing *is* the assignment.
- **Waived lines are dropped**: `work-order-sheet.jsx:69` → `.filter((it) => !it.waived)`. CPE items
  (waiver cause `customer_provided_equipment`, badge `CPE`, `lib/proposal-terms.js:458`) are waived, so
  today the tech never sees the Display + Mount they still have to install. This is requirement 2/3.
- `createWorkOrderAction` (`proposal-actions.js:1461`) **creates nothing** — it checks a confirmed
  payment and moves the stage to `schedule`. Hence "Not created" is a lie about a button that only
  advances a stage.

### 1.2 The `work_orders` table is something else

`work_orders` (`db.js:307`) is the **technician's completion submission** — `submitted_by`, `notes`,
`status pending|approved|rejected`, `reviewed_by`. Driven by `submitWorkOrderAction` /
`approveWorkOrderAction` / `rejectWorkOrderAction` and surfaced in Operations. It is not the document.
**Keep the table, rename the concept in the UI to "Completion submission".** Renaming the table is a
destructive migration for no gain.

### 1.3 Stages 3–4 already half-exist, in one JSON blob

`install-checklist.jsx` (854) + `lib/install-checklist-model.js` (165) already implement:

- **Per-device step paths**, not line states: camera/speaker `Cable Dropped → Managed → Terminated →
  Mounted → Online`, NVR `Programmed → Online → Recording Verified`, POS 4 steps, equipment `Installed`.
- **Per-step payout weights** from the assigned tech's `rate_book` rates (`camPay`, `posPay`), so money
  accrues per step, not per line — `weightedInc()` credits each step's slice **to the person who
  tapped it**.
- `stepLog` (who · which step · when), `owners` (per-item responsible tech, first-claim + explicit
  take-over), `dayLogs` (End-of-day snapshots with pay + delta), `requests` (tech asks for a line, admin
  prices it), `payouts` / `payoutOverride`, `estHours`, a 24-deep undo stack.

All of it is **one `tool_data` blob keyed `install`**, rewritten whole on a 500ms debounce
(`install-checklist.jsx:205`). Three real problems for what the owner is asking for:

1. **Last-write-wins across techs.** Two phones on the same job overwrite each other's taps.
2. **No offline story.** A debounced whole-blob POST cannot queue.
3. **Nothing is queryable across projects**, so payroll (requirement 27) cannot be built on it.

`idb-store.js` (73) already gives IndexedDB get/set with a localStorage mirror — the offline
foundation for requirement 21 is there.

### 1.4 The revision flow to copy (requirement 13)

Already canonical and tested — reuse, do not re-derive:

- `proposalChangeState(published, working)` (`lib/proposal.js:999`) → `{ hasUnsentChanges,
  publishedVersion, changeCount, structuredChanges, financialDelta }`, built on `proposalFingerprint`
  (dirty signal) + `proposalDiff` (structured changes).
- `proposal-footer.jsx` renders exactly the bar the owner described: **Unsubmitted** badge ·
  `N unsent changes` · `±$` · Saved · **Cancel Revision** (two-step confirm) · **Send Revision**, with a
  `ChangesModal` that prints the diff in business language.
- Version history: `proposal-version-log.jsx` + `proposal-version-snapshot.jsx`; sent versions are
  immutable rows (`published vs working` model, locked in CLAUDE.md).

### 1.5 Scheduling, signatures, reminders

- **Schedule** is the `schedule` tool blob: events `{ id, kind, title, date, time, duration, location,
  notes, bookedAt }`; `installAppointmentConfirmed()` + `getToolMeta().schedule.installConfirmed` are
  the facts. `scheduling-widget.jsx` is the only scheduler — requirement 11 reads it, never a second one.
- **Customer proposal signing is PDF-first**: `lib/esign/` (unsigned PDF stored immutably in
  `sign_documents`, random expiring session bound to proposal + version + doc hash + fingerprint,
  `complete.js` flattens a new signed PDF, append-only `sign_events`, certificate). The **tech**
  signature today is the in-app pad `proposal-sign-modal.jsx`.
- **Reminders exist**: `appt_reminders` (claim-once by `event_key`), `lib/appointment-reminders.js`,
  a boot scheduler plus a manual `/api/cron/appointment-reminders` gated on an admin session or
  `CRON_KEY`. Requirement 23 rides this, not a new scheduler.
- Email is dormant until `RESEND_API_KEY` is set, so admin notification (18, 23) is **in-app first**.

### 1.6 Roles

`lib/roles.js` already has `install.view/edit`, `install.pay.view/edit`, `install.photos.view/edit`,
`issue.report/adjudicate`, `qc.*`, `assignment.edit`. New capabilities go here — never a
`role === "tech"` in JSX.

---

## 2 · Architecture decision

**The work order becomes its own versioned document, copied from the proposal.**

Requirement 9 ("a COPY of the proposal — editing it never changes the signed proposal") is flatly
incompatible with today's in-place `payload` write, and requirements 13, 14, 20, 22, 26 and 27 each need
rows the proposal cannot hold. So:

1. **New entity.** A work order is created by snapshotting the published proposal's selected option into
   work-order lines of its own. The proposal is never written again by any work-order action.
2. **Versioned exactly like the proposal.** `wo_versions` holds immutable sent versions; the live header
   carries the working draft. `workOrderChangeState()` mirrors `proposalChangeState()` in shape and the
   footer is the same component family, so the owner sees the identical bar with payout dollars instead
   of retail.
3. **Line identity is stable across versions.** Each line keeps the proposal line id it came from (or a
   minted id for a custom line), so completion state, photos and credits survive a revision —
   requirement 13's "completed lines keep their status".
4. **Live per-line state moves out of the blob into rows.** One row per line per work order. A tap is one
   `UPDATE`, which is what makes multi-tech and offline sync safe.
5. **One renderer.** `ProposalItemsEditor` is already parameterized for reuse (`readOnly`, `customer`,
   `hidePrices`, `showCost`, `headerRight`, `onChange`) and already powers the customer proposal
   ("one renderer" rule). Add `mode="payout"`: the money column edits payout, and discount / tax /
   payment plan / retail never render. Requirement 1 is a prop, not a fork.
6. **The three legacy payout surfaces collapse into one.** `work-order-sheet.jsx` and
   `proposal-tech-pricing.jsx` both disappear into the new editor; `proposal-workorder-view.jsx` stays as
   the printable field sheet and the PDF, re-pointed at work-order lines. `work-order-card.jsx` loses its
   card (requirement 8) and keeps only tech assignment, moved to the top of the editor (requirement 10).

Money rules that do not move: payout is never shown to a customer; retail / cost / margin / discount /
tax / payment plan are never shown to a tech; `sanitizeProposal(row, "tech")` keeps doing its job and the
new payload gets its own `sanitizeWorkOrder(row, role)`.

---

## 3 · Data model

`node:sqlite`, ensure-column pattern in `lib/db.js`, explicit `BEGIN/COMMIT` (there is no
`db.transaction()`). All names prefixed `wo_` to stay clear of the legacy `work_orders` table.

```
wo                      one live work order per project
  id · project_access_id · source_proposal_id · source_version · source_option
  show_payouts INTEGER DEFAULT 1        -- requirement 7
  notes TEXT                            -- requirement 6
  status  draft|sent|signed|closed      -- requirement 25
  version INTEGER DEFAULT 0             -- 0 = never sent
  closed_at · closed_by · created_at · updated_at

wo_versions             immutable sent versions (requirement 13)
  wo_id · version · payload TEXT (lines + payouts snapshot) · fingerprint
  sent_at · sent_by · superseded_at
  UNIQUE(wo_id, version)

wo_lines                the working draft's lines + live field state
  id · wo_id · line_key (proposal line id, or minted) · parent_key
  name · kind (camera|speaker|nvr|pos|equip|labor|custom) · qty
  payout · payout_source (rate|manual) · waived INTEGER · waiver_cause · cpe INTEGER
  status  incomplete|attention|complete  DEFAULT 'incomplete'   -- requirement 17
  status_by · status_at · owner_user_id · owner_name
  needs_photos INTEGER                  -- requirement 19
  position · removed_at
  UNIQUE(wo_id, line_key)

wo_signatures           per tech, per version (requirement 12/13)
  wo_id · version · user_id · name · signature_data · signed_at · fingerprint · voided_at · voided_by

wo_checkins             requirement 16
  wo_id · user_id · name · day (local date) · in_at · out_at · lat · lng

wo_events               requirement 20 — append-only, the forensic trail
  wo_id · line_key · action · from_status · to_status
  actor_user_id · actor_name · at · client_at · note · meta TEXT

wo_line_media           requirement 18/19 — before/after, via /api/media (never base64 in a row)
  wo_id · line_key · slot (before|after|issue) · media_url · by_name · at

wo_day_logs             requirement 22 — locked daily log per tech
  wo_id · user_id · name · day · locked_at · locked_by
  lines_completed INTEGER · payout_total REAL · note
  UNIQUE(wo_id, user_id, day)

wo_line_credits         requirement 26 — who gets paid for a line, and splits
  wo_id · line_key · user_id · name · share REAL (0–1) · amount REAL
  day_log_id · set_by · set_at
```

Reused untouched: `project_assignments` (tech assignment), `rate_book` (payout defaults),
`media` (photo storage), `appt_reminders` + `lib/appointment-reminders.js` (the 8 PM sweep),
`install_issues` (the existing NEEDS_REVIEW → NEEDS_REWORK state machine behind "Needs attention"),
`tool_data.schedule` (the install appointment), `sign_documents` / `lib/esign/flatten.js` (the signed
work-order PDF).

New capabilities in `lib/roles.js`: `wo.view`, `wo.edit` (admin, manager), `wo.sign` (tech),
`wo.payout.view`, `wo.payout.edit`, `wo.checkin` (tech), `wo.line.status` (admin, manager, tech),
`wo.close` (admin, manager), `payroll.view` (admin, manager), `payroll.export` (admin).

Payroll (requirement 27) is a read over `wo_day_logs` + `wo_line_credits` grouped by tech and pay
period at `/payroll` — no third copy of the numbers.

---

## 4 · Stages

Each stage ends with `npm test` green, `npm run build` clean, a commit on this branch, and screenshots
from the local preview. **Nothing merges to `main` (= deploys to Hostinger) until the owner says so per
stage** — "keep separate from other work" and "deploy each stage" pull opposite ways; see decision E.

### Stage 1 — Admin work order editor · requirements 1–9
- `lib/work-order.js` (pure): `workOrderFromProposal()` snapshot, `woLineTotals()`,
  `workOrderFingerprint()`, `workOrderChangeState()`.
- Tables + `db.js` helpers: `createWorkOrder`, `getWorkOrder`, `saveWorkOrderDraft`, `setWoShowPayouts`,
  `setWoNotes`.
- `mode="payout"` in `ProposalItemsEditor`: payout column replaces Price; discount, tax, payment plan and
  every retail figure are absent, not hidden (2, 1). Parent groups keep collapsible children (2).
- **CPE + Waived lines are included** with their badges carried from the proposal (2, 3).
- Catalog / "+ Add Service" / "+ Item" / custom line, payout pre-filled from `defaultTechPayout` and
  overridable (4); delete line and sub-line with a live total (5).
- Notes with dictation — reuse `components/mic-button` (6).
- "Show payouts to tech" toggle on the header; payroll still tracks payouts when off (7).
- Delete the `work-order-card.jsx` card (8); retire both legacy payout editors
  (`work-order-sheet.jsx`, `proposal-tech-pricing.jsx`). To keep the branch coherent at every commit,
  the new editor's signature footer keeps calling today's `finalizeWorkOrderAction` /
  `acceptWorkOrderAction` / `voidTechSignatureAction` until Stage 2 moves signing to `wo_signatures`.
- Proof it is a copy: a test asserts no work-order write touches `proposals` (9).

### Stage 2 — Assign · schedule · sign · revise · requirements 10–14
- Assign one or more techs at the top of the editor, reusing `addAssignmentAction` and its
  certification gate (10).
- Date/time read from the existing Installation event; "Schedule" opens `scheduling-widget`; assigned
  techs are added to that event's invitees (11).
- Request technician signature, bound to `workOrderFingerprint` + the frozen version, voidable by
  admin (12) — see decision C on PDF-first.
- The revision bar, copied from `proposal-footer.jsx`: Unsubmitted · `N unsent changes` · `±$ payout` ·
  Saved · Cancel Revision · Send Revision, plus Sent Versions (v1 superseded, v2 signed by tech). Every
  sent revision voids the tech signature and requires a re-sign; completed lines keep their status (13).
- A signed proposal revision or addendum lands its new/changed lines in the work order as an **unsent
  revision** for admin to approve and send (14).

### Stage 3 — Technician view · requirements 15–21
- Tech sees the same editor read-only, payouts per the toggle (15).
- "I'm on site" writes `wo_checkins`; no line can be marked until today's check-in exists (16).
- Tap a line → centered popup Complete / Needs attention / Incomplete, default Incomplete (17) — see
  decision A.
- Needs attention requires a note or a photo, dictation on the note, notifies admin only (18).
- Before/after photos required to complete camera / NVR / display lines (19).
- Every action to `wo_events` with tech, time and line (20).
- Offline: taps queue in IndexedDB (`idb-store.js`) and replay on reconnect with a pending-sync
  indicator; each mutation is idempotent on `(wo_id, line_key, client_at, actor)` so a replay can never
  double-pay (21).

### Stage 4 — End of day · close-out · payroll · requirements 22–27
- "End of day" locks the day's completed lines into `wo_day_logs` + `wo_line_credits`; the work order
  stays open for multi-day jobs (22).
- 8 PM sweep on the existing reminder scheduler for a tech checked in with no day log; admin can end the
  day for them (23).
- Customer sign-off when every line is Complete, through the existing signature flow, tied to the final
  payment step (24).
- Close when all lines are Complete and the customer signs, or when an admin closes it (25).
- Payout credits the tech who completed the line; admin can reassign or split 50/50 (26) — decision B.
- `/payroll`: daily logs per tech per pay period, totals, CSV export (27).

### Test plan
`tests/work-order-model.test.mjs` (pure: snapshot, totals, fingerprint, change state, CPE/waived
inclusion), `tests/work-order-db.test.mjs` (executed SQL on in-memory `DatabaseSync`: copy independence,
version immutability, status survival across a revision, idempotent replay, day-log locking, credit
splits summing to the payout), `tests/work-order-roles.test.mjs` (payout hidden with the toggle off,
retail never in a tech payload, customer never sees payout), plus the existing suites must stay green —
especially `work-order-state`, `proposal-sanitize`, `proposal-published-resolver`.

---

## 5 · Decisions needed (each changes money or signatures — RED lane)

**A · Line status vs the existing step paths.** Production today pays per *step* (camera: dropped $10 ·
managed $18 · terminated $12 · mounted $12 · online $0, scaled to the line's payout) and credits each
step to whoever tapped it. Requirement 17 is a three-state line. *Recommendation:* the popup is the
line's status control, and where a line has a step path, choosing Incomplete still offers the existing
"how far did you get?" picker — so partial payout keeps working and `Complete` means all steps. The
alternative is to delete per-step pay, which changes what techs earn mid-job.

**B · Line credit vs step credit.** Requirement 26 says the line's payout goes to whoever marked it
Complete; today each step's slice goes to whoever tapped that step. *Recommendation:* keep step credits
as the default allocation inside `wo_line_credits`, show the line's credit as their sum, and let an admin
override with a reassign or a split. Taking the whole line to the last tapper would pay one tech for
another's cabling.

**C · Tech signature: in-app pad or PDF-first.** Requirement 12 says "same flow/logic as customer
proposal signing", which is now PDF-first e-sign (stored immutable PDF + expiring session + certificate).
*Recommendation:* keep the in-app pad — a tech signs on a phone in a driveway, not from an emailed PDF
link — but adopt the e-sign *guarantees*: bound to a fingerprint and a frozen version, append-only
events, and a flattened signed work-order PDF via `lib/esign/flatten.js`. Full PDF-first for techs is
roughly a stage of its own.

**D · Migrating live jobs.** Projects mid-install already hold step state in the `install` tool blob.
*Recommendation:* a one-way import at first open of the new work order (steps → line status + credits,
`dayLogs` → `wo_day_logs`), the blob left untouched as the record, and a dry-run report first. Jobs that
are already closed are not touched.

**E · "Deploy each stage" vs "keep separate".** Deploying means merging to `main`, which Hostinger
auto-deploys — the opposite of keeping this separate while it is half-built. *Recommendation:* screenshots
come from the local preview at each stage; merge and deploy Stage 1 only once you have seen it, then the
same per stage.

Not blocking: admin notification for 18/23 is in-app until `RESEND_API_KEY` is set.
