# Lifecycle audit — Admin, Customer, Technician

**Status:** STEP 0 (the checklist). Nothing walked yet, no code touched.
Written 2026-11-24. Sales, Manager and Vendor are deliberately out of scope for this pass.

Everything below is read from the canonical sources, not invented:
`lib/spec.js` (`PHASES`), `lib/stage-flow.js` (`MASTER_ORDER`, `STAGE_FLOW`), `lib/deck-tools.js`
(`DECK_TOOLS` access map), `lib/roles.js` (`CAPS`). If this file and those disagree, **they win** and
this file is the bug.

---

## One correction to the brief before we start

The brief lists the lifecycle as *Consulting → Site Survey → Proposal → Signing → Install → Closeout
→ Completion → Final Payment*. The system's actual model is **9 stages inside 5 phases**, and it
differs in two places worth knowing before the walkthrough:

1. **Final Payment is not last.** It sits inside **Closeout**, before Completion. Completion is a
   read-only wrap-up that unlocks *after* the balance is settled, not a step that leads to payment.
2. **"Consulting" and "Site Survey" are one phase, not two.** Consulting = `inquiry` +
   `site_survey`. "Signing" is not its own stage either — it is a gate inside `approval_deposit`.

So the walkthrough follows the real order. Where the brief's names differ I keep the brief's word in
brackets.

| Phase (`PHASES`) | Stages (`MASTER_ORDER`) | Brief's name |
|---|---|---|
| **Consulting** | `inquiry` → `site_survey` | Consulting + Site Survey |
| **Proposal** | `proposal` → `approval_deposit` | Proposal + Signing |
| **Install** | `schedule` → `install` | Install |
| **Closeout** | `qc` → `payment` | Closeout + Final Payment |
| **Completion** | `completion` | Completion |

---

## The gates — what actually advances a job

From `STAGE_FLOW`. Every one is `check()`-backed; `phaseGate()` is the only thing that decides
whether a stage may advance. **These are the audit's pass/fail spine**: at each stage the three roles
should each see one clear next action pointing at the open gate, or an honest "awaiting X".

| Stage | Gate(s) that must be satisfied | Whose action closes it |
|---|---|---|
| `inquiry` | Survey appointment scheduled | Admin |
| `site_survey` | Customer accepted the site survey | Customer |
| `proposal` | Proposal submitted to customer · Customer accepted an option | Admin → Customer |
| `approval_deposit` | Customer accepted the proposal · Customer signed the agreement · First payment received | Customer → Admin records |
| `schedule` | Technician accepted the work order · Customer confirmed the install appointment | Technician + Customer |
| `install` | Install checklist completed | Technician |
| `qc` | Manager QC approved · Customer walkthrough / acceptance signed | Admin → Customer |
| `payment` | Final balance paid | Admin records |
| `completion` | Completion documents generated | System / Admin |

---

## What each role should see and do, per stage

Tool visibility is `DECK_TOOLS` (`sees(role, phase, name)`); capability is `can(role, cap)`.
**edit** = may change it · **view** = read-only · **—** = must not see it at all.

### Consulting — `inquiry`, `site_survey`

| | Admin | Customer | Technician |
|---|---|---|---|
| Site Survey | **edit** | view | **view** |
| Mockups | **edit** | view | view |
| Survey appointment | schedules it | confirms / sees it | sees it if assigned |
| Survey sign-off | sends for approval | **accepts** (the gate) | — |

- Admin: create the project, capture the survey (floor plan + cameras), submit for approval.
- Customer: view the survey read-only, comment, **accept**. Never edits — their only write is a comment.
- Technician: `survey.edit` is **true** for techs (they walk the site), but `DECK_TOOLS` gives them
  **view** on the Site Survey card. **This is the first thing to check in the walkthrough** — two
  sources disagree about whether a tech can edit a survey, and the sync work this week made the write
  path permissive for `survey.edit`.

### Proposal — `proposal`, `approval_deposit` (the brief's "Signing")

| | Admin | Customer | Technician |
|---|---|---|---|
| Proposal | **edit** | **edit** (accept/sign) | view |
| Tech Board | — | — | **view** |
| Approval & Deposit | **edit** | **edit** | — |
| Create Work Order | **edit** | — | — |
| Cost / margin / payout | **edit** (`cost.view`) | — | — |

- Admin: build and price it, send it, request signature, record the deposit.
- Customer: review, pick an option, **sign the stored PDF** (`lib/esign/`), pay the deposit.
- Technician: sees the Tech Board only. **Must never see retail price, margin or the customer's
  financials** (`customer.financials.view` excludes tech) — just fixed for the hero banner, so this
  is worth re-checking everywhere else.

### Install — `schedule`, `install`

| | Admin | Customer | Technician |
|---|---|---|---|
| Work Order | **edit** | — | **edit** |
| Addendum | **edit** | view | **edit** (logs work, no prices) |
| Install checklist | **edit** | — | **edit** |
| Project Ready | — | **view** | — |
| Set Up Your Phone | — | **view** | — |
| Install appointment | schedules | confirms (gate) | accepts the WO (gate) |

- Technician payout is visible to the tech on their own work order; **never to the customer**.

### Closeout — `qc`, `payment`

| | Admin | Customer | Technician |
|---|---|---|---|
| Quality Control | **edit** | — | **edit** |
| Walkthrough | — | **edit** (the gate) | — |
| System QR | **edit** | **view** | **edit** |
| Final Payment | **edit** | **edit** | **—** |

- The money states (`AWAITING_DEPOSIT`, `AWAITING_FINAL_PAYMENT`) and their CTAs must not render for
  a technician at all — banner *and* button.

### Completion — `completion`

| | Admin | Customer | Technician |
|---|---|---|---|
| Completion / Wrap-up | **edit** | **view** | **view** |
| Completion certificate | generates | downloads (gated on paid-in-full) | — |
| System QR | **edit** | **view** | **edit** |

---

## Standing rules this audit also checks

Every screen, every role (from the project's Definition of Done):

1. Smart defaults and autosave — no empty field the data could fill, no Save buttons except a
   deliberate submit/sign.
2. Admin can edit and void/archive everything; nothing is ever hard-deleted.
3. No information repeated on the same screen.
4. **Role visibility, server-side:** customer never sees payout / cost / margin / commission /
   internal notes / assigned crew; tech never sees retail prices or customer financials.
5. Sections with no data do not render at all.
6. Two-step confirm on anything irreversible; archive, not delete.
7. Labels 1–2 words, inline SVG icons, never emoji.
8. Bulk actions on repeated lists; phone / email / address / project id / names are links.

---

## STEP 3 — Task inventory (filled during the walkthrough)

One table per role. Steps are counted **from the project page**, as the brief asks.

### Admin
| Task | Stage | Steps | Screens | Blockers / dead ends | Shorter path |
|---|---|---|---|---|---|
| _(to fill)_ | | | | | |

**Total steps, Admin, whole project: _(to fill)_**

### Customer
| Task | Stage | Steps | Screens | Blockers / dead ends | Shorter path |
|---|---|---|---|---|---|
| _(to fill)_ | | | | | |

**Total steps, Customer, whole project: _(to fill)_**

### Technician
| Task | Stage | Steps | Screens | Blockers / dead ends | Shorter path |
|---|---|---|---|---|---|
| _(to fill)_ | | | | | |

**Total steps, Technician, whole project: _(to fill)_**

---

## STEP 4 — Notifications

| # | Stage / trigger | Role | Channel | Arrived? | Link opened the right screen? | Wording / branding | Verdict |
|---|---|---|---|---|---|---|---|
| _(to fill)_ | | | | | | | |

**Totals per role: _(to fill)_** · **Missing: _(to fill)_** · **Duplicates / noise: _(to fill)_**

> Known before we start: transactional email goes through Resend (`lib/email.js`) and is a **no-op
> without `RESEND_API_KEY`**. If that key is unset on production, STEP 4 records "not sent" for every
> email and the audit measures nothing. **Check this first** — it decides whether STEP 4 is possible.

---

## STEP 5 — Time per stage

| Role | Stage | Task | Start | End | Active time | Wait before next stage |
|---|---|---|---|---|---|---|
| _(to fill)_ | | | | | | |

---

## STEP 1 — the test project (done)

**`ASC73671` — "TEST — Audit Customer"**, created on production 2026-11-24 15:59 UTC.
Contact `aelzoghabi@gmail.com` · (201) 555-0100 (a reserved fiction number, so no stranger is ever
texted) · 2503 Jay Pl, Union, NJ 07083 · Security Cameras / CCTV · Commercial · built from scratch,
not cloned. One project, no duplicate.

### Findings from the intake alone — five, before a single stage was walked

| # | Finding | Severity | Where |
|---|---|---|---|
| F1 | **"Start From" has no *Blank* option.** It offers only "Import Proposal" and "Previous Project", and defaults to `import`. Building from scratch — the ordinary case — is the unnamed state you reach by ignoring the control, while the UI says it will import and shows "PDF or image of an existing proposal · up to 10 MB" underneath. The code comment admits it: `useState("import")  // nothing chosen = start blank`. | **High** — the default misdescribes what will happen | `admin-shell.jsx:247,530-549` |
| F2 | **The contact name is not required on the default path.** `required={startFrom !== "import"}` — so with the default selected, a project can be created with no contact name at all. | **Medium** | `admin-shell.jsx:452` |
| F3 | **The contact field has no label and no placeholder.** Every other field in the modal has one. | Low (accessibility) | `admin-shell.jsx:452` |
| F4 | **Create Project succeeded but the modal stayed open and never navigated.** The project was created; the admin is given no sign of it. Pressing the button again is the obvious next move, and would make a duplicate. | **High** — invites duplicate records | New Project modal |
| F5 | **The next action at stage 1 is wrong.** On the new project the hero reads **"Create Proposal"**, while the dashboard card for the same job says *"Schedule the survey today"* and the `inquiry` gate is *"Survey appointment scheduled"*. Three sources, three different next actions, at the very first stage. | **High** — contradicts `STAGE_FLOW` | hero vs `stage-flow.js` |

F5 is the one to chase first: it is exactly the "one clear next action per stage" rule, broken at
stage 1, and it points at the hero CTA map rather than at the gate.

## STEP 8 — the financial sweep

**The headline: the server was never leaking payments to a technician.** The suspicion came from the
UI, where the "Awaiting Final Payment" hero and its Record button rendered for every role. That was
real and is fixed (`86eed71d`). Underneath, every money gate already excluded `tech`.

What *was* wrong: recording money was open to a **manager** as well as an admin, the UI offered a
button to roles the server would refuse, and a role that may not see the money saw **no status at
all** — so a technician could not tell a job was waiting on payment rather than on them.

| Action | Who could, before | Who should | Fixed? |
|---|---|---|---|
| Record a payment | admin, manager · customer (submits, pending) | **admin** · customer submits | **Yes** — `PAY_ADMIN` |
| Confirm a payment | admin, manager | **admin** | **Yes** |
| Remove a payment | admin, manager · customer (own pending only) | **admin** · customer cancels own pending | **Yes** |
| Online pay (`/api/pay/create`) | admin, manager, owning customer — **403** otherwise | same | Already correct |
| Invoices: send / schedule / cancel | admin, manager (`INV_STAFF`) | admin, manager | Already correct |
| Proposal pricing, discounts, tax, deposit % | admin, manager, sales (`STAFF_EDIT`) | admin, manager, sales | Already correct |
| Commission set | admin, manager | admin, manager | Already correct |
| Commission / cost visibility | `cost.view` = admin, manager | same | Already correct |
| Customer financial figures | `customer.financials.view` — **tech and vendor excluded** | same | Already correct |
| Work order payout | tech sees their own; customer never | same | Already correct |

**No refunds action exists** — there is no refund path in the codebase to leak.

### The one thing I did NOT do, and why

The brief asks that the technician's read-only card show **the amount remaining**. I shipped the
status without any figure, deliberately:

> `page.jsx` gates the *computation* of the money, not just its display — a tech is never sent the
> numbers at all, with a comment citing Definition of Done rule 4 ("tech never sees customer
> financials"). Showing a tech the balance means removing that protection and putting the figures in
> a technician's payload.

A technician now sees **"Awaiting Final Payment"** with no button and no number, which covers the
operational need (do not chase this job, it is waiting on money). If the amount is genuinely wanted,
it is a deliberate widening of rule 4 and a one-line change to the capability gate — **say so and I
will make it**, but I would not do it silently.

### Still owed on STEP 8

The live 403 proof as a technician needs a tech session, and a tech login is a password — which
stops with the owner by standing rule. The enforcement and its tests are in; the live call is a
hand-off. `/api/pay/create` is the right endpoint to prove it with, since it is REST and already
answers a real 403.

## F6 and F7 — logged, not built (Medium)

| # | Finding | Size | Type |
|---|---|---|---|
| F6 | **Placement never asks what a camera is or where.** Every camera lands as "Camera N" with an empty location, and **camera type (dome / bullet / turret / PTZ) does not exist as a data field at all**. STEP 6 asks whether a tech can see type, location and notes per camera — with no type field, the answer is no. Proposal: ask for type and location at placement, type stored as a real field on the device. | **Medium** | UX + data |
| F7 | **"No room" has no value, so the PDF prints "Unassigned".** Locations come from room/zone assignment; an outdoor satellite survey has no rooms, so `locName` stays empty for every camera. This is the same root cause as the PDF legend complaint. Proposal: default an unroomed device to **"Outdoor"**, saved in the data, so the PDF, the customer layout and the tech list all agree. | **Medium** | Bug (data) |

F6 and F7 are one change in two places: a device needs a *type* and always has a *location*.

## Open questions before STEP 1

1. **The brief is truncated** — STEP 5 ends mid-sentence ("wait time between stages (how long the
   job…"), and it is not clear whether a STEP 6 exists.
2. **This writes to production.** A real customer row, a real project, and real emails to
   `aelzoghabi@gmail.com`. That address is the owner's own, so no customer is contacted — confirmed
   needed before STEP 1 runs.
3. **Signing and payment.** The customer signature step needs a PIN or login, and any payment is a
   real payment. Both hand off to the owner, per the standing rule.
4. **Technician identity.** Walking the tech role needs a technician account to assign. Use an
   existing test tech, or create one?

---

# TECH ROLE OVERHAUL — what was built, and what it cost

Owner's instruction, in full: *"A tech can do exactly these, nothing else"* — view the work order, do
it, QC, add expenses, add the QR code, VIEW the site survey (plan, placements, cable routes, angles),
view their own job budget, download the work order PDF. *"Everything else is hidden in the UI AND
refused on the server … a server-side allow-list for the tech role (deny by default), not per-button
hiding."*

## 1. The allow-list as implemented

The fence is at the **choke points**, not on each action. Every server action on the project page
resolves its caller through one of three helpers, and each now takes the name of the action asking:

| File | Choke point | Actions behind it |
|---|---|---|
| `app/project/[accessId]/actions.js` | `getSessionTok(actionKey)` / `getAnyTok(actionKey)` | 55 |
| `app/project/[accessId]/proposal-actions.js` | `getSessionRole(actionKey)` | 74 |
| `app/project/[accessId]/work-order-actions.js` | `gate(accessId, cap, actionKey)` | 25 |

`lib/tech-scope.js` `fenceTok()` turns a technician's token into the role **`"denied"`** for any
action that is not on the list — **including every action that passes no name at all**. So the ~130
actions nobody deliberately opened are closed, and one added next year is closed until someone lists
it on purpose. The failure mode of forgetting is a refusal, not a leak.

**Why `"denied"` and not `null`.** Several actions fall back to `tok?.role || "customer"` when there
is no token, and a customer MAY see the customer's money — so returning `null` to a blocked tech would
have handed them the payment ledger through the back door. `"denied"` is in no capability list and no
role array, so every check it meets fails closed.

Four actions in `actions.js` resolved their own session inline and never met the fence
(`updateProjectInfoAction`, `setProjectServiceAction`, `addAssignmentAction`,
`removeAssignmentAction`). Their own role checks already excluded techs, but a fence with four holes
is not a fence — they now go through `getSessionTok()`.

### The 23 actions a technician may call

| Action | What it is |
|---|---|
| `getWorkOrderAction`, `getWorkOrderEventsAction` | read the work order + its history |
| `signWorkOrderAction`, `acceptWorkOrderAction` | accept the work order = accept the assignment |
| `checkInAction`, `endDayAction` | "I'm on site" / close the day |
| `setLineStatusAction`, `addLinePhotoAction`, `removeLinePhotoAction`, `syncFieldQueueAction` | do the work |
| `listInstallIssuesAction`, `reportInstallIssueAction`, `listInstallPhotosAction` | flag problems, photos |
| `techAdvanceStageAction` | their own forward step |
| `acceptStageAction` | the QC sign-off |
| `submitExpenseAction` | add an expense |
| `setSystemQrAction` | add the activation QR |
| `getProposalAction` | the **frozen work-order** proposal — `techPrice` only |
| `getToolDataAction`, `saveToolDataAction` | tool blobs; **which** tool is decided by `roles.js` |
| `proposalLayoutMetaAction`, `getAcceptancesAction`, `getEventsAction`, `getRatesAction` | the reads the field screens need |

### Refused — the ones worth naming

`recordPaymentAction` · `deletePaymentAction` · `confirmPaymentAction` · `sendInvoiceAction` ·
`saveProposalDraftAction` · `sendProposalAction` · `reviseProposalAction` · `saveTechPricingAction` ·
`getPaymentsForLogAction` · `getCustomerFinanceAction` · `getApprovalDataAction` ·
`createWorkOrderAction` · `createWorkOrderDocAction` · `finalizeWorkOrderAction` ·
`submitWorkOrderAction` · `updateProjectInfoAction` · `addAssignmentAction` ·
`removeAssignmentAction` · `setStage` · `setCommissionAction` · `setPayoutAction` ·
`payExpenseAction` · `declineExpenseAction` · `closeProjectAction` · `setInternalJobAction` ·
`getNotesAction` · `addNoteAction` · `submitToolAction` — and everything else not listed above.

### Capabilities removed from `tech` in `lib/roles.js`

| Capability | Effect |
|---|---|
| `survey.edit` / `survey.unlock` / `survey.submit` | the survey is read-only for the field. **Both** write paths derive their survey editors from `can(role,"survey.edit")`, so one change closes `saveToolDataAction` and `POST /api/tool-data` at once |
| `project.contact.edit` | no customer edits. They still **read** the contact (`customer.contact.view`) and may save it to their phone |
| `addendum.build` | logging extra work as a change order is office work now |

**Two of these were real field workflows, and this is the cost of "exactly these, nothing else":**

1. **`addendum.build`** — a tech finding extra work on site could log it (unpriced) for the office to
   price. They now cannot. If a tech on a roof finds two more drops are needed, they phone it in.
2. **`submitRequestAction`** — a tech asking the office for materials or help. Not on the list, so it
   is refused and its UI hidden.

Both are one entry in two lists to restore. Say the word and either goes back.

## 2. Still owed

- **The live 403 as a real technician.** The enforcement and the tests are in; proving it against a
  production tech session needs a tech password, which stops with the owner.
- **An admin control for `users.pay_type`.** The column exists and defaults to `per_job` (so nobody
  loses a payout figure they see today). Setting someone to hourly or salary currently needs a DB write.

---

# CUSTOMER VIEW AUDIT — report only, nothing changed

Every control and status a customer sees, by stage. Sources: `lib/customer-portal.js`
(`viewAvailability` / `portalCards`), `CARD_COPY` in `customer-portal.jsx`, `CUSTOMER_STATUS` in
`lib/project-status.js`, and `customerNextAction` in `gateway-client.jsx`.

## The hero: one status, one action

| State | Customer sees | CTA? | Should they? |
|---|---|---|---|
| INTAKE | "Getting Started" | no | yes |
| BUILD_SURVEY | "Site Survey" | no | yes |
| AWAITING_SURVEY_APPROVAL | "Approve Site Survey" | **yes** → survey | yes |
| CREATE_PROPOSAL / SEND_PROPOSAL | "Awaiting Proposal" | no | yes |
| AWAITING_SIGNATURE | "Review & Sign Proposal" | **yes** → proposal | yes |
| CHANGES_REQUESTED | "Awaiting Proposal" | no | yes — their request is with the office. See Q3 |
| AWAITING_DEPOSIT | "Pay Deposit" | **yes** → payment | yes |
| READY_TO_SCHEDULE | "Awaiting Installation" | no | **see Q1** |
| INSTALL_SCHEDULED | "Installation Scheduled" | no | yes |
| INSTALL_IN_PROGRESS | "Installation In Progress" | no | yes |
| AWAITING_FINAL_PAYMENT | "Final Payment Due" | **yes** → payment | yes |
| COMPLETE | "Complete" | no | yes |
| CLOSED_NOT_COMPLETED | "Closed" | no | yes |

## The cards — each renders only when it applies

| Card | Appears when | Button | What it does | Should they? |
|---|---|---|---|---|
| Site Survey | survey has data | **View** | read-only plan, placements, their walkthrough | yes |
| System Preview | mockup has data | **View** | camera photo preview (folded into Survey) | yes |
| Proposal | a published proposal exists | **Review** → **Sign** | opens the stored PDF; signs it | yes |
| Phone Setup | signed and pre-install | **Start** | links to the mobile-setup guide | yes |
| Installation | an appointment exists or install started | **View** | date, time, location — never crew or notes | yes |
| Change Order | an add-on is priced and awaiting, or one was signed | **Review** | approve or decline the add-on | yes |
| Sign Off | every work-order line is complete | **Sign** | signs that the work is done | **see Q2** |
| Completion | closeout ready or complete | **View** | certificate, warranty, activation QR | yes |
| Balance | there is a contract | **Make Payment** | total / paid / remaining, Zelle + Square | yes |

**Closeout has no card on purpose** — its only customer-facing job moved inside Completion, so the
portal never shows two closing actions.

## What a customer never sees (verified, not assumed)

Cost · margin · commission · the tech payout · the work order itself (scope, lines, crew, daily logs)
· internal notes · the staff directory · appointment `notes` and the invited roster · payment
recorder, processor ids and proof photos · an unsent draft proposal · an unpriced add-on.

## The three questions this raised

1. **READY_TO_SCHEDULE is a dead end for the customer.** They have paid the deposit and the hero says
   "Awaiting Installation" with no action and no date. Dispatch owns the calendar by design, but the
   customer has no way to say "weekday mornings suit me". **Medium** — a "Request a date" note that
   lands on the scheduling tool, not a self-booking calendar.
2. **Sign Off and Completion are two closing signatures.** Sign Off appears the moment the last work
   order line is marked; Completion carries the closeout confirmation. Closeout was deliberately
   merged INTO Completion so there would be one ending — Sign Off reintroduces a second one.
   **Medium** — likely the same merge again.
3. **CHANGES_REQUESTED reads "Awaiting Proposal".** Truthful but flat: a customer who asked for a
   change gets the same words as one who has never seen a proposal. **Small** — "Your changes are
   with us".

Nothing in this section was changed.
