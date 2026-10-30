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

## Blocked — needs Ahmed

- _(none yet)_

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
