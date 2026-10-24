# AI Roadmap — PROGRESS (durable checkpoint)

Resumable log. If a session stops, the next one reads this + PLAN.md and continues without rediscovering. Newest first.

---

## 2026-10-23 — Orchestration start
- Discovered real agents: spec-writer, db-schema, code-reviewer, ui-auditor, bug-triage, test-writer, docs-keeper (no Architect/Frontend/Backend/QA/Security — mapped roles onto these). Models: lead on Opus; code-reviewer (opus) for independent QA+Security; test-writer/db-schema (sonnet) as needed.
- Created SPEC (project-ai-spec.md, pre-existing), PLAN.md, PROGRESS.md.
- **Phase 1** = Needs Review (shipped c4249a4, live-verified on prod; 839 tests). Awaiting human "Completed".
- **Safety boundary set:** Phase 2 actions are built with preview → human-confirm → existing guarded action; NOT auto-executed against real customers on prod.

## 2026-10-23 — Phase 2.1 send_proposal → VERIFIED, committed 8d95bc0 (Needs Review); 2.2 + 2.6 built, in QA
- **2.1 send_proposal:** code-reviewer round 1 + re-verification both PASS (no unauthorized-send, no auto-execute, double-submit triple-guarded, per-action cap, no PII leak). Committed `8d95bc0` → **Needs Review** (human marks Completed). Preview-only prod verification still TODO (show confirm card, don't click send).
- **2.2 request_signature** (built, tested): cap=null; available = sent & unsigned; dispatch requestSignatureEmailAction (debounced, no-op if signed).
- **2.6 advance_stage** (built, tested): **cap="stage.move" (admin/manager ONLY — proves send-auth ≠ stage-move)**; gate-aware via projectIntel().canAdvance — REFUSES a blocked move with the reason (AI never does a silent override); dispatch = `setStage(accessId, role, nextStage)` with nextStage RECOMPUTED server-side.
  - **Architect finding (important):** `acceptStageAction` is for SIGN-OFFS (survey/mockup/QC), NOT a lifecycle stage move — the real manual advance is `setStage(accessId, viewRole, stageKey)` in actions.js:513 (admin/manager; phaseGate; admin override logged). Wired to setStage.
  - Framework change: `available(facts, assignments)` may return `{ok,why,data}`; previewAction threads `data` into confirm + apply recomputes it. send_proposal/request_signature unaffected.
- **838 tests pass.** Batched independent QA+Security review of 2.2 + 2.6 delegated to code-reviewer (in flight). On PASS → commit → Needs Review → continue.

## 2026-10-23 — Phase 2.3 record_payment + parameterized args mechanism — built, in QA
- **Committed so far:** 2.1 (8d95bc0), 2.2 + 2.6 (4e9ac2e) — all Needs Review, QA+Security verified.
- **2.3 record_payment (built, 840 tests):** the money action. cap="install.pay.edit" (admin/manager; **sales refused** — 3rd per-action-cap proof). RECORDS a received payment (recordPaymentAction; emails a confirmation) — **NOT a card charge**; the registry/confirm say so explicitly. Amount re-validated server-side (Math.round, >0) and recordPaymentAction re-checks — client amount not trusted. available = a sent (non-draft) proposal.
- **Parameterized ARGS mechanism (reusable for 2.4/2.5):** `parsePayment(text)` (needs a record/log verb + positive $, so plain money talk isn't a command) + `detectAction(text)` → `{name, args?}`; router carries `args`; previewAction(name,accessId,tok,args) refuses with a "How much?" clarify when missing; intent binds args; apply re-validates + dispatches. Param-less actions unaffected.
- **QA+Security review: money-safe PASS** (no charge/capture path, amount re-validated server-side, admin/manager-only at both layers, low false-positive parsing). Two MEDIUM parser bugs FIXED: (1) kind now maps to the DB whitelist (deposit/final/partial) with a separate clean label — was silently coercing "balance"/generic to "deposit"; (2) amount parser now prefers the $-anchored number — "record invoice 7 for $500" was capturing 7. Unit-tested. 840 tests. → committing as Needs Review.

## 2026-10-23 — Phase 2.4 assign_tech — built, in QA
- **Committed:** 2.1 (8d95bc0), 2.2+2.6 (4e9ac2e), 2.3 (edb6701) — all Needs Review, verified.
- **2.4 assign_tech (built + VERIFIED, 841 tests):** reuses the args mechanism. **NEW cap `assignment.edit`:["admin","manager"]** (sales refused at preview+apply). Cert gate RESPECTED (AI refuses an uncertified tech with the reason, never auto-overrides). apply RE-resolves by name (ignores any client userId → no injection). **QA+Security PASS** (no vuln; no test breakage — lifecycle.test enumerators satisfied). Review finding fixed: name resolution was EXACT-full-name only ("assign Dave" dead-ended against "Dave Smith") → new `db.resolveTechByName` is tolerant (exact → prefix → first name → contains) + disambiguates on multiple matches + "already assigned" on idempotent re-assign. Fails closed. → committing as Needs Review.

## 2026-10-24 — Phase 2.5 adjudicate_issue SHIPPED (Option A) → PHASE 2 COMPLETE (6/6)
- **2.5 adjudicate_issue:** committed `bc00b39`, pushed. Closes an EXISTING open install flag (resolve/dismiss); NO create path (raising needs the Phase-4 device resolver — deferred by design) and NO hard-delete (row kept for audit). **5th distinct cap: `issue.adjudicate`** (admin/manager) enforced at preview AND apply; `installIssueAction` self-authorizes again (ISSUE_ADJUDICATORS + status∈{NEEDS_REVIEW,NEEDS_REWORK}). Binds ONE open flag (named id → sole-open → clarify); apply RE-binds against live open issues → stale/closed id refused. `parseAdjudicate` needs an issue/flag noun + explicit resolve/dismiss verb, bails on question phrasings (interrogative lead or trailing "?").
  - **QA+Security (code-reviewer, opus):** security SOLID, 5/5 owner checks PASS (stale-preview refused, double-submit safe, project-bound, server-side authz enforced, no create/no hard-delete), no CRITICAL/HIGH. Two parser findings FIXED pre-commit: (MED) interrogative false-positive ("is the issue resolved?" raised a card) → guarded + tested; (LOW) singular-only noun → plural `s?`. One pre-existing whole-system note (decision not cryptographically bound preview→apply — applies to ALL Phase-2 actions, not this increment's to fix; flag only if the team wants confirm-integrity hardening across the board).
- **PHASE 2 DONE:** send_proposal (8d95bc0), request_signature+advance_stage (4e9ac2e), record_payment (edb6701), assign_tech (4ace367), adjudicate_issue (bc00b39). **5 distinct caps proven** (editor; stage.move; install.pay.edit; assignment.edit; issue.adjudicate — none implies another). 843 tests. Every action: preview → HUMAN confirm → existing guarded server action → audit; none auto-executes; none live-fired on a real customer.

## RESUME HERE — Phase 3 (customer conversation intelligence: knowledge + feedback) — per PLAN.md
NOTE: PLAN.md ordering governs — Phase 3 = **knowledge/FAQ retrieval + structured feedback capture** (lower risk); customer-facing WRITES are **Phase 6** (last, highest injection risk). The SPEC §7 "Phase 3 — Customer-facing" is the OLD ordering, superseded.
- **Key discovery:** the approved knowledge store ALREADY EXISTS — `support_articles` (db.js:1441; admin/manager author, everyone reads, audience `customer|tech`, categories, pinned, kind `article|guide`). Accessors `getSupportArticles(audience)` / `getSupportArticle(id)` (db.js:2252). **Reuse it — no new table.**
- **3.1 — approved-knowledge (FAQ) retrieval (NEXT, staff-first, read-only, no schema):** a PURE scored retriever `lib/ai-knowledge.js` `findKnowledge(query,{audience})` over title+category+body with a relevance threshold (weak matches DON'T answer — never invent). Wire into the answer path BEFORE `classifyMiss`'s "I don't have that" (ai-actions.js:229 `unanswered/company_knowledge`): a question with no project-read match tries knowledge, returns `kind:"answer"` + a Help Center link. Audience-scoped (staff = tech library; proves the no-leak path for Phase 6). Unit tests incl. audience no-leak.
- **3.2 — structured feedback/objection capture:** turn an objection/feedback utterance into a categorized `project_notes` row (model: `addProjectNote(accessId,{role,name,body,scope,anchor,isPublic})`, db.js:6564; scope≤20, anchor≤80) with a taxonomy (objection: price/timeline/scope/trust/other; feedback: praise/concern/request) + open→reviewed→resolved status. Likely needs a small status/category field (a deliberate schema step — db.js ensure-column pattern) — DECIDE before building.
- **Phase 4–6** per PLAN.md (survey integration incl. the device resolver 2.5's create path needs; sales intelligence; customer-facing LAST).

## Session summary (this autonomous run)
Phase 1 project intelligence SHIPPED + live-verified. Phase 2: **5 of 6 actions** shipped + each independently QA+Security verified (commits 8d95bc0, 4e9ac2e, edb6701, 4ace367): send_proposal, request_signature, record_payment, assign_tech, advance_stage. Built the reusable project-action framework + parameterized-args mechanism + per-action-capability model (4 distinct caps: editor, stage.move, install.pay.edit, assignment.edit — one never implies another). 841 tests. Every action: preview → HUMAN confirm → existing guarded server action → audit; none auto-executes a real business action; none live-fired against a real customer. Orchestration ran the full loop (build→test→independent code-reviewer→fix→commit) with durable checkpoints here + in PLAN.md.

## Phase-2 status: 5 of 6 actions built (2.1 send · 2.2 request_sig · 2.3 record_payment · 2.4 assign_tech · 2.6 advance_stage). Only 2.5 raise_issue remains. All verified-or-in-review; none auto-executes a real business action (preview → human confirm). Three distinct per-action caps proven (editor; stage.move; install.pay.edit; assignment.edit).
- **Phase 3–6** per PLAN.md (customer intelligence, survey integration, sales intelligence, customer-facing last).

## (superseded) 2026-10-23 — Phase 2.1 built → Needs Review
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
