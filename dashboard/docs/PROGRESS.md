# AI Roadmap — PROGRESS (durable checkpoint)

Resumable log. If a session stops, the next one reads this + PLAN.md and continues without rediscovering. Newest first.

---

## 2026-10-23 — Orchestration start
- Discovered real agents: spec-writer, db-schema, code-reviewer, ui-auditor, bug-triage, test-writer, docs-keeper (no Architect/Frontend/Backend/QA/Security — mapped roles onto these). Models: lead on Opus; code-reviewer (opus) for independent QA+Security; test-writer/db-schema (sonnet) as needed.
- Created SPEC (project-ai-spec.md, pre-existing), PLAN.md, PROGRESS.md.
- **Phase 1** = Needs Review (shipped c4249a4, live-verified on prod; 839 tests). Awaiting human "Completed".
- **Safety boundary set:** Phase 2 actions are built with preview → human-confirm → existing guarded action; NOT auto-executed against real customers on prod.

## 2026-10-23 — Phase 2.1 `send_proposal` — QA round 1 done, fixes applied, re-verify in flight
- **Test-count reconciliation:** Phase 1 actually ended at **829** (the post-drift-fix run); my earlier "839" was a MISSTATEMENT, not a lost test. 829 + Phase-2.1 tests = **834**, all pass. No tests vanished or weakened.
- **code-reviewer (opus) round 1:** Security PASS — no unauthorized-send path, no auto-execute, server re-derives auth + re-checks state. Findings fixed:
  - [MED] in-project bar (ai-command-bar.jsx) didn't dispatch `write:"action"` → added the branch (feature was broken in the sales rep's main bar). 
  - [LOW/MED] cross-project replay / admin-shell dead-end → preview binds `intent.accessId`; both hosts dispatch against it; apply re-validates project + state.
  - [LOW] missing null-facts/null-project guard in apply → added.
  - [owner] **per-action capability**: new pure `actionAllowed(name,{editor,can})` enforced at preview AND apply — send-auth never implies payment/stage auth (send_proposal.cap=null; 2.3→install.pay.edit, 2.6→stage.move).
  - [owner] **preview clarity**: confirm now shows recipient email + proposal total.
  - Double-submit prevented: client busy flag + server availability re-check (status leaves "draft" after first send).
- **834 tests pass.** Independent **re-verification** of the fixes delegated back to code-reviewer (in flight). On PASS → commit 2.1 → deploy → PREVIEW-ONLY prod verify (show the confirm card, do NOT click send) → move to Needs Review → cascade 2.2.

## (superseded) 2026-10-23 — Phase 2.1 initial build note
- **Lead (Opus)** built the generic project-action framework: `lib/ai-project-actions.js` (pure registry: availability from stage facts + confirm copy + `actionFromText` router), `ai-command.js` `action` intent, `ai-actions.js` `previewAction` + `aiApplyProjectActionAction` (editor-gated preview AND apply; re-checks current-state availability; dispatches the existing self-authorizing `sendProposalAction`; audits), `global-command-bar.jsx` `onApply` dispatches action writes when a project is in context.
- **Tests:** `tests/ai-project-actions.test.mjs` (availability gate, confirm copy, phrase router). **833 total, all pass.**
- **QA+Security:** delegated to `code-reviewer` (opus) — independent review of the diff in progress (authz at preview AND apply, no self-execution without human confirm, state re-check, audit). Awaiting findings → fix → then commit.
- Files touched (uncommitted until review): ai-project-actions.js, ai-command.js, ai-actions.js, global-command-bar.jsx, tests/ai-project-actions.test.mjs.
- **Safety:** build only — will NOT fire a real proposal email on prod autonomously; the send stays human-confirmed (preview → Apply) in the app.

## Architect prep — verified contracts for 2.2–2.6 (read-only, ready to wire once 2.1 clears review)
- **2.2 `request_signature`** → `requestSignatureEmailAction(accessId)` (optKey optional). Self-auth STAFF_EDIT. Available when `proposal_status ∈ {sent, changes_requested, accepted}` AND `!proposal_signed`; draft/null → "send the proposal first"; signed → "already signed" (no-op). Non-parameterized. **Easy** — mirrors send_proposal.
- **2.3 `record_payment`** → `recordPaymentAction(accessId, {amount, kind, method, paidAt})`. amount>0 required. **Records money already in hand** (staff source = confirmed; emails a "payment recorded" confirmation) — it does NOT charge a card. Parameterized: parse amount (+ "deposit"/"balance" → kind). Confirm MUST show the exact amount. **Medium.**
- **2.4 `assign_tech`** → `addAssignmentAction(accessId, {userId, userName, role:"tech"})`. Parameterized: resolve a tech by name → user. **Medium** (needs a staff/tech lookup).
- **2.5 `raise_issue` / `adjudicate_issue`** → `installIssueAction(accessId, id, action, {assignTo})` adjudicates an EXISTING issue (needs id + action rework/resolve/dismiss). Verify the CREATE path for a brand-new flag before wiring "raise". **Medium.**
- **2.6 `advance_stage`** → `acceptStageAction(accessId, stage)`. Availability = `projectIntel().canAdvance` (phaseGate clear); if blocked, refuse WITH the blocker reason (admin override logged by setStage). **Easy–Medium.**

## Next task (after 2.1 review clears)
- Apply code-reviewer findings to the framework → commit 2.1 (Needs Review) → verify the preview path live → cascade 2.2 → 2.3 → 2.4 → 2.5 → 2.6 using the notes above.
