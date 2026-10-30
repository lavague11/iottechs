# AI Assistant — Staff Playbook

The in-app AI assistant ("AI Core") turns plain English — typed or spoken — into actions on the system you
already use. It is **not** a second app: it drives the real proposal builder, project lifecycle, notes and
reads, through the same role checks and server actions a human click would. This page is the operator's
guide: what to say, what it will do, and who is allowed to do it.

**Where it is:** the small waveform orb, bottom-left of every staff screen. Tap it (or the mic) and talk, or
type. It stays with you as you move between pages, and remembers the project and customer you're discussing.

---

## How it works (so you can trust it)

- **Two brains, one result.** A zero-token router recognizes the common phrasings instantly and for free;
  anything it can't parse falls through to a small model (Claude Haiku) that returns the *same* structured
  action. You don't need to know which handled your request — the behavior is identical.
- **It never guesses data.** Totals, names, counts, dates, a customer's balance — every fact comes from a
  real read. If it can't retrieve something, it says so or asks a question; it never makes a number up. It
  **never invents a price** — if you don't say one, it uses the price book or leaves it for you.
- **Every change previews, then waits for your "yes."** No write lands silently. You see exactly what will
  happen (what, to whom, the before/after) and confirm. Say "cancel" or "actually, 10%" to adjust first.
- **Everything is logged.** Each applied command is written to the project's Job Log (type `ai`) for audit.
- **It respects your role.** Being allowed to *ask* is not being allowed to *change*; being allowed to send
  a proposal is not being allowed to record a payment. See **Who can do what** below.

---

## Who can do what

| Role | Ask / read | Edit proposals | Send / remind | Money (record / payment reminder) | Stage · assign · issues | Flag a device |
|---|---|---|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Sales** | ✅ | ✅ | ✅ (send proposal · signature reminder) | — | — | — |
| **Technician** | ✅ (incl. *their own* payout) | — | — | — | — | ✅ (raise an install issue) |
| Customer · Vendor · Read-only | — the assistant is staff-only — | | | | | |

Writes are preview-and-confirm regardless of role; the role just decides which confirmations you're offered.
A technician can ask questions and flag a device problem, but can't edit a proposal, record a payment, or
move a stage.

---

## Ask it anything (reads — never changes anything)

Questions retrieve a fact and tell you; they never navigate or edit. Default target is the project you have
open ("this"); name another project to ask about it instead.

| You want | Say something like |
|---|---|
| A proposal's total | "how much is the Crazy Cars proposal" · "what's the total" |
| Project status | "what's going on with Crazy Cars" · "status of the dealership" |
| What to do next / blockers | "what's next" · "what's holding us up" · "whose turn is it" |
| Balance / paid | "what's the balance" · "how much is left" · "paid so far" |
| Your own pay (tech) | "what's my payout" · "my pay on this" |
| Open install issues | "any open issues" · "any flags on this" |
| Time in stage | "how long has this been in this stage" |
| Who hasn't signed | "which proposals aren't signed" · "who hasn't signed" |
| Signature follow-ups due | "who needs a signature nudge" · "who should I chase for signatures" |
| Collections due | "who owes money" · "which deposits are unpaid" |
| Projects by stage | "what needs QC" · "which projects are in install" · "how many need payment" |
| What a camera covers | "what does camera 3 cover" · "where is the entrance camera aimed" |
| Explain a line to a customer | "what's an NVR" · "why do I need the drop" |
| Compare the options | "compare the options" · "what are my options" |
| Explain the terms | "how does the deposit work" · "payment terms" · "what's the PCP credit" |
| Feedback / objections logged | "what's the feedback" · "any open objections" |

---

## Edit a proposal (previews, then you confirm)

Works on the open project's draft proposal. Admin / Manager / Sales.

| Action | Say something like |
|---|---|
| Add line items | "add 4 cameras" · "add 8 cameras at $300" · "add a camera for 300" |
| Change a price | "change the cameras to $275" · "set the pool camera to $250 each" |
| Change a quantity | "make the cameras qty 6" (via the model) |
| Rename a line | "rename camera 3 to Front Door" · "call the DVR Main Recorder" |
| Write a description | "describe the entrance camera" (grounded in the product name only — never invented specs) |
| Move it to another section | "move the pool camera to the sound system" |
| Reorder a section | "move the cameras section to the top" · "put audio last" |
| Apply a discount | "15% discount" · "give them 15% off" |
| Remove a line *(Admin/Manager)* | "drop the entrance camera" · "remove the second DVR" |

If a reference matches more than one line (e.g. "the camera" when there are eight), it hands you the
candidates to pick from rather than guessing.

---

## Do things to the project (confirm first)

These dispatch the real, guarded server action — but only after you confirm, and only when the project is in
a state where it's valid (otherwise you get a plain "can't yet, because…").

| Action | Who | Say something like | Only when |
|---|---|---|---|
| Send the proposal | Admin/Mgr/Sales | "send the proposal to the customer" | there's a draft to send |
| Signature reminder | Admin/Mgr/Sales | "remind them to sign" · "chase the signature" | sent, not yet signed |
| Record a payment received | Admin/Manager | "record a $1,530 deposit" · "log a $500 payment" | a proposal has been sent *(records cash/check/Zelle — never charges a card)* |
| Payment reminder | Admin/Manager | "send a deposit reminder" · "chase the balance" | something is actually due |
| Advance the stage | Admin/Manager | "advance to the next stage" · "move it forward" | the stage gate is clear (else it tells you the blocker) |
| Assign a technician | Admin/Manager | "assign Marcus" · "put tech Dana on this" | the tech exists & is certified (else refused with the reason) |
| Flag a device | Admin/Mgr/**Tech** | "flag camera 3 — wrong location" · "report the lobby camera, failed test" | the device is in the survey |
| Resolve / dismiss an issue | Admin/Manager | "resolve issue 12" · "dismiss the issue" | there's an open issue |
| Propose a line change | Admin/Mgr/Sales | "bump the entrance camera to 2" · "change camera 3 to 4K" | there's a proposal (draft edits in place; a sent one becomes a revision) |
| Log customer feedback | Admin/Mgr/Sales | "log the customer's objection about price" | — |

Nothing here is ever hard-deleted: issues are resolved/dismissed but kept for audit, and proposal removals
go through the versioned draft.

---

## Go places & jot things down

| | Say something like |
|---|---|
| Open another project | "open Crazy Cars" · "pull up the car dealership" · "go to Crazy Cars" |
| Open a section of this project | "take me to the proposal" · "open the site survey" · "go to payment" |
| Leave a note on the project | "note: gate code is 1234" · "log that they want two more cameras" |

Sections it can open: Survey · Mockups · Proposal · Approval & Deposit · Schedule · Install · QC · Payment ·
Completion.

---

## Tips

- **It remembers context.** Once you're talking about a project or customer, "this", "them" and "their
  proposal" refer to it — you don't repeat the name every time.
- **Corrections work.** After a preview, "actually make it 10%" / "no, 6 cameras" updates the pending change
  instead of starting over.
- **Speak naturally.** Politeness and filler are fine — "hey, can you pull up Crazy Cars for me" works the
  same as "open Crazy Cars".
- **Phrasings in the tables above hit the instant router** (free, zero-token). Anything else still works via
  the model — it just takes a beat and a few tokens.

## What it won't do (on purpose)

- Send arbitrary emails/texts, book appointments, or answer open company-policy questions it can't retrieve —
  it says so honestly and points you to the right place rather than guessing.
- Charge a card. "Record a payment" logs money you've *received*; it never runs a charge.
- Act outside your role, skip a confirmation, or move a stage whose gate isn't met.

---

## Turning it on (admin)

The assistant is gated behind two vault keys at **Development ▸ API Keys** (`/dev`):

- `AI_COMMANDS` = `on` — enables the assistant for staff.
- `ANTHROPIC_API_KEY` — powers the free-form fallback (the zero-token router works without it; only
  not-pre-matched phrasings need it). Also used by the ID Scanner, so one key covers both.

Model: `claude-haiku-4-5` (≈0.13¢ per fallback command). Build spec and roadmap: *Project AI spec* and
*proposal-ai-automation* in `/dev/docs`.
