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
| 2.5 | `adjudicate_issue` (close) + `raise_issue` (create, device-targeted) | `installIssueAction` / `reportInstallIssueAction` (+ `"device"` targetKind) | issue.adjudicate (admin/mgr) · **issue.report (admin/mgr/TECH)** | Needs Review (bc00b39 + 9525346) |
| 2.6 | `advance_stage` | `setStage(accessId, role, stage)` | stage.move; **phaseGate must pass** (refuse w/ reason, admin override logged) | Needs Review (4e9ac2e) |

**Phase 2 shipped (6/6):** send_proposal (8d95bc0) · request_signature + advance_stage (4e9ac2e) · record_payment (edb6701) · assign_tech (4ace367) · adjudicate_issue (bc00b39) · raise_issue + device resolver (9525346). 5 distinct caps proven; `actionAllowed` gates a capped action by its capability (so issue.report admits techs for raise_issue ONLY — no proposal/payment/stage rights).

**Reusable device resolver (Phase-4 groundwork, landed early per owner):** `lib/device-resolver.js` + `db.getProjectDevices` over the one survey model (`surveyDevices`). Resolves "camera 3" / "front entrance camera" / "camera on the left" → stable device id; ambiguous→clarify, unknown→none, never a guess. Reused next by feedback capture, survey annotations, device questions.

## Phase 3 — customer conversation intelligence (knowledge + feedback capture)
- **3.1 approved-knowledge (FAQ) retrieval — Needs Review (efd903b + fix a887bee).** Pure scored retriever over `support_articles`; answers only on an ON-TOPIC match (title/category hit), snippet sliced from the stored body (never invented); audience-scoped (no customer↔tech leak); staff-first.
- **3.2 structured feedback / objection capture — Needs Review (30aeb1f).** Categorized `project_notes` (scope='feedback') with open→reviewed→resolved status, device-bound via the resolver. Staff-first; customer-submitted feedback → Phase 6.

## Phase 4 — site-survey integration (staged, read-first) — device resolver DONE (9525346); rest Open
Device resolver + `getProjectDevices` shipped; concerns associate to a device via 3.2; **device coverage read SHIPPED (4da3cf9)** — "what does camera 3 cover / why is it at the entrance" from verified survey facts. **The headline now runs end to end** (recognize → explain coverage → record concern). Remaining after sales intelligence: highlight on the floor plan, prepare proposed changes for approval. **Never auto-remove gear / change pricing / alter a signed agreement from conversation.**

## Phase 5 — sales intelligence (reads) — substantially DONE
`feedback_summary` SHIPPED (afae14d): open objections/feedback by kind + bound device + status counts. Outstanding approvals = existing `awaiting_signature`; likely blockers / next action = existing `project_next` / `projectIntel`. Never cost/margin/payout. Reads, staff-scoped via resolveProject. (Optional future: a one-shot "sales brief" composing next+feedback+approvals.)

## Remaining (owner-steer — bigger or higher-risk)
1. **Floor-plan highlight** (UI): **DONE — a91e9fe + fix 962e096**, independently reviewed + re-verified. AI-resolved device rings on the planner (window event → widget `highlight` by cid). The review uncovered + fixed a CRITICAL latent bug: device `id` was `undefined` on real data (stripDevs persists none), which had silently killed resolver/coverage/raise/feedback in production too — now `surveyDevices` keys on cid/code and a non-mocked test guards it. Non-camera visual highlight is a no-op pending a persisted per-device uid (deferred).
2. **Proposed equipment changes for approval** (write): AI drafts a change the human approves — bounded by "never auto-remove gear / change pricing / alter a signed agreement from conversation." Design approved by owner; building in slices:
   - **8a — SHIPPED 7ba03f4 (review in flight):** `propose_change` — device-referenced QTY change + MODEL swap on a DRAFT proposal line. Preview (device→line via camera_id===cid, before/after) → human confirm → `saveProposalDraftAction`. cap:null (editor); draft-only (sent/signed → "coming soon"); never invents a price; never touches a sent/signed proposal.
   - **8b — SHIPPED 7a0d8c8:** `remove_line` (confirm-only) + `proposal.revise` cap (admin/manager) for removals.
   - **8c — SHIPPED de7c947:** sent/signed → `reviseProposal` v+1 with the explicit "voids the signature, requires re-signature" warning (proposal.revise). A signed row is never mutated in place.
   - **#2 DONE (8a+8b+8c)** pending the combined 8b+8c review; 8a reviewed + fixed (ac4bdbe).

## #3 — Customer-facing AI (Phase 6) — DONE (pending slice-3 review)
Separate customer entry, hard allowlist, AI_CUSTOMER flag (default off), own-project only.
- Slice 1 (4f2a499 + c66f82c): read assistant (status/quote/balance/coverage/timeline + customer FAQ), reviewed CLEAN.
- Slice 2 (ac80561): UI mount (customer-assistant.jsx), read-only, flag-gated.
- Slice 3 (635779a): comment (confirmed write) + sign/accept/pay guided nav (AI never performs them). Review in flight.

## ROADMAP COMPLETE (pending slice-3 review). Optional follow-ups
- Persisted per-device uid (non-camera stable refs + highlight); cloned-proposal camera_id relink; conversational generic non-camera ADD; customer-AI slice-3 could later add a true accept_option if the owner wants it (deferred by design).
3. **Customer-facing AI (Phase 6)**: LAST, highest injection risk; owner sign-off before starting.
(Optional polish for #1: also highlight on the customer "Your System Layout" React render, and auto-clear on a new question.)

## Phase 6 — customer-facing AI — Open (LAST, highest injection risk)
Only after internal + knowledge paths are secure. Own-records + approved knowledge + specifically-authorized actions only.
