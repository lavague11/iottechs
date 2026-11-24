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
