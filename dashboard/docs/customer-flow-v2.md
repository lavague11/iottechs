# Customer Flow v2: Staged Spec

IOT TECHS FSM platform. Investigate first: read the owning code, flag conflicts with this spec before building, then build one stage at a time. Deploy + screenshots after each stage. All existing email gating, demo-guard and BCC rules stay.

## Stage 1: Payment plan UI (proposal builder) \[Medium\]

1. Payment Plan becomes a settings row directly under Tax, same style as Discount / PCP Credit / Tax: label left, buttons right.
2. Buttons in this order: 50/50, 100, Custom. Remove 50/30/20.
3. Totals block order: Subtotal, Discount, PCP Credit, Tax, Payment Plan, TOTAL, then the payment breakdown (each payment's amount and when it is due).
4. 100 keeps its timing choice: Before we begin / Upon completion / By a date.
5. Custom: any number of payments. Each row has %, amount, and a "when" dropdown: Before we begin, Halfway through, Upon completion, Pick a date (opens calendar).
6. Replace the Monthly button with a spacing toggle: Biweekly (default) / Monthly. Adding payments auto-fills dates at that spacing; every date stays editable.
7. Cents fix: show cents everywhere. The last payment absorbs rounding so payments always sum exactly to TOTAL. Known bugs: 50/50 on $2,649.55 shows $1,324.78 twice (1 cent over); Custom whole-dollar rounding loses $0.55.

## Stage 2: Addendums \[Medium\]

1. Addendum uses the same builder as the proposal: service presets, + Item, + Add Service, Discount, PCP Credit, Tax, Payment Plan.
2. Creating an addendum generates its own PDF in the same design as the proposal PDF and runs the same signature flow: signature request email, customer signs, signed copy and alert to admins and Maya.
3. Addendum amount folds into the final balance by default.
4. Proposal display: the original signed total stays unchanged. Below it, each signed addendum with its amount, then an Updated Total, then the payment breakdown based on the updated total.

## Stage 3: Work order line popup (technician) \[Medium\]

1. Layout top to bottom: steps 1 to 5, one photo button, Notes, status buttons, Save.
2. Steps work like a progress bar. Tapping step N selects steps 1 through N. Tapping a lower step moves progress back to that step. Tapping the only selected step again clears it.
3. Status is automatic from steps: no steps = Not started (default, no button), 1 to 4 steps = In progress, all 5 = Complete.
4. Status buttons at the bottom, full width: In progress, Needs attention, Complete. Tapping a selected status again clears it. Needs attention is a separate flag that can be set at any progress level, including Complete, and still alerts the office as today.
5. Rename Incomplete to Not started.
6. Replace the separate Before and After boxes with one camera button. After taking a photo, the tech tags it Before, After or Detail. Thumbnails show with tags. Photos are optional.
7. Replace any "what's wrong" prompt with a full-width, free-text Notes box, always available.
8. Lines with the same name must be distinguishable: show the line number and location (e.g. "Speaker 3, patio") on the work order, the popup and the closeout screen.
9. Remove the install-stage requirement for install photos. Leaving install needs the checklist complete only.

## Stage 4: Work order as its own signed document \[Big\]

1. Auto-draft: when the proposal is signed, the system automatically creates the work order as a DRAFT from the signed proposal (line items, job address, scope, point-of-contact name). It is never auto-sent. Confirm this already exists in code; keep it and make sure it cannot auto-send.
2. Office reviews the draft, assigns a technician, edits if needed, then presses "Send to technician". Only then is the PDF generated (same design as the proposal PDF) and the signature request sent through the same signing flow as the proposal.
3. Assignment email on send: "You've been assigned to a project" with job address, scope, and a link straight to sign the work order.
4. Two modes. Before signing, the tech sees the document and a Sign button only: no check-in, no line marking. After signing, the execution view appears: "I'm on site" check-in, step counter, line items with the Stage 3 popup.
5. Work order PDF and tech view: job address, scope, line items, point-of-contact name. No customer phone number or email; other contact goes through the office. No prices shown to the technician (remove the $ amounts from the tech's line list).
6. Versioning like the proposal ("Sent v1, awaiting signature", sent versions list). Signed addendums are added automatically: as draft lines if not yet sent, or as a new version for the tech to re-sign if already signed. The execution view keeps working on already-signed lines meanwhile.
7. Reassigning a tech: the new tech gets the assignment email and their own work order to sign; the previous tech gets a short "You've been removed from this project" email and loses access.
8. Project page Work Order card states: "Draft ready, assign a technician" → "Awaiting technician signature" → "Signed by \<tech>, \<date>" → "\<x> of \<y> lines complete" → "Complete".
9. Gates: the tech's signature = technician accepted the work order (satisfies the schedule stage). A project cannot reach install, QC or final payment without a signed work order. Investigate how AAU0080 reached "Awaiting Final Payment" (90%) while its Work Order card still says "Create", report the path, and close it. Do not retro-lock existing projects; list those past install with no signed work order in the report.
10. Verify: run one project through proposal signed → draft auto-created → assign → send → tech signs → execution view → lines complete, capturing the \[email:skipped\] lines. Screenshots: draft, awaiting signature, tech signing screen, signed execution view, the PDF, each card state.

## Stage 5: Customer email map \[Big\]

Every email fires on the event itself, not on a manual stage drag, deduped with a persisted per-project, per-email flag so it can never send twice.

1. Survey appointment booked.
2. Site survey and proposal ready to sign: one email (merge the separate survey and proposal emails). Shows the actual price-lock date.
3. Quote expiry: if unsigned, one reminder "2 days left before your quote expires". On expiry, one "Your quote has expired" email linking to Request to reopen. Nothing after that.
4. On signing: if anything is due before work starts, "Your proposal is signed, payment due" with signed PDF, amount and how to pay (cash to office or tech, or online), plus one reminder 2 days later if no payment is recorded. If nothing is due upfront, "Your proposal is signed, we'll schedule you" with signed PDF and Phone Setup link.
5. First payment received (any amount): receipt PDF, "we'll schedule you" and Phone Setup link. Later payments get a plain receipt. Receipts only on staff record or confirm, never on the customer's own unconfirmed submission.
6. Scheduling gate: any first payment unlocks scheduling (replaces "deposit confirmed"). If nothing is due upfront, signing alone unlocks scheduling.
7. Install booked: date and time only.
8. Installation complete / sign-off request stays. Remove the automatic \~24h sign-off chase.
9. Milestone payment due emails: Halfway through = when 50% of work-order lines are complete, or at install start if the job has 2 or fewer lines, with one reminder at 2 days. By a date = sent on that date, one reminder at 2 days. Upon completion (final balance) = sent when sign-off completes, reminders at 2 and 5 days. These replace the existing invoice reminders (3 days before and on due date).
10. Paid in full: one email with receipt and completion report. The completion report (email and portal Completion card) gets a "Leave us a review" button. Remove the separate review-request email.
11. Remove automatic appointment reminders (day-before and same-day). Keep the manual per-appointment Remind button.
12. Keep unchanged: change order / add-on approval, appointment reschedule and cancel, password reset, office and admin alerts, candidate and ADT emails.
13. Do not add: a "changes requested" email, or any completion-signing access lock.

## Stage 6: Scheduler, verification, deploy

1. Confirm the deploy target. All timed sends (2-day, 5-day, expiry, date-based, halfway) must run in prod. If serverless, move these sweeps to /api/cron/\* routes with an external cron instead of instrumentation.js boot timers. Use the Claude in Chrome extension to verify or configure the hosting cron dashboard and screenshot it.
2. Locally, run one project per plan type (50/50, 100 before we begin, 100 upon completion, Custom with halfway and a date) and capture the \[email:skipped\] log lines proving each email fires once at the right moment and removed emails no longer fire.
3. Deploy. Screenshots: totals block per plan type, Custom with dropdown, calendar and biweekly, an addendum in the builder, proposal showing original total + addendum + updated total, work order popup in each state, tech work order PDF, assignment email.
4. Report: done, unverified, and what must be tested by hand.

---

## Build notes

Conflicts found between this spec and the owning code, and what was decided. Each entry names the files
that own the behaviour so a later session can re-check the call rather than re-derive it.

### Stage 1 — Payment plan UI

Owning code: `lib/proposal.js` (PAYMENT_PLANS, PLAN_MILESTONES, planScheduleRows, customPlanRows,
planDepositPct, validateProposalPayload) · `app/project/[accessId]/proposal-builder.jsx` (totals block,
plan picker, custom editor) · `proposal-payment-plan.jsx` (read-only renderer) · `lib/proposal-pdf.js`,
`lib/proposal-version-snapshot.js`, `lib/ai-answer.js`, `approval-panel.jsx`, `completion-panel.jsx`
(consumers).

1. **"Payment Plan becomes a settings row" vs. one plan BLOCK.** The plan was not a settings row: it was a
   whole block below the total carrying the picker, the milestone columns, the live balance, per-milestone
   paid/due state and the payment history. Taking it wholesale into a settings row would have thrown that
   away. **Decided:** split it — the *picker* becomes a settings row under Tax (spec items 1–3), and the
   *breakdown* stays below TOTAL, which is also where spec item 3 puts it. Everything else in that block
   (balance, progress, history) stays where it was.

2. **"Remove 50/30/20" is a data question, not just a button.** `50_30_20` is a stored
   `payload.payment_plan` value accepted by `validateProposalPayload`, and sent proposal versions are
   immutable (CLAUDE.md, PROPOSAL ARCHITECTURE — LOCKED). Deleting the plan would leave any proposal
   already signed on it with no schedule. **Decided:** removed the picker button only; the plan stays in
   PAYMENT_PLANS / PLAN_MILESTONES / validation so existing documents keep rendering. Verified live on
   ASC0125, which was on 50/30/20 and still showed Deposit 50 / Progress 30 / Final 20.

3. **The custom "when" dropdown changes what is due up front — a money gate.** Custom rows were
   `{pct, due}` and `planDepositPct` treated **the first row** as the deposit. That function is the single
   source for "deposit due" across `approval-panel`, `completion-panel` and `amountDueForPayment`, so with
   a `when` per row the first row may now be a Halfway or Upon-completion payment. **Decided:** rows gain
   `when` (`begin | halfway | completion | date`); up-front = the sum of every `begin` row. A plan whose
   rows carry **no** `when` is legacy and keeps the old first-row reading exactly, so no stored or signed
   proposal changes meaning. Pinned by test.

4. **Spacing toggle vs. per-row trigger.** Biweekly/Monthly already existed, but behind a gear menu and
   defaulting to monthly. **Decided:** visible toggle, biweekly default (spec item 6), and spacing only
   moves rows whose `when` is `Pick a date` — a Halfway row has no date to space.

5. **Cents.** Both reported bugs reproduced exactly: `planScheduleRows` rounded each milestone on its own
   (50/50 of $2,649.55 → $1,324.78 twice, a cent over) and the custom amount input was whole-dollar
   (`step="1"`, `Math.round`), losing $0.55 on 34/33/33. **Decided:** one `splitAmounts()` helper is now
   the only place a percentage becomes dollars, and the last installment absorbs the residual. The amount
   field renders `.toFixed(2)` so $776.70 never reads as $776.7.

6. **Minimum payment count.** The stepper enforced a minimum of 2; the spec says "any number". **Decided:**
   minimum 1 (a single installment is just 100% on whatever trigger you pick).

---

## Progress

| Stage | State | Commit | Notes |
|---|---|---|---|
| 1 — Payment plan UI | **done** | (see git log `stage 1`) | Verified live: settings row under Tax, 50/50 · 100 · Custom, breakdown under TOTAL, Custom with when-dropdown + biweekly spacing, cents exact. |
| 2 — Addendums | next | — | |
| 3 — Work order line popup | — | — | |
| 4 — Work order as a signed document | — | — | |
| 5 — Customer email map | — | — | |
| 6 — Scheduler, verification, deploy | — | — | |

**Resume point:** Stage 2. Owning code to read first: `lib/addendum-items.js`, `lib/addendum-pdf.js`,
`lib/addendum-schema.js`, `lib/addendum-display.js`, `app/project/[accessId]/install-addendum.jsx`,
`app/api/addendum/route.js`, and `lib/esign/` (the proposal signing path Stage 2 item 2 must reuse).
