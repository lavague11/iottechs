# Project-Page AI — Capability Spec

**Goal.** On a project page, the assistant is a *stage-aware, role-aware operator for this one job* — it can always answer **"where are we, what's next, and what can *I* do about it,"** and then do it, filtered by the viewer's role. It never invents and never bypasses a gate.

This spec defines the exact intents per **stage × role**, each mapped to a capability (`lib/roles.js`) and an **existing** server action, in the order they should be built.

---

## 1. Architecture — one invariant

The AI **never executes**. It emits a validated intent; the backend enforces `can(role, cap)` + the existing server action + server-side sanitize. Same pattern the command center already uses.

```
utterance/text
  → interpret (router 0-token, else Haiku)            lib/ai-command.js
  → intent {type, …}
  → aiInterpretAction(accessId, text, ctx)            app/project/[accessId]/ai-actions.js
       · resolve caller + role from cookies (getSessionRole)
       · aiGate(tok, AI_COMMANDS) — staff gate
       · can(role, cap)  — the intent's capability
       · build a PREVIEW from CURRENT stored state (never a forged payload)
  → client shows preview → user confirms
  → aiApply…Action → the EXISTING server action (sendProposalAction, recordPaymentAction, …)
       · that action re-checks role + validates + mutates + logs (kind "ai")
```

Rules that hold for every write:
- **Preview + confirm** always; **irreversible** actions (payments, sends, voids, stage moves, signatures) always confirm with an explicit summary.
- **Gate violations are explained, never bypassed.** Only `stage.move` roles may override, and the override is logged (`setStage` already logs it).
- Reads are **role-stripped server-side** (sanitize), not just hidden in the UI.
- Audit: every applied intent writes a Job-Log line (`logProjectEvent kind:"ai"`), as today.

---

## 2. What the AI reads (ground truth — never invented)

| Source | Gives the AI |
|---|---|
| `db.buildStageFacts(accessId)` | per-stage requirement facts (`proposal_status`, `deposit_recorded`, `install_done`, `qc_*`, `final_balance_paid`, …) |
| `stage-flow.js` `STAGE_FLOW` + `unmetRequirements` / enforceable filter | the unmet requirements for the current stage, each tagged `who: "customer" \| "internal"` and backed by a real `check()` |
| `stage-flow.js` `phaseGate()` / `MASTER_ORDER` | the lock + reason for advancing; the next stage |
| `db.getToolMeta` | per-tool completion/status the deck renders from |
| `lib/roles.js` `can(role, cap)` + `CAPS` | what this viewer may see/do |
| `lib/svc-model.js`, `survey2-model.js`, `install_issues`, `stage_acceptances`, `project_payments` | devices, issues, QC acceptance, money |

**Derived read — "the next move":** the earliest **enforceable, unmet** requirement for the current stage → its `who` tells the AI whether to nudge the customer or do the internal step.

---

## 3. Capability tiers

- **Know** — status, blockers, who owes the next move, money (role-stripped), devices, issues, timeline.
- **Next** — the single next action for this stage, surfaced from the gate + `who`.
- **Do** — execute that action, gated by `can(role, cap)`, through the existing server action, preview + confirm.

---

## 4. The lifecycle (9 stages) — `MASTER_ORDER`

`inquiry → site_survey → proposal → approval_deposit → schedule → install → qc → payment → completion`

Auto-advancing (server moves on once checks pass): `inquiry, site_survey, proposal, approval_deposit, payment`.
Manual (human verifies field work): `schedule, install, qc, completion`.

### Per-stage "next move" + the intent that performs it

| Stage | Unmet requirement (who) | AI "next move" | Intent | Server action | Cap |
|---|---|---|---|---|---|
| inquiry | survey appointment scheduled (internal) | Book the survey / skip | `book_survey` · `skip_survey` | `bookSurveyDateAction` · `skipSurveyAction` | stage.move |
| site_survey | survey submitted (internal) → customer accepted (customer) | Submit survey; then await acceptance | `submit_survey` | `submitToolAction` (survey) | install.edit‡ |
| proposal | proposal sent (internal) → option accepted + signed (customer) | Send it; then request signature | `send_proposal` · `request_signature` | `sendProposalAction` / `emailProposalAction` · `requestSignatureEmailAction` | proposal.reuse / send |
| approval_deposit | signed + deposit submitted (customer) → receipt confirmed (internal) | Chase signature; record the deposit | `record_payment` · `confirm_payment` | `recordPaymentAction` · `confirmPaymentAction` | install.pay.edit / financials |
| schedule | tech accepted WO (internal) → appointment confirmed (customer) | Finalize WO, assign a tech, book the date | `finalize_work_order` · `assign_tech` · `book_date` | `finalizeWorkOrderAction` · `addAssignmentAction` · `logAppointmentAction` | install.edit, install.pay.edit |
| install | checklist + photos (internal) | Accept WO; mark steps; upload; raise an issue | `accept_work_order` · `raise_issue` | `acceptWorkOrderAction` · `installIssueAction` | install.edit, issue.report |
| qc | manager QC + customer walkthrough (both); resolve issues | Manager QC sign; adjudicate issues | `qc_accept` · `adjudicate_issue` | `acceptStageAction`(qc)/QC sign · `installIssueAction` | qc.edit / qc.sign.manager, issue.adjudicate |
| payment | final balance paid (customer) | Send invoice; record payment | `record_payment` | `recordPaymentAction` | install.pay.edit / financials |
| completion | completion docs (internal) | Generate docs; set warranty; close | `complete_project` · `set_warranty` · `close_project` | `completeProjectAction` · `setWarrantyAction` · `closeProjectAction` | stage.move |
| any → next | gate passes | Advance the stage (with gate check) | `advance_stage` | `acceptStageAction` / `techAdvanceStageAction` | stage.move |

‡ survey submit is office/tech; confirm the exact cap when wiring (`install.edit` placeholder).

---

## 5. Role lenses — same page, different operator

What each role may DO (and the money they may see). Server-side sanitize already strips the rest.

| Role | Can DO (intents) | Money visible |
|---|---|---|
| **admin / manager** | everything below + `advance_stage`, `set_payout`, `set_commission`, void/close, adjudicate, QC sign, price addendum, override gate (logged) | cost, margin, payout, retail, financials |
| **sales** | `send_proposal`, `request_signature`, `revise_proposal`, reuse/clone, `add_note` | retail + customer financials; **never** cost/payout/rates |
| **tech** | `accept_work_order`, mark install steps, `raise_issue`, upload photos, `log_addendum` (no prices), ask payout (their own) | **their own payout only**; never retail or customer financials |
| **customer** | `accept_option`, `sign_proposal`, `sign_addendum`, `qc_sign` (walkthrough), `pay_deposit`/`pay_balance`, `comment` | their own financials; **never** cost/margin/payout/crew/internal notes |
| **vendor** | `track_package` / mark delivered; see job-site address | none |
| **readonly** | nothing (read only) | as office, controls off |

Caps backing these are already defined in `lib/roles.js` (`install.*`, `qc.*`, `issue.*`, `addendum.*`, `tracking.*`, `stage.move`, `cost.view`, `customer.financials.view`, …).

---

## 6. Intent catalog (the contract to add)

New AI intents, each: **cap required**, **server action**, **confirm?**. Reads extend `ai-answer.js` `runQuery`; writes add a preview in `ai-actions.js` + an apply that calls the existing action.

### Reads (Know) — `lib/ai-answer.js`
| query | returns | cap gate |
|---|---|---|
| `project_status` *(exists)* | stage + proposal state | visible |
| `project_next` | the next enforceable unmet requirement + who owes it | visible |
| `project_money` | totals / deposit / balance / paid, **role-stripped** | `customer.financials.view` (cost only if `cost.view`) |
| `project_payout` | payout figure (tech: own; admin/mgr: all) | `install.pay.view` |
| `project_devices` | survey device summary | `qc.view` / survey read |
| `project_issues` | open install issues + QC flags | `issue.view` |
| `project_timeline` | days in stage, last activity | visible |

### Writes (Do) — preview → confirm → existing action
| intent | cap | server action | confirm |
|---|---|---|---|
| `send_proposal` | proposal send | `sendProposalAction` / `emailProposalAction` | yes (sends to customer) |
| `request_signature` | proposal send | `requestSignatureEmailAction` | yes |
| `revise_proposal` | addendum.price / proposal edit | `reviseProposal` → addendum | yes |
| `record_payment` | install.pay.edit | `recordPaymentAction` | yes (money) |
| `confirm_payment` | install.pay.edit | `confirmPaymentAction` | yes |
| `assign_tech` | install.edit | `addAssignmentAction` | yes |
| `finalize_work_order` | install.pay.edit | `finalizeWorkOrderAction` | yes |
| `book_date` | stage.move | `logAppointmentAction` / `bookSurveyDateAction` | yes (customer email) |
| `accept_work_order` | install.edit (tech) | `acceptWorkOrderAction` | yes |
| `raise_issue` | issue.report | `installIssueAction` | yes |
| `adjudicate_issue` | issue.adjudicate | `installIssueAction` | yes |
| `qc_accept` | qc.edit / qc.sign.manager | QC acceptance / `acceptStageAction` | yes |
| `advance_stage` | stage.move | `acceptStageAction` (gate-checked; override logged) | yes |
| `set_payout` | install.pay.edit | `setPayoutAction` | yes |
| `set_commission` | admin/manager | `setCommissionAction` | yes |
| `add_note` *(exists)* | — | `aiApplyNoteAction` → `addNoteAction` | no |

### Customer-safe writes (Phase 3 — highest injection risk)
| intent | server action |
|---|---|
| `accept_option` | `selectOptionAction` |
| `sign_proposal` | `startSignAction` / `completeSignAction` (esign) |
| `sign_addendum` | `signAddendumAction` |
| `pay_deposit` / `pay_balance` | payment submit flow |
| `comment` | `addNoteAction` (scope: comment) |

---

## 7. Build order

### Phase 1 — Know + Next, staff, read-only *(start here)*
Add `project_next`, `project_money` (role-stripped), `project_issues`, `project_timeline`, `project_payout` to `runQuery`. Router phrases: "what's next", "what's blocking", "what's the balance", "any open issues", "how long in this stage". Zero write surface.
**Done when:** on any project, any staff role, the AI states the stage, the single next move + who owes it, and money the role may see — all from `buildStageFacts`/`phaseGate`, matching the deck. Unit-tested with injected facts + per-role visibility (a tech never gets retail; a sales never gets payout/cost).

### Phase 2 — Do, one safe action at a time (value order)
`send_proposal → request_signature → record_payment → assign_tech → raise_issue → advance_stage`. Each: new intent + `ai-actions.js` preview (checks `can`) + apply → existing action + confirm + audit. `advance_stage` must run `phaseGate` and refuse with the reason when locked (admin override logged).
**Done when:** each action works end-to-end for an authorized role, is refused (with a useful reason) for an unauthorized role, and is gate-aware.

### Phase 3 — Customer-facing
`accept_option, sign_proposal, sign_addendum, pay_*, comment` + plain-language status. Read + these safe writes only; everything else sanitized out. Prove the emit-intent/validate path on staff first.
**Done when:** a customer can understand and sign/pay on their portal, and can never reach cost/margin/payout/crew/internal notes (server-stripped, tested).

---

## 8. Guardrails & testing (every phase)
- AI emits intent; **backend enforces** `can` + action + sanitize — never the AI's say-so.
- Preview + confirm on writes; irreversible always confirm; gate violations explained.
- Keep router-first (0-token) for the common phrasings; Haiku fallback; target < ½¢/command.
- Reads recompute from current stored state; writes go through the builder's/action's own validation.
- Tests: per-role visibility on every read (no leak), per-role refusal on every write, gate-aware `advance_stage`, and the audit line on apply. Run through the **real project-page bar**, not only unit fakes.

---

*Sources of truth: `lib/stage-flow.js` (MASTER_ORDER, STAGE_FLOW, phaseGate), `lib/roles.js` (can/CAPS), `lib/db.js` (buildStageFacts, getToolMeta), `app/project/[accessId]/*-actions.js` (the server actions above), `lib/ai-command.js` / `lib/ai-answer.js` / `app/project/[accessId]/ai-actions.js` (the AI layer).*
