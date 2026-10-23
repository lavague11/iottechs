# AI Roadmap — PLAN (ordered task queue)

Source of truth: `project-ai-spec.md` (SPEC). States: **Open → Working → Needs Review → Completed** (only a human marks Completed). Lead builds; `code-reviewer` (opus) is the independent QA + Security pass; `test-writer`/`db-schema` as needed.

## Phase 1 — project intelligence (read-only) — ✅ Needs Review → shipped c4249a4, live-verified
Blockers vs recommended vs parallel + owners; role+project authz. Done.

## Phase 2 — project actions (writes) — one guarded action at a time
Each: intent → **preview** → **human confirm** → existing self-authorizing server action → audit. Build + unit/integration test + preview-path verify. **Never auto-execute a real customer send/payment/stage-move on prod.**

| # | Action | Server action (verified) | Cap / gate | State |
|---|--------|--------------------------|------------|-------|
| 2.1 | `send_proposal` | `sendProposalAction(accessId)` | AI_EDITORS; proposal exists, not already sent | Working |
| 2.2 | `request_signature` | `requestSignatureEmailAction(accessId, optKey)` | AI_EDITORS; proposal sent | Open |
| 2.3 | `record_payment` | `recordPaymentAction(accessId, payment)` | AI_EDITORS; **records a received payment, never charges a card** | Open |
| 2.4 | `assign_tech` | `addAssignmentAction(accessId, {userId,userName,role})` | AI_EDITORS (install.edit) | Open |
| 2.5 | `raise_issue` / `adjudicate_issue` | `installIssueAction(accessId, id, action)` | issue.report / issue.adjudicate | Open |
| 2.6 | `advance_stage` | `acceptStageAction(accessId, stage)` | stage.move; **phaseGate must pass** (refuse w/ reason, admin override logged) | Open |

## Phase 3 — customer conversation intelligence (knowledge + feedback capture) — Open
FAQ/approved-knowledge retrieval; structured objection/feedback capture → categorized project notes with review/resolution status; customer answers restricted to approved info. (Depends on the knowledge store — overlaps the deferred "unanswered-question" loop.)

## Phase 4 — site-survey integration (staged, read-first) — Open
Read authorized survey; resolve cameras by stable device id; answer placement questions; associate concerns with specific cameras; highlight on the floor plan; prepare proposed changes for approval. **Never auto-remove gear / change pricing / alter a signed agreement from conversation.**

## Phase 5 — sales intelligence — Open
Objections, product Q&A, outstanding approvals, follow-ups, likely blockers, feedback summaries. Never cost/margin/payout.

## Phase 6 — customer-facing AI — Open (LAST, highest injection risk)
Only after internal + knowledge paths are secure. Own-records + approved knowledge + specifically-authorized actions only.
