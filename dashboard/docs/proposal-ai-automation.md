# Proposal → Invoice workflow: AI automation map & opportunities

Analysis of the proposal lifecycle and the invoice/payment/receivables system, with a ranked set of
AI-bot automations. Grounded in the code (file:line from the two system maps). "Built" = already shipped in
the AI command center; "Gap" = not yet. Everything respects the existing rule: preview → human confirm →
guarded action; nothing auto-fires money/signatures without a human; customer text is untrusted + allowlisted.

## The workflow as it is (one line per stage)
1. **Draft** — staff hand-build line items in `proposal-builder.jsx`, or import from survey (`surveyToImport`, proposal.js:534). Unmapped device kinds + every `price:0` catalog line (most Toast hardware, custom) are priced BY HAND; multi-option A/B/C, discount, PCP, payment plan, tax, deposit % all manual.
2. **Send** — two-step Submit→Send (`sendProposalAction`); seeds tech payout; jumps stage to `proposal`; emails a signature request.
3. **Review / accept / sign** — customer-only in `proposal-customer-view.jsx`: accept option(s) → **Review & Sign** opens the e-sign signer (`esign/`, fingerprint-bound, robust). Staff can only manually **Request Signature** (debounced 90s, no cadence).
4. **Approval & deposit** — `approval-panel.jsx`: staff hand-record each payment (amount/method/kind/date); a customer self-report lands `pending` until a human **confirms receipt**; deposit gate needs a *confirmed* payment; then **Create Work Order**.
5. **Schedule → install → QC** — manual sign-offs (not AUTO_STAGES).
6. **Payment (final balance)** — same manual record/confirm; `final_balance_paid` gate.
7. **Invoices** — **NOT a real record.** `lib/invoice-pdf.js` renders a PDF in the browser on a Download click from proposal totals + recorded payments. No `invoices` table, no issued/stored number (`INV-<proposalId>-v<ver>` is recomputed each time), never emailed, never tracked. No online payment anywhere (method is a free label; "Zelle preferred").

## What the AI already does (shipped — don't rebuild)
`send_proposal`, `request_signature`, `advance_stage` (gate-aware, refuses when blocked), `record_payment`, `propose_change` (qty/model, draft or revise-with-re-sign), `remove_line`, each preview→confirm; reads `proposal_total`/`project_money`/`awaiting_signature`/`device_coverage`/`project_status`; the customer assistant (read + one confirmed comment + guided sign/pay nav); device resolver + coverage; feedback capture; approved FAQ; the 30-day unsigned auto-close sweep.

## Opportunities — ROI-ranked

### 1. Collections cadence (deposit + balance chasing) — ✅ SHIPPED (226d074, reviewed clean)
Today nothing auto-reminds about an unpaid **deposit** or **final balance** — those financial states (`receivables-model.js`: Awaiting Deposit / Due Now) explicitly never auto-close, and `agingDays` is computed but acted on only by eyeball on the AR page.

**Built (queue-for-confirm, never auto-send):** `collections-cadence.js` `paymentNudge()` (first reminder day 3, ≥5 days apart, max 4, no hard deadline — a balance never auto-closes) + a `collections_queue` read (cap `install.pay.edit` = admin/manager; filters `getReceivables` to awaiting-deposit/due-now and lists who is due) + a `request_payment` action: `emailPaymentReminder` (grounded in the real `amountDueNow` from `getProjectFinancialState`, Zelle preferred, no-op without `RESEND_API_KEY`) dispatched by `requestPaymentReminderAction` (admin/manager, 90s debounce, logs the reminder event). Preview computes the amount server-side and clarifies when nothing is due; apply flows through the guarded action. Deliberately stricter than #2 (sales excluded — collections exposes amounts owed). Chose queue-for-confirm over the auto-send option: no customer email fires without a human click.
- **Reuses:** `getReceivables`/`receivables-model`, `getProjectFinancialState`, `email.js`, the AI preview→confirm→action layer; mirrors the #2 signature cadence twin.
- **Metric:** days-sales-outstanding (time-to-deposit, time-to-final), % deposits collected within N days.
- **Deferred:** a scheduled background sweep (today the queue surfaces on ask, not on a cron) and citing a real invoice number (waits on #4 invoices-as-records).

### 2. Signature-chasing cadence — ✅ SHIPPED (8a2fde1 + fixes 878fb34, 1df9817; reviewed clean)
`signature_nudges` read: a queue-for-confirm list of sent-but-unsigned proposals DUE for a reminder (first at day 2, ≥4 days apart, max 3, stops at the 30-day deadline), from aging + logged reminder events (no new storage). Staff send via the existing `request_signature` (preview→confirm); never auto-sends. Gated to `proposal.reuse` (admin/manager/sales). Router: "who needs a signature nudge / who should I chase for signatures". — original note below —
`awaiting_signature` is known but nudging is manual/debounced with no schedule; the only automated event is the 30-day auto-close (which *loses* the deal). Add an AI-drafted nudge sequence (day 2/7/14) BEFORE the close, personalized, with the Review & Sign link.
- **Reuses:** the `awaiting_signature` read + `requestSignatureEmailAction` + a schedule.
- **Metric:** sent→signed conversion, time-to-sign, fewer 30-day auto-closes.
- **Effort:** Low. **Gap.**

### 3. Draft the proposal from the survey — HIGH ROI on sales throughput
`surveyToImport` already expands placed devices → priced blocks + auto-sized NVR, but authoring a *complete* proposal is still manual: unmapped kinds and every `price:0` line are hand-priced, options/discount/plan set by hand. Add an AI `draft_proposal` (preview) that: builds a first-pass Option A from the survey, prices from the book, **flags the lines it couldn't price** for a human, and optionally drafts a "good/better" second option — staff review & send.
- **Reuses:** `surveyToImport`, the price book, `applyIntentToPayload`, `saveProposalDraftAction`, the device resolver.
- **Metric:** survey→sent time, proposals/rep/day.
- **Effort:** Medium. **Gap** (extends the propose_change framework).

### 4. Invoices as real, sent, tracked records — biggest STRUCTURAL gap
Invoices are ephemeral today. Make them records: a numbered, stored invoice (deposit invoice on signed; balance invoice on completion), **emailed automatically**, with a sent/outstanding/paid status the AR page tracks (today AR tracks only payments, not invoices). The AI angle is modest (draft the cover note; answer "what do I owe / how do I pay") — most of this is workflow plumbing, but it's foundational for #1's reminders to reference a real invoice.
- **Reuses:** `invoice-pdf.js` (make it server-side + persist), `doc-filename.js` (`DOC.INVOICE`), `email.js`.
- **Metric:** invoices issued/sent on time, payment latency, AR accuracy.
- **Effort:** Medium-High. **Gap.**

### 5. Customer-reported payment capture → one-click confirm — MEDIUM ROI, builds on shipped work
Phone-tag + hand-keying is the payment-entry friction. Let the customer assistant capture a structured self-report ("paid the deposit by Zelle, ref 4821, $2,450") → a `pending` payment (customer source, as the model already supports) with method/ref/amount parsed → staff one-click **confirm**. Not a charge — matches the existing acknowledge-then-confirm model.
- **Reuses:** the customer assistant, `recordPaymentAction` (customer→pending), `confirmPaymentAction`.
- **Metric:** payment-entry time, reconciliation errors, deposit-gate latency.
- **Effort:** Medium. **Gap** (a new customer-assistant write — owner checkpoint, like slice 3).

### 6. Explain the quote to the customer (reduce sales back-and-forth) — ✅ SHIPPED (23fe35b, reviewed clean)
The customer assistant (read-only) now explains their quote, grounded in their own proposal + a generic glossary (`quote-glossary.js`, never a price, never invented), via three reads added to `CUSTOMER_READS`:
- **explain_item** (no cap): "why an NVR?" / "what's the $150 drop?" → a glossary definition grounded against their package ("includes 8 of these"). Unknown term → falls to the FAQ.
- **compare_options** (`customer.financials.view`): "difference between the options" → each option's headline gear + retail total.
- **explain_terms** (`customer.financials.view`): "how does the deposit work?" / "what's the PCP credit?" → their own plan (`planScheduleRows`/`planDepositPct`) + `pcp_credit`.
- **Metric:** sales touch-time/deal, time-to-sign.

### 7. Objection / change-request → proposed revision — ✅ SHIPPED (23fe35b, reviewed clean)
- **Customer → captured concern (the headline):** `customerActionIntent` recognizes an objection/change-request. "I'm not sure we need the entrance camera" → the assistant **explains that camera's coverage** from the survey, then offers to **log the concern** → `aiCustomerFeedbackAction` (confirmed, re-gated like the shipped customer comment, device re-resolved server-side, role=customer, non-destructive `open` item). The proposal is never touched.
- **Staff one-click revision:** `suggestedActionFor` surfaces the next step on a device-bound objection in `feedback_summary` (need/scope → drop, price → revise), confirmed through the shipped `remove_line`/`propose_change`.
- **Reuses:** `propose_change`, `remove_line`, `capture_feedback`, the device resolver, the customer comment gating template.
- **Metric:** revision turnaround, objection win-back.

## Correctness gaps surfaced by the analysis (not AI, but worth fixing)
- **Addendum action-center gap:** `install-addendum.jsx` never sets a `shared` flag, but `requiredActionsFromState`/`resolveCustomerRequiredActions` only surface a change order when `shared===true` — so customer change orders may not appear in the canonical action-center banner (signing still works inside the panel). Low effort, correctness win.
- **Signature-void awareness:** a post-sign edit silently voids the signature/gate (fingerprint drift); nothing proactively flags it. The AI could detect `signed_name` set but `proposal_signed===false` and prompt a re-request.
- **PCP finalize:** stays `pending` until a manual admin `finalizePcp`; surface it as an admin action.
- **Deposit-% drift:** legacy `deposit_pct` vs plan-derived `planDepositPct` — code routes around it; worth reconciling.

## Recommended sequence
Fast wins first: **#2 signature cadence** → **#1 collections cadence** (the two cash levers, both reminder-style, low-risk) → **#6 explain-the-quote** + **#7 objection→revision** (build on shipped AI) → **#3 draft-from-survey** → **#4 invoices-as-records** (structural, enables #1 to cite a real invoice) → **#5 customer payment capture** (owner checkpoint). The correctness gaps can be fixed any time and are cheap.
