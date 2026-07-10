# Handoff — Smart Project Access prototype (`public/project-link.html`)

_Last updated: 2026-06-22 · IOT Techs / La Vague Inc._

This is the zero-dependency, single-file role-gated project portal prototype. Everything
(CSS + JS) lives inline in `public/project-link.html` as one IIFE. There is **one shared
record `P`**; every role/view is a filtered render of `P`. No server needed for this file.

Preview server id: `576d91a2-7a30-430b-91bc-926792dfe159`. Open `/project-link.html`.

---

## How to drive it (testing API)

`window.ProjectLink` exposes:
- `loginAs(role)` — `'AD'` admin, `'CX'` customer, `'TX'` tech, `'MG'` manager, `'SA'` sales
- `enterPin(code)` — PIN routing (admin `8965`, customer = last-4 of phone)
- `reset()` — back to logged-out
- `get state()` — `{session, pin, viewAs, screen, dashView, record:P}`

Re-render by mutating `P` then `loginAs(...)`. To force a clean reload:
`window.location.href='/project-link.html?cb='+Date.now()`.

---

## Lifecycle model

`STATUSES = {open, inprogress, completed, closed, cancelled}`, each with a `subs[]`.
- `open.subs = ['Inquiry','Services & Survey','Mockup','Proposal','Approval','Deposit']`
- `inprogress.subs = ['Work Order','Schedule','Install','Tech QC','Customer QC']` (verify exact labels in file)
- Current position: `P.status` + `P.sub` (index into that status's subs).
- Helpers: `stMove(dir)`, `setStatus(k)`, `curSub()`, `cxStepIndex()`.

---

## ✅ DONE & VERIFIED — end-to-end customer flow (Open / pre-deposit)

All verified via `window.ProjectLink` evals, **zero console errors**:

1. **Inquiry → availability.** Customer sees "someone will reach out" + a
   share-availability textarea (`#cx-avail` / `#cx-avail-submit`) until an appointment
   exists. Saves to `P.availability`. Once `P.appointment` is set, shows the scheduled time.
2. **Services & Survey.** Admin's `servSurveyCard` shows `P.availability` above the
   scheduler. Appointment date defaults to today, time 10:00 AM.
3. **Mockup.** Admin `#mockup-upload` button → sets `P.mockupUploaded`, pushes a
   `{name:'Coverage Mockup', from:1}` document; customer sees it in Documents.
4. **Proposal gate.** Customer sees "proposal is being prepared" until admin clicks
   `#proposal-submit` (`proposalBody`, ~line 910). That sets `P.proposalSubmitted=true`;
   customer then sees the **dark vault document** (`.vaultdoc`) to review + sign.
   `#proposal-unsubmit` reverts.
5. **Customer signs → auto-advance.** `data-csign` handler: when every service is signed,
   `P.sub` auto-advances to **Approval** and a deposit payment is auto-created:
   `{label:'Deposit to start', amount:Math.round(presentedTotal()/2), date:'', status:'Due', deposit:true}`.
   (Verified: $830 total → $415 deposit.)
6. **Deposit.** Customer `data-pay` (Pay) or admin `[data-paymark]` (Mark paid) → sets
   `status:'Paid'`, `date:todayStr()`, writes to Project Log.

---

## ⏳ NEXT — In Progress / Work Order phase (user's latest spec, NOT yet built)

Verbatim intent from the user:
> "Once it's in progress, we generate the work order for the technicians. We also need to
> be able to **add items** to the technicians' work order, same as the proposal. When we
> **schedule** it, that's where we **assign the technician**. Once the proposal is created,
> that's when it creates a work order for technicians — technician's able to log in and see
> it. **Before that, it should say the project is being put together.**"

### Tasks

**1. Work order is generated when the project enters In Progress.**
- `buildWO(s)` (line 359) already transfers the signed proposal option's `lineItems` →
  `s.wo.equipment` (equipment) + `s.wo.tasks` (labor, with `pay:techRate(desc)`).
- `woBody` (line 1000) auto-calls `buildWO(s)` the first time (`if(!s.wo.tasks) buildWO(s)`).
- ✔ Mostly there. Confirm the WO is materialized at the moment the proposal is signed /
  status flips to `inprogress` so the tech can see it immediately.

**2. Add items to the work order (like the proposal builder).** ← main new work
- `woBody` currently lets you edit tech pay (`data-wotask`) and re-pull from proposal
  (`data-worebuild`), but you **cannot add or delete** equipment / labor lines.
- Add, per service in `woBody` (only when `ctrl` = admin):
  - **+ Add equipment** — a picker from `pbFor(s.key).equipment` → push `{desc, qty:1}` to `s.wo.equipment`.
  - **+ Add tech line item** — a picker from `TECH_PAYBOOK` keys (line 356) → push
    `{desc, qty:1, pay:techRate(desc)}` to `s.wo.tasks`.
  - **Delete (✕)** on each equipment row and each task row.
- Mirror the proposal builder's add/remove line-item pattern (`liGroup` pickers). Wire the
  new `data-*` handlers in the post-`if(ro) return` mutation block (~line 1340, next to the
  existing `data-wotask` / `techpb` wiring).

**3. Assign technician at the Schedule sub.**
- At `inprogress` sub **'Schedule'**, surface an assign + schedule control:
  - Technician dropdown per service → set `s.wo.tech` (options from `DEMO_TECHS`, line 578; add an 'Unassigned' default).
  - Install date/time → `s.wo.schedule`.
- `s.wo.tech` / `s.wo.qc` already render in the WO block head (line 1007), so the data
  fields exist — just add the inputs and wiring.

**4. Tech view: "project is being put together" before the WO phase.** ← quick
- `viewTech()` (line 1145) currently shows "No active job yet" (line 1150) when
  `P.status==='open'`.
- Change the copy to: **"Your project is being put together — your work order will appear
  here once it's approved and scheduled."** Keep the guard so the tech only sees the work
  order once `P.status==='inprogress'`.

---

## Key code anchors (`public/project-link.html`)

| What | Line(s) |
|---|---|
| `P` record (incl. `availability`, `mockupUploaded`, `proposalSubmitted`) | 338 |
| `TECH_PAYBOOK` + `techRate()` | 356–357 |
| `buildWO(s)` / `woTechTotal` / `projectTechPay` / `payWeek` (Fri→Thu) | 359–365 |
| `DEMO_TECHS` | 578 |
| `proposalBody` submit/unsubmit button | 910 |
| `adminStageTools(ctrl)` | 962 |
| `woBody(ctrl)` — Work Order builder | 1000 |
| tech pay-book portal (`techpb-*`) | 1025–1029 |
| `viewTech()` / "No active job yet" | 1145 / 1150 |
| `if(!P.proposalSubmitted)` customer gate | 1200 |
| mutation wiring (`data-wotask`, `techpb`, `proposal-submit`) | 1340–1362 |

### Wiring rule (important)
`render()` rebuilds `#app.innerHTML`, then wires events. **UI-only toggles** are wired
*before* `if(ro) return` (ro = read-only "View As" preview). **Mutations** (anything that
writes `P`) are wired *after* it, so View-As stays read-only. Put new WO add/delete/assign
handlers in the post-`if(ro) return` block.

---

## Standing constraints (DO NOT VIOLATE)
- **Never** write real customers (16 Feteer Lounge, 41 Tbd Bodega/Deli, 70 Feteer
  Lounge–Astoria) in tests. Only `ZZ`-prefixed test data. Prior data-loss incident →
  non-destructive only.
- Google API key only in git-ignored `config.json`.
- Test address: **"2503 Jay Pl, Union NJ"**.
- Admin username `aelzoghabi` (aelzoghabi@gmail.com). Admin PIN `8965`, customer PIN =
  last-4 of phone. Today is 2026-06-22.

## Deferred (acknowledged, not started)
- Full `toast.html` "sheet" restyle of the proposal builder w/ progress bar.
- Native A/B/C + multi-service tabs in the real `index.html` calculator.
- Persist prototype edits (price-book, tech pay, payments) to real server endpoints.
- Multi-project-per-customer server plan (see `~/.claude/plans/peaceful-squishing-otter.md`)
  — that's the **real app** (`server.js` + `project.html`), separate from this prototype.
