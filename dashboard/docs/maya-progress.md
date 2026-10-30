# Maya — Build Progress

Source of truth: [maya-spec.md](maya-spec.md). Audit: [maya-audit.md](maya-audit.md). Operator guide:
[ai-playbook.md](ai-playbook.md). Living record of the autonomous build — what shipped, decisions taken
without asking, and anything blocked on the owner.

## Status by phase

| Phase | Scope | State |
|---|---|---|
| Audit | Current impl vs spec, security risks, gap plan | **✅ done** → [maya-audit.md](maya-audit.md) |
| P0 security hardening | S1 + S2 authz gaps | **✅ done** (on `main`) |
| Naming | "Maya" in UI + playbook retitle | **✅ done** (maya-build) |
| Label: existing wire waives install | waiver cause parallel to CPE, struck | **✅ done** (maya-build) |
| Foundation: model routing + cost cap | Sonnet escalation, usage ledger, $10/day cap | **✅ done** (maya-build) |
| Confirmation policy | routine edits instant + Undo; confirm only sensitive | **✅ done** (maya-build) |
| New actions (batch 1) | bug filing, close project, ticket notify-on-create | **✅ done** (maya-build) |
| Adversarial test set | haggling/injection/QR/price/labels/recipients | **✅ done** (maya-build) |
| Core prompt / persona | Maya identity + principal-agent rules | **✅ done** (maya-build) |
| Admin ▸ Maya page | Health · Settings · Activity · Training · Conversations | **✅ done** (maya-build) |
| Knowledge / training loop | unanswered-question queue + existing KB (support articles) | **✅ done** (maya-build) |
| Proactive runner | morning briefing + weekly report (flag-gated, deduped) | **✅ done** (maya-build) |
| S3 voice gate | customer+owns-project gate on /api/tts + /api/transcribe | **✅ done** (maya-build) |
| Customer rollout (core) | guide control + human handoff | **✅ done** (maya-build) |
| Customer rollout (rest) | receptionist, multilingual, translation, photo, history | **deferred** (see questions) |
| 0 — Foundation | Core prompt, model routing, abuse protection, test harness | not started |
| 1 — Admin assistant (reads) + bug reporting | mostly already shipped; gaps TBD | not started |
| 2 — Maya admin page | Admin ▸ Maya (Training/Conversations/Activity/Settings/Health) | not started |
| 3 — Customer & public support | receptionist, guides, QR, CCTV→ticket, multilingual | not started |
| 4 — Admin actions | invoices, addendums, labels, VAULT SIGN, confirm policy | not started |
| 5 — Proactive | briefing, nudges, weekly report, alerts | not started |

## Build branch & deploy policy

- All Maya work lands on branch **`maya-build`** (not `main`). Owner reviews and merges to prod. No prod
  pushes from this session. The S1/S2 security fixes already shipped to `main` stay.

## Decisions made (owner-answered 2026-10-30, + chosen-without-asking)

- **Stack:** Next.js + `node:sqlite` + server-side `can(role, cap)` + ownership scoping — NOT Supabase.
  Every "RLS / Supabase auth" spec item = that pattern. (Owner confirmed.)
- **Invoices (project):** reuse the payment ledger + wire the existing **service-call** invoice actions;
  no separate project-invoice document. (Owner.)
- **Spend cap:** **$10/day**, alert at **$7 (70%)**, editable in Admin ▸ Maya. (Owner.)
- **Model routing:** escalate to **Sonnet** for invoicing, large quotes, complex diagnostics, multi-step;
  **Haiku** for everything else. (Owner.)
- **"Existing wire" label:** a waiver cause **parallel to CPE**, line value shown **struck through** so the
  customer sees the savings. (Owner.)

## Gating requirements

- **S3 (hard gate):** add a customer + owns-project gate to `/api/tts` and `/api/transcribe` BEFORE any
  customer-facing voice ships. Do NOT widen `aiGate`. (Owner-required.)

- **S3 voice gate + customer rollout (core) shipped** (maya-build).
  - **S3** — `lib/voice-auth.js` `voiceAllowed(project)`: `/api/tts` + `/api/transcribe` now allow staff
    (unchanged `aiGate`) **or** a customer who owns the named `project` when `AI_CUSTOMER` is on — **without
    widening `aiGate`** (the staff STT/TTS surface is never handed to customers). Keys stay server-side.
    Customer voice is now *safe to enable* when the owner is ready.
  - **Guide control** — the customer assistant maps setup help ("set up the app", "share the system") to the
    right support guide and opens `/guide/<slug>?project=<accessId>` — **only a READY guide (never DRAFT)**;
    the guide page already scopes the system/QR to the customer's own project.
  - **Human handoff** — "talk to a person" / upset / urgent flags the team (`notifyRoles` + a `handoff` Job
    Log event) and reassures the customer without promising a time (urgent → mentions 911 for emergencies).
  - Tests: guide/handoff intents in `tests/maya-guardrails.test.mjs`. QR security was already correctly
    scoped (audit); Maya just drives the existing picker.

## Blocked — needs Ahmed

- _(none — nothing blocked; deferred items below are scoped, not blocked)_

## Change log

- **Audit started.** Spec pinned at `docs/maya-spec.md`; recon of platform surfaces (actions, guides/QR,
  infra/cron/model-routing, security) underway. Name "Maya" recorded.
- **Audit complete** → `docs/maya-audit.md` (Done/Partial/Missing per spec item, ranked security risks,
  gap plan by phase). Four parallel recon agents mapped actions, guides/QR/customer-access, infra, security.
- **P0 security hardening (S1 + S2) shipped** (to `main`). `aiApplyNoteAction` and `aiAuditAction` were
  separately-exported write RPCs that only proved staff+flag — a technician could forge a cross-project note
  / Job Log write. Both now re-enforce `aiCanEdit` (excludes tech) + a tech project-scope check. Drift test
  in `tests/ai-authz.test.mjs`.
- **Naming shipped** (maya-build). "Maya" across the orb / bars / voice menu / greeting + playbook retitle.
- **Label "existing wire waives install" shipped** (maya-build). `WAIVER_CAUSES.EXISTING_WIRE`; the
  `existingCable` condition now carries `waiveCause:"existing_wire"`, so toggling it comps that line's new
  drop/install charge (value struck, snapshot preserved) — parallel to CPE, isolated multi-cause. Applies
  going forward only; existing stored lines are NOT retroactively re-priced (snapshot rule). Tests updated.
- **Foundation — model routing + cost control shipped** (maya-build). `pickModel()` escalates to **Sonnet**
  (`claude-sonnet-4-6`) for invoicing / large-quote drafting / complex diagnostics / multi-step, Haiku
  otherwise — still 0-token router first. Every model call is costed (`lib/ai-usage.js`) and recorded to a
  new `ai_usage` ledger (`recordAiUsage`); `interpret()` skips the model once the day's spend hits the cap
  (graceful router-only degrade) and alerts admin/manager on the call that crosses the warn line. Cap/alert
  are settings (`AI_SPEND_CAP_CENTS`=1000, `AI_SPEND_ALERT_PCT`=70) editable later in Admin ▸ Maya. Tests:
  `tests/ai-usage.test.mjs` (cost math, cap/alert decisions, model routing). **Decision:** Sonnet id
  `claude-sonnet-4-6` to match the rest of the app (read-licence/verify-document).
- **Confirmation policy shipped** (maya-build). Routine proposal edits now apply INSTANTLY with a one-tap
  **Undo** (12s window; restores the builder's prior payload) — no more "are you sure" on every edit. The
  server marks routine previews `instant:true`; only the unusual/irreversible still confirm: a **large
  discount (≥20%)**, and all `action` writes (send, record payment, payment reminder, advance stage, assign,
  remove line, adjudicate). Notes apply instantly (additive, no undo). Undo surfaces in both the Core orb bar
  and the proposal bar. **Decision:** "large discount" threshold = **≥20%** (adjustable).
- **New actions (batch 1) shipped** (maya-build):
  - **Bug filing** — a project-agnostic `report_bug` intent ("report a bug…", "something's broken") files to
    the bug portal (`createBugReport`) with role/page/browser auto-captured; low-stakes so it files instantly.
    `fileBug()` also auto-files Maya's own tool failures (kind `maya_error`). *(In-chat screenshot capture is
    a client follow-up — the portal already supports image URLs.)*
  - **Close project** — `close_project` action → `closeProjectAction` (editor-gated, confirm, reason parsed
    from the command; kept searchable + reopenable, never deleted). **Edit-locking of closed projects is NOT
    yet enforced** (separate change; deferred).
  - **Service-ticket notify-on-create** — `createServiceCall` now fires `notifyRoles(admin/manager)` + an
    office email on every new call (staff action *and* public intake); previously only a companion ticket
    was made. **Decision:** project "invoices" = the existing payment ledger (`record_payment` /
    `request_payment`, already wired); service-call invoice actions stay on the service-calls surface.
  - Tests: close/report_bug router + registry in `tests/ai-project-actions.test.mjs`.
- **Adversarial guardrail set + persona shipped** (maya-build). `tests/maya-guardrails.test.mjs` (haggling,
  cross-customer/QR/payout, injection, never-invent-a-price, discount clamp, wrong-recipient, label+total
  math, cost routing). Interpreter core prompt now opens as "You are Maya … never invent prices/inventory/
  promises; only approved services; if unsure, clarify."
- **Admin ▸ Maya page + training loop shipped** (maya-build). New `/maya` (admin-only, linked under Admin):
  - **Health** — today / 7d / 30d spend + call counts, cap progress bar.
  - **Settings** — edit the **daily cap + alert %** (writes `AI_SPEND_CAP_CENTS`/`AI_SPEND_ALERT_PCT` to the
    vault, no deploy) and toggle `AI_COMMANDS` / `AI_CUSTOMER`.
  - **Activity** — recent model calls from the `ai_usage` ledger (time/model/role/kind/tokens/cost).
  - **Training** — the **unanswered-question queue**: Maya now logs what she couldn't answer
    (`maya_unanswered`, deduped by question/day with a hit counter) via `missWithLog`; admin resolves each
    after adding a support article (the existing admin-editable knowledge base that `knowledgeAnswer` reads).
  - **Conversations** — scaffold (honest placeholder; per-chat ratings need conversation logging, not yet on).
  **Decision:** the "approved knowledge base" = the existing `support_articles` (already admin-editable and
  consulted by `knowledgeAnswer`); the training loop feeds it rather than a parallel store.
- **Proactive runner shipped** (maya-build). `lib/maya-proactive.js`: `runMayaProactive()` on an hourly tick
  from the boot scheduler (`instrumentation.js`), **dark unless `MAYA_PROACTIVE=on`**, firing only at the
  configured Eastern hour and deduped to **once/day (briefing)** + **once/Monday (weekly)** via vault markers.
  - **Morning briefing** (admin/manager, portal + office email): proposals awaiting signature (+ overdue),
    payments due now + outstanding $.
  - **Weekly report** (admin): quotes sent / signed / collected (7-day) + open counts.
  - Data from the canonical receivables/payments/proposals (`mayaProactiveData`); composers are pure +
    tested (`tests/maya-proactive.test.mjs`). Admin ▸ Maya ▸ Settings toggles it + sets the briefing hour.
  - **Customers are never messaged by these jobs.** Nudges (unsigned/unpaid/unconfirmed) are partly covered
    by the existing appointment-reminder + receivables sweeps; a per-customer nudge pause + smart alerts
    (large waiver / repeat service call / angry customer) are **deferred** (see open questions).

## Open questions / deferred (for Ahmed — none blocking the branch)

1. **Multilingual customer replies + live two-way translation.** Direct conflict with the safety spine: the
   customer path is deterministic-router-only (no model on untrusted text). Localized free-form replies +
   live translation need a model call on customer input. Options: (a) a tightly-scoped translate-only model
   call (translate Maya's own English answer → the detected language; never free-generate), or (b) keep
   customer replies English-only. Needs your call on the cost/safety trade. (Staff voice already detects
   language via Whisper.)
2. **Customer receptionist (public visitor) + conversation history + in-chat photo upload.** Scaffolded paths
   exist (customer assistant, `/api/media`, bug screenshots), but a public receptionist surface + persisted
   per-account chat history are net-new builds — want them before or after you review the admin side?
3. **Smart alerts** (large waiver / repeat service call at a site / angry customer). Angry-customer handoff is
   done; large-waiver + repeat-service are best as event hooks — OK to add on the next pass?
4. **Edit-locking closed projects.** `close_project` works; enforcing a no-edit lock on closed/completed
   projects is a separate guard across the mutating actions — confirm you want it and I'll add it.
5. **Per-customer nudge pause.** The proactive nudges reuse existing sweeps; a per-customer "pause reminders"
   toggle is a small add if you want it.

- **Visible Customer Nudges toggle** (maya-build): a restrained "Customer Nudges  On/Paused" toggle in the
  project Team & Access panel (office staff only), using the SAME `projects.nudge_paused` flag as Maya's
  `pause_nudges` command (perfectly in sync). Persists immediately via `setNudgePauseAction`, shows a subtle
  "Customer nudges paused/on" confirmation, logs a Job Log event. **Allowed even on a closed project**
  (communication control, not a scope edit) — both the UI action and Maya exempt it from the edit-lock.
  Appointment reminders stay on the same flag. Drift tests confirm single-flag sync + closed-exempt.
