# Blocked — site-survey-fixes

Per rule 10 and 15 of `site-survey-fixes.md`: what could not be completed autonomously, why, and what
was done instead. Everything here needs Ahmed's decision; nothing in this file was changed.

The project's own `CLAUDE.md` defines a **RED lane** — "consult before changing behavior: signatures,
customer acceptance, money calculations, payment ledger, historical-version mutation, destructive
migrations". The autonomous-run instruction does not override that standing rule, so where a section
asks for a RED change, the safe part was built and the money/signature part is recorded here.

---

## B1 — Section I: addendum totals feeding project money (RED, owner decision)

> **DECIDED 2026-11-17 — APPLIED, as a per-add-on opt-in. No existing figure moved.**
>
> The owner's ruling settled it: *"Tax is not on all customers. It's only if we click it."* Both
> options this entry offered were therefore wrong, because both treated tax as a property of the
> system rather than a click. The data agrees — **56 of the 84 proposals carry `tax_rate` 0**, and
> the column is `NOT NULL DEFAULT 0` behind an explicit NJ/NY control.
>
> So an add-on now carries its **own** `taxRate`, absent until someone clicks it, and the proposal's
> rate is never inherited. The reported +$49.69 on ASC0034 **does not happen**: its proposal is taxed
> at NJ 6.625%, its add-on is not, and both are now correct at the same time — which the old
> "inherit the published rate" framing could not express.
>
> Measured after applying, against the live local database: **0 of 3 add-ons** and **0 of 31
> contracted projects** move. ASC0034 stays at $750.00 / balance $3,693.73, confirmed in the running
> app. The seven consumers below are unaffected while no rate is set, and pick the tax up
> automatically when one is.
>
> The load-bearing detail: the tax term enters `addendumFingerprint` **only when non-zero**. Had it
> been added unconditionally, every already-signed add-on would have stopped matching its stored
> `signedFingerprint`, dropped out of `getApprovedAddons`, and silently *subtracted* itself from a
> live balance — the opposite failure to the one this entry was guarding against.
>
> **PCP was deliberately not applied.** The credit is a proposal-level figure already subtracted by
> `optionTotals`; applying it again on an add-on would credit the same money twice.

Section I says *"Signed addendum totals add into the project TOTAL, BALANCE and payment plan … and into
the portal PROJECT BALANCE card."* Addendum totals **already** feed total and balance, via
`getApprovedAddons` (`lib/db.js:7830`). What section I actually changes is *how much* they add, and that
is where it stops being safe.

**1. Addendum tax and PCP would move seven call sites at once.**
`getApprovedAddons` returns `sum(qty × price) − flat discount` — **no tax, no PCP credit**. Section G
asks for "the same discount/PCP/tax rows" as the Proposal, so a taxed addendum total changes every
consumer of that one function simultaneously:

| Consumer | Path |
|---|---|
| `getReceivables` (AR list) | `lib/db.js:2357` |
| `getProjectFinancialState` | `lib/db.js:2424` |
| `finalBalancePaid` | `lib/db.js:2883` |
| `previewProposalForClone` | `lib/db.js:6678` |
| `cloneProposal` | `lib/db.js:6695` |
| Invoice model | `lib/invoice-model.js:32-33` |
| Addendum send/approve actions | `proposal-actions.js:712, 723` |

~~**Decision needed:** does a signed addendum carry tax and PCP (change `getApprovedAddons`, and with it
every figure above, including historical ones), or does it stay untaxed (keep today's behaviour and drop
the tax/PCP rows from the addendum editor)?~~ **Answered above — neither.** The question assumed tax is
a rule the system applies; it is a button someone presses. An add-on carries the tax it was given and
no other, so nothing historical is restated and the editor keeps its rows.

**2. Three deposit definitions already disagree.** Section I's "add to the payment plan" needs one of
them to win:

| Definition | Path | Deposit base |
|---|---|---|
| `amountDueForPayment` | `lib/db.js:7132` | total **including** addons |
| `resolveProjectFinancialState` | `lib/receivables-model.js:146` | total **including** addons |
| `projectFinancials` | `lib/proposal.js:1071` | **base only** — the comment says deposit is anchored to base |

The third is used by `completion-panel.jsx:61` and nothing else. **Decision needed:** should a signed
addendum increase the *deposit* owed, or only the final payment? The spec hints at the latter ("extra
amount added to the final payment, or its own payment line") but does not settle it.

**3. The customer payment schedule and the PDF currently exclude addenda.**
`planScheduleRows` (`lib/proposal.js:551`) is called with the base `t.grand` from
`proposal-customer-view.jsx:435` and `proposal-pdf.js:738`, but with `fin.current` (addons included)
from `proposal-builder.jsx:683`. So **staff and customer already see different schedules today.**
Section I requires them to agree. Making them agree changes what a customer is shown they owe and when
— a contractual document. **Decision needed:** confirm the customer schedule should start including
signed addenda.

**Built instead:** nothing in the resolvers was touched. Section I's non-money half (footer button
order, `+ Addendum` gated on a signed version, the addendum editor opening inside the Proposal view,
A1/A2 documents listed under SENT VERSIONS, the portal card showing "Completed ✓ · 1 addendum") was
implementable without them and **shipped in `c109f9b4`**. Nothing there touches a money resolver.

---

## B2 — Section I: addendum e-sign needs a schema migration (RED, owner decision)

> **PARTLY DONE 2026-11-16 — option 2 (parallel store), additive and reversible.** `sign_documents`
> was not dropped, truncated or rewritten; it is byte-identical. `lib/addendum-schema.js` adds
> `addendum_sign_documents` and `addendum_sign_sessions` with the same immutability trigger and CHECK
> constraint, alongside the proposal tables rather than instead of them.
> `scripts/migrate-addendum-store.mjs` is dry-run by default and `--down` is the exact inverse, proven
> on a copy. **Still yours:** wiring `completeSession` onto the new store, which is real work on the
> signature path, not a migration.

Section I says each addendum gets "its own send, signature and version history" and to "reuse the
proposal signing page". The signing **backend** cannot take a second document type as it stands:

- `sign_documents.kind` has `CHECK (kind IN ('unsigned','signed','certificate'))`
  (`lib/esign/schema.js:20`), and the table carries an immutability trigger — a new kind means a table
  rebuild, not an `ALTER`.
- `sign_sessions.proposal_id` is `INTEGER NOT NULL` (`schema.js:~35`), so a session cannot bind to an
  addendum.
- `setProposalSignPointers` (`lib/esign/store.js:47`) writes one set of pointer columns **per proposal
  row**; an addendum needs its own.
- `completeSession` (`lib/esign/complete.js:20`) calls `selectProposalOption` and `signProposal`
  directly — it is hard-wired to the proposal row.

Rebuilding `sign_documents` is a destructive migration on the table that holds **signed contractual
PDFs**, which is RED twice over. **Decision needed:** extend the esign schema to a second document
kind, or give addenda a parallel store?

**Built instead:** the existing addendum signature path already works and is kept — typed name + drawn
image bound to `addendumFingerprint` (`lib/proposal.js:1028`), with `signAddendumAction`
(`proposal-actions.js:530`) and `POST /api/addendum`. So an addendum can still be sent and signed; what
it does not get is the PDF-first flow the proposal uses. The signing **UI shell** is reused as the spec
asks; the backend is not forked.

---

## B3 — Section I: addendum storage has no row-per-version (owner decision)

> **PARTLY DONE 2026-11-16 — the table exists and is populated, nothing reads it yet.** `addendums`
> (one row per addendum, `seq` 1-based) and `addendum_versions` (row-per-version) were created
> additively and the 3 existing addenda copied forward. The JSON blob is untouched and remains the
> live source of truth. **Still yours:** which of the two becomes authoritative.

There is no addendum table. Addenda live as an `addendums[]` array inside one `project_tool_data` JSON
blob per project (tool key `"addendum"`, `lib/db.js:1415`), with no version number and no A1/A2
numbering. Section I's "its own version history" needs either a new table (schema change) or an
extension of the blob.

The blob is **whole-document last-write-wins** through `saveToolData`, so a customer signing races an
office edit — adding version history to the blob makes that race worse, and it also feeds
`cloneProposal` (`lib/db.js:6693-6696`), which copies approved addon items into new proposal drafts.

**Recommendation for Ahmed:** a proper `addendums` table, built by the `db-schema` agent, using the
established ensure-column pattern. That is additive and safe, but it is a schema change the spec's
rule 6 and the RED lane both say to raise first.

---

## B4 — Section I: the "A1" filename collides with a pinned test

> **DECIDED 2026-11-17 — APPLIED (rename the scheme), and the report had the wrong target.**
>
> The measurement said "3 of 3 filenames change" for `documentFilename({ type: DOC.ADDENDUM })` — but
> that path had **no production caller at all**; the only addendum file anyone receives is the email
> attachment, named by `attachmentName` (`lib/email.js:205`, a deliberate branded scheme). So the
> reported change would have altered **nothing that reaches a customer**.
>
> The real defect sat next to it: the emailed change order carried **no A-number**, so two change
> orders on one project produced *the same filename* and the second would silently overwrite or get
> renamed in the download folder. That is now fixed, and it is the only part of B4 that changes a file
> anybody actually gets:
>
> | | |
> |---|---|
> | emailed, was | `IOT TECHS Change Order - Test Client - ASC0034.pdf` |
> | emailed, now | `IOT TECHS Change Order - Test Client - ASC0034 - A1.pdf` |
> | in-app, now | `Test Client - CCTV - 0034 - A1.pdf` (still no caller; names the future download) |
>
> **Decision taken: A1/A2 everywhere.** `addendumNumberLabel` in `lib/addendum-display.js` is now the
> single definition of the scheme, and `lib/doc-filename.js` names through it, so a download can never
> disagree with the row the portal shows. The pinned test was re-pinned deliberately. An *unnumbered*
> add-on still reads "Addendum" — a bare "A" means nothing in a download folder.

`lib/doc-filename.js` is the single source for every downloaded file name and already has
`DOC.ADDENDUM` (line 13), producing `"… - Addendum 2 - v<rev>.pdf"` — i.e. **"Addendum 2", not "A1"**.
`tests/doc-filename.test.mjs:46-47` pins that string deliberately.

Section I wants the document titled "Addendum A1 to Proposal v2". ~~**Decision needed:** rename the
scheme to A1/A2 (and update the pinned test), or keep "Addendum 2" in filenames while showing "A1" in
the UI?~~ **Renamed to A1/A2** — the owner approved it, and keeping two names for one thing was the
worse of the two options once it turned out the UI had been saying "A1" all along.

---

## B5 — Not blocked, but found and worth the owner knowing

> **DECIDED 2026-11-16 — FIXED, and it was far bigger than this entry said.** This entry claimed the
> wrong number was in `lib/addendum-pdf.js`, so "every change order" carried it. A sweep found
> `(646) 396-0775` published as the contact number **31 times** across `lib/` and `app/`: the shared
> PDF chrome — so **every proposal** — plus invoices, receipts, change orders, completion
> certificates, service reports, the internal work order, the ADT portal, the customer tour, a help
> article telling customers *"call us at 646-396-0775"*, and **five live `tel:`/`sms:` links** whose
> "Call us" and "Text us" buttons dialled the payment handle. Only `lib/email.js` had the right
> number, in a local const of its own.
>
> `lib/nap.js` is now the single source for name, phone, email and web, and every one of those sites
> reads from it. Three uses are deliberately kept and allowlisted: `pay-zelle.jsx` (it *is* the Zelle
> handle), `lib/seo/schema.js` (documents it as one), and the PDF-extraction prompt (names both
> numbers so the model never returns either as the customer). `tests/nap.test.mjs` fails if the token
> reappears anywhere else, in any of its four written forms — the hyphenated one is how the help
> article and the five links stayed hidden from the first sweep.

`lib/addendum-pdf.js` (the current "CHANGE ORDER" renderer) **hardcodes the phone number
(646) 396-0775** in its header (~line 22). From the SEO work earlier in this session: that number is the
**Zelle payment token**, not a contact number, and the canonical public number is **(917) 727-0081**.
Every change order sent to a customer has been carrying the wrong number.

Section I replaces this renderer with the Proposal template, which carries the correct NAP, so doing
section I fixes it as a side effect. Flagging it separately in case section I is deferred — in which
case the number should be corrected on its own.

---

## B6 — Found in passing: four more copies of the add-on total, and a qty that disagrees with itself

> **PARTLY DONE 2026-11-16 — the four copies are consolidated; the qty rule is NOT touched.**
>
> All four now call `proposal.addendumTotals`, so the change-order PDF, the approval email and both
> event labels read one function. They were label/email/PDF text only and differed from the helper
> solely in sub-cent rounding the live data cannot trigger, so **no figure moved** — a test pins the
> helper's arithmetic alongside the consolidation to keep it that way.
>
> **DECIDED 2026-11-17 — the qty rule is now 0 everywhere. Nothing moved.**
>
> It was **not** a one-token change: `|| 1` was applied **twice** on the clone path — once in
> `getApprovedAddons`' item map and again in `lib/proposal-reuse.js:48` — so fixing the first alone
> would have had the unit re-invented one call later. Both now read 0.
>
> **Why 0 and not 1**, since the entry asked for a pick rather than a guess:
> 1. **It cannot move money.** 1 would mean changing `addendumTotals`, whose output is bound into
>    `signedFingerprint`; a signed add-on's total could shift. 0 leaves that formula untouched, which
>    is why this is provably zero-impact rather than argued to be.
> 2. **The house rule is to never manufacture a number** — the same principle as the service call's
>    `needsPrice` line, which refuses to invent a price rather than guessing one. A quantity nobody
>    recorded is missing, not one. And of the two ways to be wrong, charging a customer for an
>    unstated quantity lands in a document they sign, while under-charging is visible to staff first.
>
> Measured: **2 projects with approved add-ons, 2 line items, 0 missing quantities, 0 clones whose
> total would differ.** ASC0034 unchanged at $750.00 / $3,693.73. A zero-qty line is still carried
> into the clone with its price intact, so staff can see and fix it rather than having it vanish.
>
> **Left undone deliberately:** a missing qty is still silent. Surfacing it the way `needsPricing`
> surfaces an unpriced line would be the next step, and is a new validation state, not this fix.

Not blocking anything, and **not** caused by this run — recorded because `CLAUDE.md` forbids duplicating
a financial calculation and these were found while consolidating the others.

Section H consolidated the add-on total onto one `addendumTotals` helper (D8a item 9), but a full sweep
during verification found **four further copies** of `Math.max(0, Σ qty×price − discount)` that predate
this work and were left untouched:

| Copy | Used for |
|---|---|
| `lib/addendum-pdf.js:16` | the change-order PDF |
| `lib/email.js:757` | the approval email |
| `app/api/addendum/route.js:96` | the signed-add-on event label |
| `app/project/[accessId]/proposal-actions.js:568` | the same label server-side |

All four are label, email or PDF **text** — none feeds a stored figure — and they differ from the shared
helper only in the sub-cent rounding, which the live data cannot trigger (see D8a). So nothing is wrong
today; the risk is that the next change to add-on pricing has to be made in five places and one will be
missed.

Related, same follow-up: `getApprovedAddons`' item-*display* qty uses `|| 1` while its total uses
`|| 0`. The verifier established this is **not** merely cosmetic, as first assumed — that `items` array
feeds `cloneProposal` (`lib/db.js:6695-6696`), which copies `{name, qty, price}` into a new proposal
draft, so a missing qty would count as **0** on the add-on and bill as **1** in the clone. It is
unreachable today only because the single writer normalises qty on the way in
(`install-addendum.jsx:105`) and the live data has no missing quantities.

~~**Recommended:** one small follow-up that points all five sites at `addendumTotals` and makes the qty
rule agree with itself.~~ **Both halves are now done** — the four copies on 2026-11-16, the qty rule on
2026-11-17 (see the note at the top of this entry; it turned out to be two sites, not one).

---

## Not blocked

Sections **J** and **K** needed nothing external, and **L** required no missing key or service.
Section **G** shipped in full apart from the owner-gated tax/PCP rows in B1.

Section **H** shipped the **proposal** side in full — clickable versions, faithful snapshots, Download
PDF and compare-to-current. The **addendum** side got the same read-only row and snapshot treatment but
no A1/A2 numbering, no per-version Compare and no PDF, because addenda have no row-per-version storage
and no PDF template of their own; those three gaps are the owner-gated items in **B2, B3 and B4**, not
section H shortfalls.

`RESEND_API_KEY` is unset locally, so email paths no-op as designed — intended local behaviour, not a
blocker.

## B7 — Found in passing: the tool-data write path doesn't check the project exists

> **DECIDED 2026-11-16 — FIXED, option 1.** Both write paths — `POST /api/tool-data` and
> `saveToolDataAction` — now resolve the project before writing and return *"That project no longer
> exists."* The check sits **after** the role gate on purpose, so an unauthorised caller cannot use it
> to discover which ids exist; a test pins that ordering. Cascade-on-delete (option 2) was not done:
> it would clean up history, whereas this stops new orphans, and the two are independent.
>
> Note this narrows **B14** without closing it. A stale tab writing to a project that still exists is
> unaffected — that needs the version/etag in B14's option 1.

Minor, not blocking anything, and not caused by this run — observed while cleaning up a test clone.

A throwaway project (`ASC-TEST`) was deleted from `projects` while a browser tab still had its survey
open. The host autosync kept running, POSTed the cached blob, and `/api/tool-data` **recreated a
`project_tool_data` row for a project that no longer exists** — an orphan with no parent.

Neither write path (`/api/tool-data` POST, `saveToolDataAction`) verifies the `project_access_id`
resolves to a live project; the role gate asks what the caller may do, not whether the target is real.
There is no foreign key on `project_tool_data.project_access_id`, so nothing at the schema level catches
it either.

Impact is low — a stale tab can write rows nobody reads, and they survive the project's deletion — but
it is unbounded growth from an abandoned tab, and it means deleting a project does not reliably remove
its tool data. Two cheap options: have the write path resolve the project first and reject an unknown
id, or have project deletion cascade to `project_tool_data`. Either is a small, additive change, but
both are outside every section of this run.

Related: this is the same autosync loop that section L had to gate (D11) — the gate now stops *invalid*
payloads, not payloads aimed at a *missing* project.

## B8 — Found by the section-O dry run: 14 projects are telling customers a proposal exists when none does

> **DECIDED 2026-11-16 — FIXED.** `customerTodo` now takes `proposal_published`, the UNFLOORED fact
> (`buildStageFacts` sets `proposal_status` from the published row, null when there is none), and every
> branch below the survey returns null without it. `buildMyProjectCard` passes it from the raw facts,
> not from `sf`, because `sf` is floored and would defeat the guard. Measured on the live database:
> **14 → 0** projects announcing a proposal that does not exist.
>
> The same defect one branch up was fixed with it: a survey that exists but was never SUBMITTED is not
> the customer's to approve, and `ASC00SR` was being asked to approve one. `survey_submitted !== false`
> now gates that branch. Both flags are opt-in — a caller that omits them keeps the old behaviour, so
> no other surface silently loses a prompt.

**Live, customer-facing, and not caused by this run.** Found while section O was planning the legacy
migration; recorded here because it needs fixing and sits in sections M/N's files rather than O's.

`customerTodo` (`lib/customer-action.js`) announces *"a new proposal is ready — review & accept"* purely
from the **stage column**, with no check that a proposal was ever published. Any project whose stage
reads `proposal` or later shows that message, proposal or not.

**14 projects in the local database are in that state today**, inviting their customer to review a
document that does not exist.

It also nearly became much worse. Section O's first plan would have swept 40+ bare leads from
`inquiry` into `proposal` on the strength of a survey date, which would have turned on this message for
every one of them. O added a hard cap at `site_survey` when no proposal was ever published specifically
to stop that — so the migration is safe, but the underlying defect is untouched and still firing.

**The fix:** gate the proposal branch of `customerTodo` on `proposal_status` (or on the published
proposal existing), not on the stage column. `buildStageFacts` already carries the published-proposal
facts, so the information is to hand.

Related: it is the same class as the stage-column staleness sections M and N spent this run removing —
the stage column is a cache, not evidence, and anything user-facing should read the resolved state
instead. See D16's sibling lesson about gating on the real thing rather than a proxy.

## B9 — RED: a customer can be shown "Pay" and then refused by the payment endpoint

> **DECIDED 2026-11-17 — option 1 is now LIVE.** `PAYMENTS_IGNORE_STALE_PENDING` flipped from an
> opt-in to a **kill switch**: set it to `"off"` to restore the old arithmetic without a deploy.
>
> Measured with it live: **1 of 31 contracted projects moves.** ASC0034 releases a $134.16 pending
> row from 9 July — deposit due $700.21 → **$834.37**, balance due $3,559.57 → **$3,693.73**. No
> invoice figure (total / paid / balance) differs in either mode, because the rule only touches
> `amountDueForPayment`.
>
> **Turning it on exposed a defect that made the 30-minute window meaningless.** `created_at` is
> written by `datetime('now','localtime')` — server-local (America/New_York), no offset — and
> `stalePendingTotal` appended `"Z"`, parsing it as UTC. Every pending row therefore read **5 hours
> older than it was** (4 in EDT). Harmless while the flag was off; with it on, a payment link created
> *seconds* ago parsed as stale, was released from `applied`, and the customer could be asked to pay
> while a real checkout was still in flight — precisely the double-billing the function's own comment
> forbids. Now parsed as written (local). `tests/stale-pending-clock.test.mjs` drives the real
> function against a real table so it cannot regress.
>
> The one live pending row is four months old, so both parses release it: the fix changes **no**
> existing figure and protects every future checkout.
>
> **Still true, and still option 3's job:** this releases the row from the maths but never clears it.
> That $134.16 stays `pending` on the payment list for ever, and staff see a payment that will never
> resolve. A real `failed`/`void` state driven by the Square webhook is the honest fix; this is the
> smallest thing that stops a customer being locked out.

Found by section N's verifier, one level below what N could fix. **Money — needs Ahmed's decision, not
an agent's.**

Section N fixed the *display* half: an abandoned checkout no longer suppresses the Pay prompt. But the
endpoint behind that button still refuses.

`amountDueForPayment` (`lib/db.js:7194-7205`) computes `applied = paid + pending` and
`due = depositAmt − applied`, and `app/api/pay/create/route.js:79-80` rejects with
**"Nothing is due right now."** when `due <= 0`.

So: a signed project with a $500 deposit and one **abandoned** Square pending row of $500 shows
*"Pay deposit"* on `/my-projects` — correctly, after N's fix — and `POST /api/pay/create
{kind:"deposit"}` returns 400. The customer sees a button that cannot work.

A pending row is created when the payment *link* is generated, not when money moves, and nothing ever
clears it: `project_payments` has no void or failed state that the maths respects. One abandoned
checkout therefore locks that customer out of paying by card, permanently.

**Latent today**, for two reasons: Square is dormant without `SQUARE_*` keys, and the customer can still
pay by another method. That is why it is recorded rather than fixed mid-run.

**Options for the owner** (each changes a money calculation, which is why none was taken):
1. Ignore pending rows older than some window (30 minutes would cover a real checkout).
2. Exclude `source='square'` pending rows from `applied` — a Square pending row means "a link was made",
   not "money is in flight".
3. Give `project_payments` a real `failed`/`void` state and have both the maths and the Square webhook
   use it.

Option 3 is the honest fix and the largest; option 1 is the smallest that unblocks a customer.

### Related, same function — FIXED 2026-11-16

> `getProjectFinancialState` and three sibling call sites asked "is this payment money in hand?" with
> `status !== "pending"` — allow-by-default, so any status other than that one literal counted as
> cash. Only `pending` and `confirmed` are ever written (verified against the data: 6 confirmed, 1
> pending, and the only writers insert one of those two), so the answer was identical on every
> existing row — but option 3 below *adds* a `failed` state, and on the day it lands a failed payment
> would have inflated `paid` and shrunk `balance` on a real invoice. All four now share
> `paymentCounts = (p) => p?.status === "confirmed"`. **No figure moves today**; the trap is gone
> before the thing that springs it is built.
>
> The main half of B9 — the Pay button the endpoint refuses — still needs your decision below.

### The original note

`getProjectFinancialState` filters `pays.filter(x => x.status !== "pending")`, so a row with
`status='failed'` **counts as paid** — it inflates `paid` and shrinks `balance`. Nothing writes
`'failed'` today (Square only writes `pending` → `confirmed`), so it cannot fire yet; it becomes real
the moment anyone adds failure handling, which option 3 above would do. Fix them together.

---

## B10 — the ordinary Room gesture cannot create a nested room

> **BUILT 2026-11-16 BEHIND A FLAG THAT IS OFF.** Option 2 (tap-vs-drag), the resolution the
> wall-grab path in that same file already uses, at the same 6px threshold. Off by default via
> `?nest=1`, so today's tap behaviour is byte-for-byte unchanged — verified both ways by driving the
> real widget: flag off, a drag inside the Garage creates nothing; flag on, it creates a nested
> "Paint Booth" and a tap still only selects. Enable for everyone by dropping the condition in
> `site-survey-widget.jsx`.

**Section E, item 12.** Nesting works, and is proven working in a browser: a Stairs room or a
multi-point polygon drawn wholly inside a Garage becomes its own room, leaves the container's cells
intact, wins the hit test at its own cells, and paints over the container. What a user cannot do is the
obvious thing — pick Room, keep the default square, and drag a box inside the Garage. Nothing is
created; the Garage is simply selected.

**Why.** In `draw-floorplan.html`, the canvas `pointerdown` handler reaches `roomHit(pt)` before any
drag begins, and a hit on an existing room ends the gesture:

```
var h=roomHit(pt.x,pt.y);
if(h){ ...; sel=h; redraw(); if(!hn) openLabel(h); return; }   // tap a room → select / name it
closeLabel(); sel=null; startPt=pt; dragCur=pt; dragging=true;  // empty space → start drawing
```

Stairs mode and the polygon shape each return earlier, which is the only reason they can nest. The
select-on-tap behaviour is not a mistake — it is how a room gets selected and renamed — so two
intentions share one gesture and the common one wins.

**This is a design decision, not a bug fix**, which is why it is here rather than in a commit. The
options:

1. **Modifier-drag** — hold a key (or long-press on touch) to force a draw inside an existing room.
   Smallest change; undiscoverable without a hint.
2. **Drag vs tap** — let the pointerdown defer: a tap selects, a drag past a few pixels starts a new
   room. Most natural, and it is how the wall-grab path (`pendingWall`) already resolves tap-vs-drag,
   so the pattern exists in this file. It does change what a sloppy tap on a room does.
3. **An explicit affordance** — a "room inside room" entry in the Room Actions menu, or a sub-mode.
   Most discoverable, most UI.

Option 2 matches what is already in the file. It needs Ahmed's call because it changes the feel of
every tap on a room, on touch most of all.

---

## B11 — a legacy survey renders as an EMPTY survey in the new viewer (O·161)

> **DECIDED 2026-11-16 — read-time adapter, PARTIALLY delivered.** Ahmed: *"B11: read-time adapter, and
> the verifier must confirm camera positions visually on a legacy clone before closing."*
>
> Built: `legacySurveyToSurvey2` in `lib/survey2-model.js`, applied inside `parseSurveyFloors` (so every
> renderer that already funnels through it is covered) and via `db.getSurveyBlobForRender` for the
> camera roster and device list. Coordinates carry over unchanged — see the note on the function for
> why that is a fact about the old widget rather than an assumption.
>
> **Still open, and it is the half the owner actually complained about.** The survey WIDGET — what the
> portal shows — is seeded from `/api/tool-data`, and serving the adapted blob there is NOT read-only:
> the widget uploads the data-URL background to `/api/media`, rewrites `bg`, re-serialises its own
> state (dropping the `__legacyAdapted` marker the outbound gate keys on) and autosyncs the result.
> Opening the clone once wrote a real 820-byte `survey2` row. That is the migration write this decision
> was meant to avoid, so the route was backed out and the stray row deleted.
>
> **DECIDED 2026-11-16 (follow-up) — the one-time migration write is accepted.** Ahmed: *"Accept the
> one-time migration write for legacy projects."* Built as `lib/legacy-survey-migration.js` (pure) +
> `scripts/migrate-legacy-surveys.mjs`, following section O's contract: dry run by default, the live
> file refused unless named, `--apply` requires `--i-have-a-backup`. It writes a `survey2` row per
> project and **never touches the legacy row**, which stays as the source and the rollback.
>
> **The dry run shrinks this problem to almost nothing.** Of 38 projects with a legacy survey:
>
> | | |
> |---:|---|
> | **1** | has a real floor plan to recover (`CSC0119`) |
> | 3 | already have a `survey2` of their own |
> | **34** | have no background image at all — markers with no plan, nothing to render |
>
> So the "legacy surveys render empty" defect is real but affects **one** project here. The production
> count is not knowable from this machine; run the dry run there before deciding it is worth a release.
>
> **One guard worth knowing about.** `getToolMeta` falls back to the legacy tool for a project with no
> `survey2`, so a survey approval on such a project is bound to the LEGACY fingerprint. Writing a
> `survey2` row flips which tool the gate reads and the binding stops matching — a silent conversion
> would void a customer's approval. The migration therefore **holds those projects back** and lists
> them; `--rebind-approvals` converts them and re-binds the approval to the identical content in its
> new shape, but only when asked for out loud. In this database no project needs it.
>
> **Not executed anywhere real.** Per the run's rule 6 the real migration is documented, not run. It
> was rehearsed on a snapshot copy (1 converted, re-run converts 0 — idempotent) and applied only to
> the throwaway clone.
>
> ### What B11 actually fixes, stated precisely
>
> The verifier's first requirement was to say this plainly rather than let "legacy surveys render" be
> read as more than it is. Measured against this database:
>
> | | |
> |---|---|
> | **123 cameras across 27 projects** | reach the camera roster, the device list, the CCTV mockup picker and the proposal builder, through the read-time adapter. No write. |
> | **1 project** | has a background image and so can have its floor plan materialised by the migration. |
> | **26 of those 27** | have cameras but never had a background. Their rosters are now populated; they have no plan to draw and never did. |
>
> An earlier draft of the adapter filtered out floors with no background, which cost **125 of the 128
> legacy markers** — nearly the whole estate — for a rendering reason that does not apply to a list.
> The adapter now keeps device-bearing floors and `renderableFloors()` is what the migration writes.
>
> **A legacy survey still opens on the Layout step with nothing drawn**, because the old tool stored a
> background photo and pins and never had a vector structure. The cameras are present (Placement,
> Camera Angles and Devices all show them); it is the Layout step that has nothing to show. That is
> inherent to the data, not a bug in the adapter, and no migration can invent a floor plan that was
> never drawn.


**Live, customer-facing, and the opposite of what the migration report claimed.** Found by cloning a
real legacy project and opening it.

Spec section O has two adjacent lines that were treated as one item:

- **O·161** — "Legacy surveys keep their floorplan + cameras but render in the new viewer."
- **O·162** — "Floorplan viewer fixes: blank 'Approximately ___ total' (hide if no area), blurred
  dimension labels, and the scale bar shows '1 m'. Use feet."

**O·162 is closed.** Those three readouts belonged to the legacy portal viewer that section M deleted.
None of the strings exists anywhere in rendering code any more — `Approximately` survives only inside
this run's own migration-report prose, and there is no scale-bar or metre formatting code left at all.

**O·161 is not closed, and nothing in the run addressed it.** The two surveys are different documents:

| | legacy `survey` | current `survey2` |
|---|---|---|
| background | `floors[].B.img` (+ `imgRatio`, `imgRotate`, `zoom`, `sat`) | `floors[].bg` |
| devices | `floors[].markers` | `floors[].devices` |
| rooms | `floors[].B.rooms` / `B.strokes` | `floors[].plan` |
| scale | `floors[].B.ftWide` | `floors[].scale` |

The project page reads **`survey2` only**. Nothing converts a legacy blob into it. The admin surveys
list does read both (`lib/db.js:2131-2132` LEFT JOINs `survey2` and `survey` for counts and thumbnails),
which is why the data looks present from the office and absent from the portal.

**Reproduced** on `ASC-TEST-LEG`, a throwaway clone of `CSC0119` (Sunrise Deli — a 9,586-byte legacy
survey with a background image and a marker). The portal renders:

> Layout · Draw the structure first — Devices · **No cameras yet — tap Add camera to start.**

The source row was not touched; the clone is local-only and can be deleted with
`DELETE FROM projects WHERE access_id='ASC-TEST-LEG'` plus the matching `project_tool_data` rows.

**Locally 37 projects carry a legacy `survey` blob**, and the ones with no `survey2` alongside are the
affected set. The production count is not knowable from here.

**The migration report is wrong on this point and has been corrected.** It asserted that "legacy survey
blobs need no data change" because "the floorplan/device model is already shared". Sharing the *model*
does not help when nothing maps the *old shape* onto it.

**Why this was not just fixed:** it needs a legacy→survey2 adapter, and the risk is not the plumbing but
the coordinate systems. `survey2` stores devices as a PERCENT of the floor image (`lib/survey2-model.js`);
the legacy markers sit in a pixel space with their own `zoom {s,tx,ty}` and `imgRatio`. Get that
conversion wrong and every camera lands in the wrong place on a document the customer is asked to
approve — visibly plausible and silently incorrect. It also decides whether the adapter runs on READ
(display only, no fingerprint movement, legacy projects have no survey2 acceptance to void) or as a
one-time WRITE in the section-O migration (touches `toolFingerprint`, so it is RED).

**Decision needed:** read-time adapter or migration write? And is this worth doing at all, or do the
affected legacy projects simply not need their old surveys shown? Recommended: a read-time adapter in
`lib/survey2-model.js`, verified by rendering a cloned legacy project and comparing marker positions
against the legacy viewer's own geometry before anything is shown to a customer.

---

## B12 — RED: the signer refuses `?sign=` in exactly the state "Sign" is shown for

> **DECIDED 2026-11-16 — FIXED.** Ahmed: *"B12: gate on signed, not accepted, and confirm the
> signature-request email links still work."* The guard now reads
> `!!p.signed_name && accepted.has(match?.id)`. The email path is unchanged: a signature request goes
> out while the proposal is `sent` with nothing accepted, so it took the `setEsignFor` branch before
> and still does — the only behaviour that changed is that an accepted-but-unsigned proposal now opens
> the signer instead of toasting. Covered by the four `B12:` tests in `tests/sign-request.test.mjs`.


Found by the verifier on O·166, one level below what O·166 could fix. **Signature path — RED.**

`proposal-customer-view.jsx:239-253` matches `?sign=<x>` against the proposal OPTION id and then
refuses it with a toast if that option is already in `accepted`:

```js
if (match && accepted.has(match.id))   // "That option is already signed."
```

It conflates **accepted** with **signed**, and `selectProposalOption` (`lib/db.js:7058` →
`_writeOptSets:7051`) writes `accepted_options` at accept time, long before any signature exists.
Simulating the handler line for line with `want="1"`:

| state | result |
|---|---|
| sent, 1 option, nothing accepted | signer **opens** |
| sent, 2 options, nothing accepted | toast "Open a proposal option to review and sign." — no signer |
| **accepted, unsigned, 1 option** | toast "That option is already signed." — **no signer** |
| **accepted, unsigned, 2 options** | toast — **no signer** |

The bottom two rows are the "awaiting signature" state. A deep link that says *Sign* lands the
customer on the proposal with a toast and no signer.

A second, smaller point: `sign=1` is the wrong grammar. Everything that emits this link
(`proposal-actions.js:217,274`, `request-signature-sheet.jsx:20`) emits `sign=<optionKey>`; the literal
`1` only works because of a single-option fallback.

**Done instead:** O·166's Sign CTA drops the `sign` param and deep-links to `?open=proposal`, which
always works. The customer reaches the proposal and signs from there; they are never shown a toast.
A test pins the absence of the param and the presence of the offending guard, so re-adding the param
means reading this first.

**Decision needed:** should the guard test *signed* rather than *accepted*? That is the signature path
and the RED lane says consult. Note the same guard governs the links in the signature-request email, so
it is not only this CTA — it is latent there only because those links are sent before acceptance.

---

## B13 — "addendum awaiting signature → Sign" was never implemented (part of the addendum cluster)

> **DECIDED 2026-11-16 — deferred, folded into B2/B3.** Ahmed: *"B13: defer, fold into B2/B3."*
> Nothing to build until the addendum signature model is settled. Whoever takes B2/B3 owns this:
> once an addendum signature has a definition, add the branch to `customerTodo` and a `TODO_ACTION`
> entry pointing at `?open=addendum`, and remember it changes the required-actions banner as well as
> the project card, because both read the same engine.


Spec O·166 says *"Proposal/**addendum** awaiting signature → Sign"*. Only the proposal half exists.
`customerTodo` (`lib/customer-action.js:56-70`) has no addendum branch at all, so a project whose only
outstanding item is an unsigned change order falls through to a plain "Open" — on the card **and** in
the required-actions banner above the list, which reads the same engine.

The pieces are there: `resolveCustomerRequiredActions` (`lib/db.js:7297`) → `requiredActionsFromState`
(`lib/proposal.js:1057`) already emits `{documentType: "change_order", action: "signature"}`, and
`?open=addendum` is already in the gateway's `OPEN_TOOL_NAMES`.

**0 projects are in that state today**, so nothing is misbehaving right now.

**Not done because** adding a branch to `customerTodo` changes the required-actions banner as well as
the card, and it lands in the middle of the addendum cluster that is already waiting on you — **B2**
(addendum e-sign needs a schema rebuild), **B3** (no row-per-version storage), **B4** (the A1 filename).
Deciding B2/B3 decides what an addendum signature even is; building a CTA that points at it first would
be guessing. Fold this into whatever you choose there.

---

## B14 — an open browser tab silently overwrites tool rows, including a freshly migrated one

> **FIXED 2026-11-16 — option 1.** The version is a content hash of the stored bytes, so it needed no
> migration at all. `getToolData` returns a `rev`; both write paths refuse a write whose `baseRev` is
> behind, with "This was changed somewhere else since you opened it." It is optional, so a caller that
> sends none is accepted exactly as before and nothing existing breaks. Proven end to end on a copy:
> A reads, A writes, B writes, A's stale push is REFUSED and B's data survives.
>
> **Remaining caveat:** a tab loaded before this deploys runs the old bundle, sends no claim, and is
> still accepted. That ends when the tab reloads.

Predicted by the verifier on B11 and then **confirmed live, twice**. This is wider than B11 and it is a
precondition for running the survey migration safely.

`startToolAutosync` (`app/project/[accessId]/tool-sync.js`) seeds the client from the server (or from
its own IndexedDB mirror, `iot_tools`, which wins over the server), then pushes localStorage back on a
5-second timer. Nothing on either side asks whether the server's copy has moved on. So:

1. **A deleted tool row comes back.** I deleted the clone's `survey2` row; a tab left open on the
   project re-created it three minutes later, with that user's email as `updated_by`.
2. **A migrated row is overwritten with pre-migration bytes.** I migrated the clone (9,390 bytes,
   provenance `legacy-survey-migration`), then loaded the project with a tab whose storage predated
   the migration. The row came back as the client's 825-byte copy under `aelzoghabi@gmail.com`. The
   migration's write survived about a minute.

**Operational consequence for B11:** the legacy-survey migration must not run while anyone has the
affected projects open, and there is nothing in the code to enforce that. For a 1-project migration
that is a scheduling note; as a general property it is a data-integrity hole.

Related and separate: **the widget rewrites a migrated row on first open even with a clean client.** It
uploads the inline data-URL background to `/api/media`, rewrites `bg` to the media id, re-serialises,
and syncs — 9,390 bytes become 825 and the provenance becomes the viewer. If that matters, the
migration should upload the background to the media store itself and write the media URL, matching
what the widget produces.

The geometry survives that rewrite intact — x, y, aim, fov, range and cid are identical — but the
verifier measured two things I had called cosmetic and which are not:

- **It moves the fingerprint.** The widget also sets `name` from `""` to `"Camera 1"` and swaps the
  inline background for a media URL, and both are inside `survey2Meaning`: `toolFingerprint` goes
  `ijis6v → 1z9byv` on first open. So any binding carried across a migration is void the first time
  someone opens the planner. That is the second reason the re-bind option was removed rather than
  repaired (see B11) — it could not have held.
- **The legacy identity tag is lost.** The widget's persisted record carries no `tag`
  (`site-survey-merged.html:2463`) and recounts tags on restore, so `getProjectCameras`, which labels
  from `tag`, falls back from the legacy `"IC1"` to `"Camera 1"`. Caused by the widget rather than the
  migration, but it is the end state of every migrated project, and it means the legacy labelling a
  customer may have seen on an old document does not survive.

**Options for the owner — and option 2 was traced and does NOT work.**

1. **A version/etag on `project_tool_data`** that the client must echo; the server rejects a write
   made against a version it did not read. The only option that addresses either incident.
2. ~~Have `seedToolData` record the seeded bytes as the push baseline~~ — **ruled out.** Traced
   against the code: in *both* incidents seeding never ran. `seedToolData` returns early at "local
   draft wins" (`tool-sync.js:133`) whenever localStorage already holds content, which it did both
   times, so there were no seeded bytes to record. Incident 1 then pushed because the deleted row made
   the server return `saved: null` and `startToolAutosync`'s priming block only sets a baseline when
   the server HAS data — deliberately, so a device holding the last copy of a survey the server lost
   can restore it. Incident 2 pushed because the stale localStorage genuinely differed from the
   migrated row. A baseline from seeding would have fired in neither.
3. Accept it and run migrations in a maintenance window.

Note what option 2's failure exposes: the push-when-the-server-is-empty behaviour is **deliberate
data recovery**, and "don't recreate a deleted row" and "do restore a survey the server lost" are the
same code path pointing in opposite directions. That is why this is a decision and not a cleanup —
only a version check can tell the two apart.

**B7 is now fixed**, which removes one way in: a stale tab can no longer write to a project that has
been deleted outright. It does nothing for a tab writing stale bytes to a project that still exists,
which is incident 2.

File next to **B7** — same write path, same missing precondition.

---

## B15 — a legacy camera appears in the roster but cannot be renamed or photographed

> **DECIDED 2026-11-16 — FIXED, option 1 (say why).** The write already failed safely; what it said
> was wrong. Both writers returned *"Camera not found — the survey changed. Reopen and retry."*, which
> sends someone hunting a concurrent edit that never happened. `surveyIsLegacyOnly()` now distinguishes
> the case and the route answers *"This project's survey is in the older format and is read-only until
> it is migrated."* Migrate-on-demand (option 2) was not done: it would make a read-shaped action
> perform a migration write, which is exactly what B11 spent two rounds separating.

Adapter-scope consequence of B11, found by the verifier. Low impact, no data at risk.

On a legacy-only project (not yet migrated) the read-time adapter now surfaces its cameras in the
roster. But `setSurveyCameraName` and `setSurveyCameraPhoto` (`lib/db.js:7666`, `:7684`) read the
**raw** `survey2` row — correctly, because they are writers and must never round-trip an adapted
blob — and a legacy-only project has no such row. So they find nothing and return `null`: the rename
or photo silently does not land.

It is the right failure (far better than materialising an adapted blob through a write path) but it
is a silent one. **Options:** have those two surface "this survey has not been migrated yet" instead
of returning null, or migrate the project on demand when someone first edits it. Either is small;
neither is in any section of this run.

Note this disappears for any project the migration converts — it only affects legacy-only projects,
and of the 27 whose rosters the adapter populates, only 1 can be migrated.
