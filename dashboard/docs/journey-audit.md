# IOT TECHS — Customer + Admin Journey Audit

**Scope:** flow and friction only (not money/pricing). Read-only — no code was changed.
**Date:** 2026-11-05 · **Build:** commit `2711fb5` · **Env:** localhost:3100 (isolated browser, no personal login).
**Fixtures:** the 8 `[JOURNEY-TEST]` projects (ASC0122–0129), one per lifecycle stage, plus the live public site.
**Screenshots:** `docs/journey-shots/` (filenames referenced per step; page-text dumps in `docs/journey-shots/_text/`).

> The canonical lifecycle is 9 server-side stages (`lib/stage-flow.js` `MASTER_ORDER`): inquiry → site_survey → proposal → approval_deposit → schedule → install → qc → payment → completion. The 11 journey steps below map onto those stages; I added the steps the app actually has that the brief didn't name (addendums, service calls).

## Assumptions (made autonomously, per the brief)

1. **Headed Playwright could not spawn in this sandbox** (`spawn UNKNOWN`, both bash and PowerShell). I used **headless Playwright** for clean deliverable screenshots + the app's **isolated in-app browser** for live inspection. Both satisfy the hard safety rules: fresh/clean context, localhost only, never the owner's Chrome or personal login. The "watch it live" part is the only thing lost.
2. **I did not fabricate signatures, deposits, or payments** (those are the locked signature/money paths — RED-lane; faking them risks data integrity). Later-stage screens were walked using the seeded projects (already positioned at each stage) and the customer view via `?preview=customer`. So "customer signs / pays" is described from the real UI + code, not a live mutation.
3. **I did not submit a brand-new `/build` inquiry as "Jamie Tester."** Submitting the public form would create an **untagged** real lead that the cleanup script wouldn't catch. Instead I captured the real `/build` intake UI and used the tagged inquiry-stage seed (ASC0122 "Riverside Diner") for the admin-receives-it step. Net flow is identical.
4. **`BUGS.md` lives in `docs/`** (`docs/BUGS.md`) — the project rule forbids new files at repo root.
5. Email is force-disabled locally (`EMAIL_DISABLED=1`, no Resend key), so "what the customer receives" is described from `lib/email.js` templates, not a delivered message.

---

## Step 1 — Land on the site, find how to get in touch

| | Customer | Admin |
|---|---|---|
| **Screen** | `/` home (`01-customer-home.png`) | — (marketing) |
| **Today** | Hero + **5 competing CTAs**: "Build Your System", "Request a Demo", "Get Started →", "Learn More", plus a **"Quick Start"** overlay (New Customer / Existing / Just Inquiring / Need a Repair). Phone `646-396-0775` in header + footer. | — |
| **Fields typed** | 0 | — |

**Friction**
- **Choice overload.** Five primary-looking CTAs that don't clearly differ ("Build Your System" vs "Request a Demo" vs "Get Started"). A first-time visitor has to guess.
- **Trust dent:** the stats band reads **"0+ Locations served / 0+ Cameras installed / 0+ yrs in business"** — placeholder zeros that read as broken/unfinished. *(See BUGS.md.)*
- Quick Start overlay is the clearest disambiguator but competes with the hero CTAs instead of being *the* front door.

**Ideal (fewest clicks)**
- One dominant CTA — **"Get my free quote →"** → `/build`; one quiet secondary — **"Call 646-396-0775"**. Everything else demoted.
- Fill the stats with real numbers or hide the band until they exist.
- Promote Quick Start's 4 intents as the single router for anyone who isn't ready to quote.

**Automate / Maya:** a homepage assistant ("Ask Maya") that answers "do you cover my area / what does it cost" and captures a lead inline — removes the "find how to get in touch" step entirely.

---

## Step 2 — Submit an inquiry

| | Customer | Admin |
|---|---|---|
| **Screen** | `/build` — 5-step wizard (`02-customer-quote-build.png`) | — |
| **Today** | **Step 1 Intake** (7 fields: first, last, phone, email, company, address+autocomplete, apt) → **Step 2 Features** (11 toggles) → **Step 3 Project** (4 optional flags) → **Step 4 System** (cameras / recorder / retention / monitor) → **Step 5 Quote** (3 packages + compare table). Submitting creates a lead project (`POST /api/leads/cctv` → `db.createLeadProject`). | — |
| **Clicks** | ~15–25 (contact + ≥1 per step + package pick + submit) | — |

**Friction**
- **Contact info is demanded first, before any value is shown.** The instant quote (the reason to engage) is at step 5. Classic drop-off point.
- **5 steps** for a lead; Steps 2–4 ask the customer to make technical choices (channel count, TB, retention days) most don't understand.
- Address autocomplete is present (good). Required fields are reasonable but front-loaded.
- Only the **CCTV** vertical is a true self-serve builder; Audio/POS/Access leads funnel differently (homepage → contact), so the "one front door" is really CCTV-only.

**Ideal**
- **Value first, contact last:** let them pick a rough system and *see* a ballpark in 2 taps, then capture **phone-or-email only** to "send me this." Defaults everywhere (Essential package, 8 cams, 30 days) so a customer can reach a number with near-zero input.
- Collapse Steps 2–4 into smart defaults + an "advanced" reveal.

**Automate / Maya:** conversational intake ("tell me about your space") that fills the wizard behind the scenes; address → auto-detect commercial/residential.

---

## Step 3 — Admin receives it & creates the project

| | Customer | Admin |
|---|---|---|
| **Screen** | confirmation / "we'll be in touch" | `/projects` (Inquiries tab), `/dashboard` Needs Attention, `/notifications`, global **New** modal |
| **Today** | — | Lead **auto-creates a project at `inquiry`** (no manual data entry — good). It appears in Projects ▸ Inquiries and the dashboard counters. Office is notified by email (`sendOfficeEmail`) + the notifications feed. Manual path: **New** → New-Project modal (Existing/New client w/ CRM dup-check, service, property, Start From). |
| **Clicks to act on a lead** | — | Open Projects → find lead → open → decide next action → (schedule survey lives elsewhere): ~4–6 before anything happens. |

**Friction**
- **The notification feed is noise.** `/notifications` (80 items) is dominated by **"X signed in"** and **"Master admin PIN → …"** events; a genuine new lead doesn't stand out. *(See BUGS.md.)*
- **"Needs Attention: 53"** on the dashboard is an undifferentiated pile, and the top items are **104–132 days old** (stale service tickets that never age out). The one number blends new leads, old tickets, and signatures-pending.
- **No dedicated new-lead triage.** Nothing says "here are today's new leads, claim one." You go to Projects and eyeball the Inquiry badges.
- Auto-create from the quote is the strongest part of this step — keep it.

**Ideal**
- A **New Leads lane** (count + list) separate from tickets/signatures, with a one-tap **"Schedule survey"** / **"Call"** right on the lead card.
- **Suppress sign-in / PIN events** from the ops feed (or route to an audit-only tab).
- Age-out / snooze stale "Needs Attention" items so the number means "today."

**Automate / Maya:** auto-acknowledge the lead to the customer, draft the first reply, propose 2–3 survey slots, and tee up the survey appointment for one-tap send.

---

## Step 4 — Site survey (schedule, capture, floor plan, device placement)

| | Customer | Admin / Tech |
|---|---|---|
| **Screen** | survey appointment email + `.ics`; later "Your System Layout" (read-only) | `?view=survey` Site Survey tool (`04b-admin-survey.png`) |
| **Today** | Customer gets the appointment, confirms via RSVP. After the survey they can view the layout read-only and leave a comment. | Schedule the survey (header/contact bar **openSchedule**), then the Site Survey tool: **Background → Layout → Placement → Camera Angles → Approval**, with photos, floor-plan draw, device placement. Submit for customer approval. |
| **Clicks** | 1 (confirm) | Schedule (several) + multi-step capture + submit |

**Friction**
- **Scheduling isn't a visible card** on the project — it's tucked into a header/contact-bar action. On an inquiry-stage project the dominant CTA is "Create Proposal," not "Schedule the survey" (wrong next step surfaced first).
- The survey tool is powerful but **multi-step**; the submit→approval loop had rough edges (recently improved this session: single bottom bar, ungated submit, "Approval" step).
- Mockup / Camera Angles are optional and their necessity isn't obvious.

**Ideal**
- On an inquiry, the **single next action is "Schedule survey"** (auto-seed the date from the inquiry deadline if given). Survey tool opens straight to Background.
- One tap sends the customer "confirm your survey" with slots.

**Automate / Maya:** auto-offer survey slots from tech availability; after capture, Maya drafts the survey summary + proposed device list.

---

## Step 5 — Admin builds the proposal

| | Customer | Admin |
|---|---|---|
| **Screen** | — | Proposal builder (`05-admin-proposal-draft.png`) |
| **Today** | — | Line items (survey cameras **auto-expand** into drops + labor), add services, options, conditions/waivers, discount/PCP, payment plan. **Start From:** Blank / Previous (clone) / Import (PDF→AI). Generates the PDF. |
| **Clicks** | — | Many (builder is dense), but survey-import removes most data entry |

**Friction**
- The builder is **feature-rich = dense**; for a simple 6-camera job there's still a lot on screen. (The add-bar was streamlined recently.)
- Draft-vs-sent and option handling are powerful but add cognitive load.
- From the project home, "Create Proposal" shows **even at the inquiry stage** (before a survey exists), inviting out-of-order work.

**Ideal**
- **"Draft proposal from survey"** as the default one-click: prefilled items, NVR sized to camera count, one option. (Much of this exists — surface it as the primary path.)
- Hide "Create Proposal" until a survey (or an explicit skip) exists.

**Automate / Maya:** "Draft the proposal" from the survey + one sentence of intent → a ready-to-review draft.

---

## Step 6 — Send the proposal

| | Customer | Admin |
|---|---|---|
| **Screen** | email → portal "Your proposal is ready" (`07-customer-proposal-view.png`) | Send / Request Signature actions |
| **Today** | Customer receives an email (`emailProposalReady` or `emailSignatureRequest`) linking to the portal. | Staff **mark sent** (`markProposalSent`) and **separately** choose to email "proposal ready" and/or "request signature." |
| **Clicks** | 1 (open link) | 2–3 (send, then choose which email) |

**Friction**
- **Two separate emails** (ready vs signature request) that staff must choose between — easy to send the wrong one or both.
- Sending and requesting signature are decoupled, so "send it and ask them to sign" is 2+ actions.

**Ideal**
- One **"Send for signature"** that marks sent, emails once, and the email's link drops the customer **straight into the signer** (the `?open=proposal&sign=1` deep-link already exists).

**Automate / Maya:** auto-send on draft approval; schedule 48h/5-day signature reminders automatically.

---

## Step 7 — Customer views and signs

| | Customer | Admin |
|---|---|---|
| **Screen** | portal gate (`07c-customer-portal-gate.png`) → "Review & Sign" → PDF signer | watches status flip to Signed |
| **Today** | Gate: **PIN** / Face ID / "Log in instead." Then "Your proposal is ready · Price valid 7 days" → **Review → ** → pdf.js viewer with signature overlays; signs the **actual stored PDF** (`lib/esign`). | Activity logs "Customer viewed / signed"; admins emailed on signature (`emailContractSigned`). |
| **Clicks** | PIN (several taps) → Review → sign → confirm | 0 |

**Friction**
- **PIN gate on every cold visit** (mitigated by 90-day sessions, Face ID, Google). For a one-time signer, a PIN is a speed bump.
- Otherwise the PDF-first signer is a strong, trustworthy flow.

**Ideal**
- The email **magic-link** carries a one-time grant so the customer lands in the signer with **no PIN** (PIN only for later self-serve returns).

**Automate / Maya:** in-portal Q&A ("what does line 3 mean?"), and auto-reminders until signed.

---

## Step 8 — Deposit

| | Customer | Admin |
|---|---|---|
| **Screen** | PaymentOptions (Zelle QR + Square link + "I already paid") | Record Payment modal |
| **Today** | After signing, pay the deposit: **Zelle QR**, **Square** hosted link (dormant until keys), or **"I already paid."** | Admin **records/confirms** the payment manually; stage then advances. |
| **Clicks** | 2–4 | 2–3 (open modal, enter, confirm) |

**Friction**
- **Square is dormant** (needs keys), so the real path is Zelle QR → customer clicks "I already paid" → **admin manually confirms.** That's a manual reconciliation loop and a stall point (nothing advances until a human confirms).
- "I already paid" with no proof invites mismatches.

**Ideal**
- **Live card/ACH (activate Square)** so the deposit **auto-confirms** and advances the stage with an auto-receipt — removes the manual confirm entirely.

**Automate / Maya:** deposit nudge; auto-match an incoming payment to the project; auto-receipt.

---

## Step 9 — Schedule install & assign a tech

| | Customer | Admin | Tech |
|---|---|---|---|
| **Screen** | install appointment email + `.ics` | `09-admin-schedule.png` ("Ready to Schedule") | work-order accept |
| **Today** | Confirms install appointment (RSVP → `install_confirmed`). | **Three separate actions**: schedule the install (header/contact bar), **assign a tech** (`addAssignmentAction`), **finalize the work order** (`wo_finalized_at`) so the tech can accept. | Tech **accepts** the work order (separate gate). |
| **Clicks** | 1 | 6–10 across 3 surfaces | 1 |

**Friction**
- **Schedule + assign + finalize WO are three disconnected steps** in different places. The project says "Ready to Schedule" but there's **no single obvious control** for it on the page.
- Tech acceptance is yet another gate before the job is truly booked.
- Customer confirm and tech dispatch are separate sends.

**Ideal**
- One **"Schedule & assign"** flow: pick slot + tech together → auto-finalize the WO → auto-send customer confirm **and** tech dispatch in one action.

**Automate / Maya:** suggest the best tech by availability/skill/location; auto-dispatch + auto-confirm.

---

## Step 10 — Install & closeout (photos, checklist, app setup)

| | Customer | Admin / Manager | Tech |
|---|---|---|---|
| **Screen** | QC walkthrough sign; ANNKE Vision QR at completion | QC sign-off, Closeout | Install checklist, photos, issue flags |
| **Today** | Signs the **QC walkthrough/acceptance**; **ANNKE Vision** app setup via a **QR card** at completion ("Scan in the ANNKE Vision app"), plus a `mobile-setup` guide. | **Manager QC** sign-off; closeout. | `install-checklist.jsx` (steps), `install-photos.jsx` (photos, kind=install), `install-issues.jsx` (NEEDS_REVIEW→REWORK→RESOLVED). |
| **Clicks** | sign + scan | several | checklist + photo uploads |

**Friction**
- **Install → QC(manager) → customer walkthrough sign → completion** is a **multi-gate chain**; each handoff is a separate action and a potential stall.
- **App setup is a QR at the very end** with no proactive, guided Annke onboarding — the customer is on their own to pair devices.
- Reaching the install tools requires switching the project's phase/deck context (not one click from the project home).

**Ideal**
- Tech checklist **auto-advances** the stage as items complete; photos auto-attach to the record.
- Push the **Annke setup guide proactively** (SMS/portal) the moment install completes, not just a QR at the end.

**Automate / Maya:** generate the closeout summary from checklist + photos; walk the customer through Annke pairing step-by-step.

---

## Step 11 — Job closed & review request

| | Customer | Admin |
|---|---|---|
| **Screen** | completion certificate / docs (`11b-customer-completion-view.png`) | `11-admin-completion.png` ("Awaiting Final Payment" → complete) |
| **Today** | After final payment, gets the **completion certificate + warranty** (`completed_at` + `warranty_months`) and the Annke QR. | Mark complete → completion docs generated. |
| **Clicks** | view/download | 1–2 |

**Friction**
- **There is no review-request step.** Nothing in completion or `lib/email.js` asks the happy customer for a Google review — the most valuable, cheapest growth lever is simply **missing**. *(Gap, not a bug — biggest single opportunity.)*
- Completion is gated on **paid-in-full**, which depends on the manual payment-confirm loop from Step 8.

**Ideal**
- On **completion + paid-in-full**, auto-send a **review request** (SMS/email with a one-tap Google review deep-link), with a private "something wrong?" path first for unhappy customers (reputation gate).

**Automate / Maya:** time and send the review ask; triage responses; log testimonials.

---

## Steps the app has that the brief didn't name

- **Addendums** — signable job add-ons mid/post-install (`addendum.*` caps; customer signs). Part of the real flow.
- **Service calls** — post-completion repairs with their own 13-state diagnosis flow (`lib/svc-status.js`); the bulk of today's "Needs Attention" pile is actually old service tickets.
- **PCP / warranty** — discretionary labor credit + warranty window off `completed_at`.

---

## Before / After — clicks per step

| # | Step | Current clicks | Optimized | What changes |
|---|------|:--:|:--:|---|
| 1 | Land & find contact | 1–2 (after choosing among 5 CTAs) | 1 | One primary CTA; Maya/Quick-Start router |
| 2 | Submit inquiry | ~15–25 (contact first, 5 steps) | ~4–6 | Value-first, contact last, smart defaults |
| 3 | Admin receives/acts | 4–6 to first action | 1–2 | New-Leads lane + one-tap "Schedule survey" |
| 4 | Site survey | schedule buried + multi-step | 2–3 | "Schedule survey" is the surfaced next action |
| 5 | Build proposal | many | 1–3 | "Draft from survey" as the default |
| 6 | Send proposal | 2–3 (+ choose email) | 1 | One "Send for signature" (deep-link) |
| 7 | View & sign | PIN + review + sign | review + sign | Magic-link skips the PIN |
| 8 | Deposit | 2–4 + manual admin confirm | 2 (auto-confirm) | Live Square/ACH auto-advances |
| 9 | Schedule + assign tech | 6–10 across 3 surfaces | 2–3 | One "Schedule & assign" |
| 10 | Install & closeout | multi-gate + manual | fewer | Checklist auto-advances; proactive app setup |
| 11 | Close & review | no review step | 1 (auto) | Auto review request on completion |

---

## Top 10 fixes (ranked by friction removed)

| # | Fix | Friction removed | Effort | Status |
|---|-----|------------------|:--:|:--|
| 1 | **Auto review-request on completion** (+paid-in-full), review deep-link, reputation gate | Adds the single highest-ROI missing step; zero manual work | **S** | ✅ Shipped |
| 2 | **`/build`: value-first, contact-last, smart defaults** | Biggest customer drop-off point; cuts ~15–25 → ~5 clicks | **M** | ◻ Not started |
| 3 | **De-noise ops feed + New-Leads lane** (hide sign-in/PIN) | Real leads/tickets stop drowning | **S/M** | ✅ Shipped |
| 4 | **One "Send for signature"** (merge emails + deep-link into signer) | Removes the "which email?" fork; 1-click send | **S** | ✅ Shipped |
| 5 | **Surface the right next action per stage** | Fixes out-of-order work across the whole deck | **S** | ✅ Shipped |
| 6 | **Activate live deposit/payment (Square/ACH)** → auto-confirm + auto-advance | Kills the manual reconciliation stall at Step 8 | **M** (ops/infra) | ◻ Not started |
| 7 | **One "Schedule & assign"** (slot + tech + WO finalize + dual notify) | Collapses 3 surfaces / 6–10 clicks into one | **M/L** | ◻ Not started |
| 8 | **"Draft proposal from survey" as the default** | Removes most proposal data entry | **S/M** | ◻ Not started |
| 9 | **Magic-link signing (skip PIN for first sign)** | Removes the PIN speed-bump at the signature moment | **S/M** | ◻ Not started |
| 10 | **Homepage: one primary CTA + real stats** (remove "0+") | Clear front door; fixes the trust dent | **S** | ✅ Shipped |

> **Biggest wins for least effort:** #1, #4, #5, #10 (all **S**). **Biggest flow unlocks:** #6 and #7.

## Build log — 2026-11-06 (approved batch)

Shipped, one commit each, full suite **1087 pass** after each, browser-verified:

- **3 bugs (`docs/BUGS.md`)** — homepage "0+" stats removed; notification feed de-noised (sign-in/PIN → audit only, 35+ noise lines → 0); bug #3 (premature "Create Proposal") **not reproduced** — inquiry resolves to `BUILD_SURVEY` / "Open Site Survey", no such CTA exists. (`2733238`)
- **Fix #1 — auto review-request** — `emailReviewRequest` fires on completion + paid-in-full; gated (Resend key + `EMAIL_DISABLED`/test), once-only (`review_requested_at`), **never sends for demo/test** (`@journey-test.local` / `source='journey-test'`); external `REVIEW_URL` CTA. (`869fc28`)
- **Fix #4 — one "Send for signature"** — the send now also emails the direct signing link (deep-links into the signer) in one step; the draft button reads "Send for signature"; no separate email prompt. (`22c8d10`)
- **Fix #5 — per-stage next action** — completed the hub CTA map so every state surfaces one correct action (Schedule Install, Open Work Order, Record Deposit/Final Payment were previously blank). (`060fce5`)
- **Fix #10 — homepage one primary CTA** — one gold "Build Your System →" (→ `/systems` picker) + a quiet "Request a Demo"; placeholder stats gone. (`75f580a`)
- **Fix #3 — New Leads lane** — dashboard now surfaces fresh inquiries in their own newest-first lane above Needs Attention (they were previously only findable by scrolling `/projects`). (`b8311d6`)

Demo data kept. Not built (awaiting a future go): #2 `/build` reorder, #6 live payment, #7 schedule+assign, #8 draft-from-survey, #9 magic-link signing.

## Broken / defects
See **`docs/BUGS.md`** — both clear defects are now **✅ fixed**: the homepage **"0+" placeholder stats** (removed) and the **notification sign-in/PIN noise** (feed de-noised). The third claimed bug (premature "Create Proposal") was **not reproduced**.

## Where Maya fits (automation summary)
Lead capture & first reply (Step 1–3) · survey scheduling & summary (4) · proposal drafting (5) · send + reminders (6) · in-portal Q&A (7) · deposit nudges & matching (8) · tech dispatch (9) · closeout summary & app-setup guide (10) · **review request** (11). Maya can own the *nudging and drafting* at every seam; humans approve.
