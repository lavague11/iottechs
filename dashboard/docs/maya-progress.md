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

## Decisions made (chosen without asking, per the autonomous-build instruction)

- **Stack translation:** the spec is written for Supabase + RLS; this codebase is Next.js + `node:sqlite`
  with server-side access control (`roles.js can(role, cap)`, `aiGate`, `sanitize*`, `getVisibleJobs`).
  Every "RLS / Supabase auth" spec item is implemented with the existing server-side pattern, not Supabase.

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
