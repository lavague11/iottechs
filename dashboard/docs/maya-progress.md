# Maya — Build Progress

Source of truth: [maya-spec.md](maya-spec.md). Audit: [maya-audit.md](maya-audit.md). Operator guide:
[ai-playbook.md](ai-playbook.md). Living record of the autonomous build — what shipped, decisions taken
without asking, and anything blocked on the owner.

## Status by phase

| Phase | Scope | State |
|---|---|---|
| Audit | Current impl vs spec, security risks, gap plan | **✅ done** → [maya-audit.md](maya-audit.md) |
| P0 security hardening | S1 + S2 authz gaps | **✅ done** (this build) |
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
- **P0 security hardening (S1 + S2) shipped.** `aiApplyNoteAction` and `aiAuditAction` were separately-
  exported write RPCs that only proved staff+flag — a technician could forge a cross-project note / Job Log
  write. Both now re-enforce `aiCanEdit` (excludes tech) + a tech project-scope check, matching the
  interpret-path WRITE_INTENTS gate and `previewAction`'s scoping. New drift test in `tests/ai-authz.test.mjs`.
