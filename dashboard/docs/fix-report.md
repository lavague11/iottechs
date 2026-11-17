# Fix report — site-survey-fixes

Per rule 11 of `site-survey-fixes.md`. Branch `site-survey-fixes`, cut from `main`. **Nothing was
deployed and nothing was pushed to `main`;** the branch is pushed to `origin/site-survey-fixes` only, and
only `main` auto-deploys.

Companion documents: `docs/fix-plan.md` (where each section lives), `docs/decisions.md` (every decision,
D1–D10), `docs/blocked.md` (what needs Ahmed and why).

**Status at a glance**

| § | What | Status | Commit |
|---|---|---|---|
| J | Appointment reminder day label | **Done** | `837f7c0c` |
| K | Crop in the bug-reporter screenshot editor | **Done** | `ca4f80d5` |
| G | Addendum reuses the Proposal item picker | **Done** | `f9397090` |
| H | Clickable sent versions | **Done** | `b55cea69` |
| — | A technician could see the customer's balance | **Done** (out of scope, on request) | `0eea1aca` |
| L + A | Survey saving/reopening, and step order | **Done** | `263f69e9` |
| M + N | One portal, one stage, the authorization sweep | **Done** | `db2f473d` |
| O | Legacy-project migration | Built; final round on the admin override | — |
| B, C, D, E, F | Survey widget surface work | Not started | — |
| I | Addendum inside the Proposal | Partly owner-gated — `blocked.md` B1–B4 | — |

**Verified live in a browser** (not just tested): the customer portal now shows a 3-step rail at 45%
with a matching "Installation in progress" chip, the balance with its pending add-on, the signed
proposal — and a scan for `recorded_by`, `external_id`, `fee_amount`, `payout`, `commission`, `margin`,
`cost` and internal notes returns nothing. The staff hub's balance card is correctly **absent** for a
technician. The rail no longer flashes a stale stage on load. Section M's schema migration was exercised
against the real database on a dev-server restart: the `money` column was added and every `$`-bearing
label backfilled, with **zero** left unflagged.

**A testing trap worth knowing**, found the hard way during that pass: `?preview=<role>` sets the page's
`initialView`, so it faithfully tests anything **server-rendered** from it — that is how the technician
balance leak was caught — but it does **not** change who a *client-invoked server action* thinks you
are. Those call `getSessionRole()` and still see your real session. A money filter inside
`getEventsAction` therefore looks broken under `?preview=tech` while being perfectly correct. Verify
server actions by calling them directly with a stubbed session, as section M's verifier did.

Every section was built by a sub-agent, reviewed by a second, and verified by a third (opus) that had to
exercise the change rather than read it. **Only the verifier could mark a section done**, and it rejected
three of the four that reached it on the first attempt.

---

## J — Appointment reminder said "tomorrow" for a same-day visit · DONE · `837f7c0c`

**The bug (ASC0067, Kassem).** An email sent Sun Nov 15 at 1:25 PM for a 3:00 PM appointment *that same
day* said "tomorrow" in both the subject and the body.

**Two independent causes.** The sweep had no day-before concept at all — it fired the first time an event
fell inside a sliding `(0, 24h]` millisecond window, so a same-day appointment triggered it, then deduped
forever. And the wording was a hardcoded literal in four places, so a same-day send still read "tomorrow".

**What changed.** The day label is computed from the appointment's calendar day against the send time's
calendar day in America/New_York. A new `zonedMs()` reads the stored floating wall-clock time through
`Intl`, so the module no longer depends on `process.env.TZ` and the 24h window can't disagree with the
label if the server zone drifts. There are now two distinct reminders with separate dedupe keys: a
day-before (~24h) and an optional same-day (~2h) reading "today at 3:00 PM".

**Three further defects found during review, all fixed:** a failed send was never retried **and was
logged as sent** (an archived project returned `ok:false`, kept its claim, and wrote "reminder sent" to
the Job Log for mail that never went); the dedupe key used `ev.id`, which survives a reschedule, so a
moved appointment never re-armed; and a booking made inside the reminder window triggered a second email
within 30 minutes of its own confirmation.

"To be assigned" is gone — no technician now renders label **PROJECT MANAGER**, value **Ahmed**.

**Files.** `lib/appt-reminder-model.js` (new) · `lib/appointment-reminders.js` · `lib/email.js` ·
`lib/send-schedule.js` · `lib/db.js` · `app/project/[accessId]/scheduling-widget.jsx` ·
`tests/appt-reminders.test.mjs` (new).

**Test it in 3 steps.**
1. Book an appointment for **today**, about 90 minutes out, on a project with a customer email.
2. Trigger the sweep (it runs every 30 min from boot, or hit `/api/cron/appointment-reminders` as admin).
3. The project's Job Log should read "Same-day reminder sent", and with `RESEND_API_KEY` unset the
   console line shows the subject: *"Reminder: your site survey is today at 3:00 PM"* — not "tomorrow".

**How it was verified.** The verifier re-derived the root cause from `git show HEAD:`, ran 62 of its own
cases, and confirmed identical results under five timezones (UTC, Asia/Tokyo, Pacific/Kiritimati,
Pacific/Honolulu, Australia/Lord_Howe) and both 2026 DST transitions. It proved the claim-release live by
planting a schedule blob under an access id with no project row: no claim written, no Job Log line,
retried next sweep.

**Decisions:** D6 and D6a in `docs/decisions.md`.

---

## K — Crop in the bug-reporter screenshot editor (BUG #99) · DONE · `ca4f80d5`

**The bug.** A full-page capture arrived in the editor too small to annotate, with no way to trim it.

**What changed.** Crop is first in the desktop toolbar and the mobile dock, on `C`. Drag a box with eight
handles, the outside dims, Enter or ✓ applies, Esc or × cancels. Annotations inside are kept and
translated; ones entirely outside are dropped. After cropping, the canvas is sized so the crop fills the
stage — the actual fix for the unreadable screenshot.

**Three defects that would each have produced silently wrong output, all found in review:**
- The undo history held shapes only and no base image, so a crop could not be undone at all.
- Attach returned only pages in the dirty set, so **a crop with no annotations drawn on it would have
  uploaded the uncropped image.**
- Re-editing an existing chip never re-uploaded `cleanUrl`, which is what the draft and the filed report
  persist — so cropping a chip and filing the report would have stored the **uncropped** base underneath
  shapes already translated into cropped coordinates, putting every arrow and box in the wrong place.

Also fixed: dragging a new box past the image edge shifted the anchor instead of clipping; Attach
silently discarded a crop box still on screen; **Ctrl+C / Cmd+C selected the Crop tool instead of
copying** (as did Ctrl+R/A/P/T); and `hitHandle` returned the east handle instead of south-east at a
small box's corner.

The annotator was 632 lines (already over the 500 limit) and would have hit 708, so the CSS, the icon set
and the pure draw/flatten helpers moved to siblings — it is now **481**, with the pointer and keyboard
wiring untouched and the extracted code verified byte-identical apart from `export` keywords.

**Files.** `app/components/screenshot-crop.js`, `screenshot-annotator-css.js`, `screenshot-annotator-ui.jsx`,
`screenshot-draw.js` (all new) · `screenshot-annotator.jsx` · `bug-reporter.jsx` ·
`tests/screenshot-crop.test.mjs` (new).

**Test it in 3 steps.**
1. Open the bug reporter and capture a screenshot — the editor opens.
2. Press `C`, drag a box, press Enter. The image should shrink to the box and fill the canvas. Ctrl+Z
   restores the full image without stretching; Ctrl+C should *not* switch tools.
3. Crop again and press Attach. The chip thumbnail is the cropped image; re-open it and the annotations
   are still aligned.

**How it was verified.** The verifier drove the real editor in Chromium with network writes intercepted,
parsed the uploaded multipart bodies and confirmed both uploads carry a **300×200** PNG — the cropped
image at natural resolution, never the zoomed display size and never the uncropped original. It also
traced the restored-draft re-edit path end to end twice. Nothing was written to the database.

**Not implemented, deliberately:** the optional auto-suggest-viewport-crop bullet, the one piece that
would change the page-capture path.

**Decisions:** D7 in `docs/decisions.md`.

---

## H — Clickable SENT VERSIONS · DONE · `b55cea69`

Committed after G, because the two share `install-addendum.jsx` and H has a test asserting that file
carries no local add-on formula — which only becomes true with G's rewrite in place.

**What changed.** Every version row in SENT VERSIONS is now a focusable button with a hover state and a
chevron, expanding inline to a read-only snapshot of exactly what was sent — items, prices, discount, PCP
credit, tax, total, payment plan, and the signature with its date. Plus Download PDF and a
"Compare to current" toggle that highlights changed lines.

**The subtle part.** A signed version renders the frozen `signed_payload`; an unsigned sent version
renders `payload`. That distinction matters because `setProposalTechPricing` can still write tech pricing
onto a **sent** row with no version bump, so `payload` is not a faithful record of what was sent.

**Three defects found by review and verification:**
- An add-on **edited after signing rendered as signed** — the snapshot showed the new prices beside the
  old signature, misrepresenting a customer's signature as covering figures they never saw.
- The add-on total formula existed in **four** places and they **disagreed** — different rounding, and a
  missing quantity rendered as "1" while contributing 0 to its own total. Now one shared
  `addendumTotals` with five callers.
- **Compare marked the wrong lines whenever two lines in a service shared a name.** The diff distinguishes
  items by id, but the snapshot re-matched by service+name, so the highlight landed on every matching line
  and the "now" figure beside an untouched line was a *different* line's quantity. This was not an edge
  case: **36 of the 78 real sent versions** have duplicate names (ASC0057 v1 has ten lines called "Full
  Camera Install"). Measured on real data, the old matcher placed **15 wrong marks**; the fix places zero.

**Files.** `lib/proposal-version-snapshot.js`, `app/project/[accessId]/proposal-version-snapshot.jsx`,
`tests/proposal-version-snapshot.test.mjs` (all new) · `proposal-version-log.jsx` (rewritten) ·
`lib/proposal.js` · `lib/db.js` · `proposal-actions.js` · `gateway-client.jsx` · `install-addendum.jsx`.

**Test it in 3 steps.**
1. As staff, open a project's Proposal and scroll to SENT VERSIONS. Click a version row — the snapshot
   opens with items, money, payment plan and signature.
2. Edit the working draft (change a quantity), then click Compare on that row: changed lines are marked
   with the new value, removed lines struck through, lines added since listed separately.
3. Click Download — the PDF is named with that version's own revision and shows the same figures.

**Security note.** `getProposalHistoryAction` was readable by **any non-customer, including tech and
vendor**. It is now admin/manager/sales only, with sales receiving a cost-stripped payload. That hole
pre-existed this work; it was found because the section had to touch that file.

**Decisions:** D8 and D8a. **Owner-gated gaps:** addendum version numbering, per-version Compare and the
addendum PDF — `docs/blocked.md` B2, B3, B4.

---

## Out of scope but fixed on request — a technician could see customer financials

Not one of the spec's sections. Found during the live pass and fixed because it is a live privacy
problem, at Ahmed's instruction.

Opening any project as a technician rendered the staff hub's PROJECT BALANCE card: *"Total $3,107 · Paid
$0 · Remaining $3,107 + $200 pending"*, plus the pending add-on line. Definition of Done rule 4 says a
tech never sees customer financials.

The figures were **computed and sent by the server**, not merely shown — `page.jsx` assigned
`staffFinance` whenever `staffHub` was true, and `staffHubFor()` keys off project type, never role. The
card itself only checked `hasContract`. Hiding the card would not have fixed it.

The whole computation now sits behind `can(initialView, "customer.financials.view")`, a capability that
already existed with exactly the right membership (admin, manager, sales, customer, readonly — excluding
tech and vendor). Gating the computation rather than the two assignments matters: `customerFinance`
ships as a prop regardless of view and the progress rail falls back to it, so gating only `staffFinance`
would still have handed a tech the numbers.

Knock-on effects, all correct: the hub's "Record Payment" action disappears for a tech, and the payments
fetch short-circuits.

**Files.** `app/project/[accessId]/page.jsx` · `tests/staff-finance-visibility.test.mjs` (new, 4 tests).

**Test it in 2 steps.** As admin, open any project with a contract at `?preview=tech` — no PROJECT
BALANCE card and no Record Payment action. Drop `&preview=tech` and both return. (`?preview=` sets the
real `initialView`, so it exercises the genuine tech path.)

**Decision:** D12.

---

## G — Addendum reuses the Proposal item picker · DONE · `f9397090`

Three rounds. The verifier cleared it by transpiling the real menu component through Babel and rendering
it with React across all eight separator combinations, and by 209 round-trip assertions over 12 fixtures
plus all three real add-ons including the signed one.

The manual Item / Type / Customer-price / Tech-pay form is gone; the Addendum mounts the Proposal's own
`ProposalItemsEditor`, with the shared `+ Add Service` picker, the `+ Item` type-to-search catalog and
the quick-add preset chips. `ItemNameField` and `ServiceAdder` were extracted so there is genuinely one
picker, not a copy. `install-addendum.jsx` went 498 → 378 lines.

Two defects it introduced and then fixed: **retail prices became readable by techs** (rendered and merely
hidden with CSS, present in the DOM and inside `aria-label` text — now not rendered at all), and the
editor round trip reordered and normalised legacy items, **which moved the add-on fingerprint and could
silently void a customer signature**. The round trip is now an identity map, verified byte-identical
against all three real add-ons including the signed one. A dead "Pricing & presets" menu item was removed
in the last round.

**Visible change to flag:** sales reps can no longer price an add-on. The server has *always* discarded
prices typed by sales, so the old form let them enter a number that was silently dropped and then fire an
approval email for an unpriced add-on. Kept deliberately — see the note in `docs/decisions.md`. If sales
should genuinely price, the fix is to grant them `addendum.price`, not to restore the old illusion.

**Verified and shipped** in `f9397090`. (This line previously read "Outstanding: one verifier re-run,
then commit" — it was written mid-flight and not updated when the section landed.)

---

## M + N — one portal, one stage, and nine authorization leaks · DONE · `db2f473d`

Committed together: they share `lib/customer-portal.js`, `lib/staff-hub.js` and `lib/db.js`, and N's
customer card consumes the helpers M centralised.

**M — the customer portal was running the old view.** A customer saw a 5-step bar at "50% Consulting"
beside a chip reading "Awaiting Installation", a satellite image with no cameras, "0 of 1 complete",
and no appointment, proposal, balance or Log. The bar and the chip disagreed because they were
different calculations — there were three. The header, balance and Log are now **one shared component
each**, mounted by both portals, so they cannot drift again by construction; the rail derives from
resolved state and renders nothing until the facts load rather than painting a stale value.

**N — `/my-projects` showed the stored stage.** It passed `projects.stage` straight through, so a
signed proposal still read "Stage 2 of 5 · Needs review", and "Install — 2026-11-13" was the project's
own date rather than the next appointment. It now recomputes through the same resolvers the staff
portal uses.

**What the pair actually turned into: nine leaks of one shape.** `canReadProject` answers "may this
caller see this project at all?" and admits any technician, any customer and any PIN holder — and it
was being used as though it also answered "may this caller see money". Found by sweeping for siblings
rather than fixing one at a time: `staffFinance`, `getCustomerFinanceAction`, `getPaymentsForLogAction`
(the **raw** ledger — recorder, internal notes, processor ids, fee amounts, photos — to techs *and*
customers), `getApprovalDataAction`, `getLiveSnapshotAction`, `getEventsAction`, `recordPaymentAction`,
`deletePaymentAction`, and `/api/pay/create` (deposit and balance to a tech holding a PIN). Every
ledger read now goes through one `paymentsForViewer()`.

**And two write holes.** A **customer could rotate their project's access PIN** — `confirmInfoAction`
wrote contact fields with no intake check, and `updateProjectContact` re-derives `customer_pin` from
the phone's last four digits. Proven closed at the database level: 29 attack variants as a session
customer, 15 as a PIN holder, every refusal leaving the row and the PIN byte-identical. Then the
adjacent door: a **staff PIN grant for one project could rewrite another's** contact record and rotate
*that* project's PIN. Closed for all seven roles, 182/182 matrix checks.

Worth recording honestly: replacing the dollar-sign regex with a structured `money` column **briefly
made things worse** — five of seven emitters were flagged, so new add-on and AI events became
tech-visible where the regex had caught them. Both mechanisms now run: the flag is the gate, the regex
the net.

N also closed an abandoned-checkout bug that silenced the Pay prompt permanently, and fixed
email-only ownership so a customer whose project carries a phone and no email can see it — measured
across all 54 real accounts as newly matching **zero** rows.

**Test it in 3 steps.** Open a project as a customer (`?preview=customer`): the 3-step rail, the
percent and the status chip should agree, with the balance and the signed proposal present. Open the
same project as a tech: no balance card. Open `/my-projects` as a customer whose proposal is signed but
whose stored stage is stale: the card should read Install, not "Needs review".

**Decisions:** D12–D16. **Owner-gated:** `blocked.md` B9.

---

## O — legacy-project migration, dry run only · DONE · `919fbc8a`

129 projects scanned: **46 would change** (1 customer-visible, 45 stage-column catch-up), 19 already
correct, **28 need a human**, 36 out of scope. Zero completion stamps would be written.

**The named case does not resolve as the spec asked, and that is the finding.** `ASC0041` in this
database is not Pizza Bay — it is a field-created internal job for a customer called "body", at stage
`inquiry`, with no survey, no proposal, no payments and no completion. Pizza Bay, ASC0065 and ASC0067
are production rows that do not exist locally. The migration lands ASC0041 where the evidence puts it
and refuses to force Completed; the Pizza Bay *shape* is unit-tested instead, so the real row migrates
correctly once the dry run is re-run on production.

**Two self-confirming bugs, both caught before they mattered.** `resolveProjectStatus` treats stage
`qc`/`payment`/`completion` as proof the field work happened — so reading the state lift off the
*stored* stage lets a stale column justify itself. It changed the outcome for four projects. The same
shape reappeared in the override: moving a stage to Completion writes a transition stamped *now*, so an
admin who moved the stage and then marked the job complete would derive today's date from the row they
had just created. Evidence dated today is now ignored outright, and the guard is **mutation-tested** —
removing it fails six tests by name.

**The dry run is not a read-only connection.** Importing `lib/db.js` runs the app's startup pass, which
writes. The documented command used to do that against the live file while calling itself a dry run.
The script now prints the database it resolved, refuses the live file unless told explicitly, and
`--snapshot` copies `.db`/`-wal`/`-shm` to a throwaway directory. An environment `DB_DIR` deliberately
does not count as consent — in production that variable *is* the live database.

**The override had no caller.** The report routes 38 projects to an admin override that, when written,
was a `"use server"` action no human could reach. It is now "Override…" in the project card menu,
capability-gated, offering all nine master stages (the existing controls reached three), with the
completion date **required** and prefilled from the row's own dated evidence with its source named —
because `completed_at` + `warranty_months` is the warranty.

**`docs/migration-report.md` is deliberately not committed.** It embeds real customer names, signer
names and contract totals; it is gitignored with the reason inline and regenerates with `--snapshot`.

**The real run, never executed:**
```
node scripts/migrate-legacy-projects.mjs --snapshot /tmp/iot-rehearsal   # rehearse, on production
node scripts/migrate-legacy-projects.mjs --apply --i-have-a-backup       # the real run
```

---

## L — Site Survey saving and reopening · DONE · `263f69e9` (with A)

The run's top priority. Three rounds, two of them forced by data loss found after the tests were green.
It commits after section A, because the two co-edited `system-planner.jsx` across 21 interleaved hunks
and L's planner imports A's new `lib/survey-rail.js`.

**The root cause is established and is not what the spec assumed.** Data was never failing to save — a
*save* was destroying it. `snapFloor()` copies the live editor onto the floor record, and every field is
null or empty until `loadFloor()` has run; `serialize()` calls `snapFloor()`. So any save firing before
the editor mirrored a real floor replaced the saved floor with an empty one **and POSTed it**. A
swallowed exception in `restore()` made that window easy to hit. Two of my own hypotheses were wrong and
were corrected: the `goStep` clamp is innocent (the five steps live in the planner's `railStep`, which was
simply never persisted), and there is no separate scale bug — "1 box = 4.3 ft" becoming "20 ft" is two
rungs of `gridBoxFtFor`'s fallback ladder walked after the data was destroyed.

Two rounds landed a save gate, corrupt-blob detection, DB-first device loading, a submit-lock banner, a
tech capability scoped to the survey alone, and recovery for browsers already holding a bad copy.
**I verified the happy path live:** on ASC0112 the Devices strip now shows all 8 cameras where it used to
say "No cameras yet".

**Why it is not done.** Live testing found the gate incomplete in a way that still loses data. I corrupted
ASC0112's local copy; the new UI correctly said *"nothing was changed"* — while the server row went from
3083 bytes and 8 cameras to the 7 bytes `{broken`. The gate lives inside the survey widget, but
`startToolAutosync` in `tool-sync.js` is a **host-side** 5-second interval that POSTs `localStorage`
straight to `/api/tool-data` with no gate and no validation. (I had backed the row up and restored it
byte-for-byte; nothing was lost.)

Verification then widened the search and found three more ungated host writers — the reconnect handler,
L's own new **Retry** button, and `flushDraft`, which section L put on the path of the lock banner's
**"Edit survey"** button, so the banner's own recommended action pushes this device's copy over the server
row *before* the permission check. Plus a second path: a local blob of `{"floors":[]}` with a failed
server read opens the gate over a blank canvas — and that is exactly the blob the pre-fix failure wrote,
so real devices may hold one.

**The fix closed it** at the choke point in two layers, and both are in `263f69e9`: one validated
host-side `postToolData` (`tool-sync.js:75`) that `push()`, `flushDraft` and `retryToolSync` all go
through, plus a server-side rule — `emptyOverContent` in `app/api/tool-data/route.js` — that the route
will not replace a `survey2` row that *has* content with one that does not, unless the caller sends
`allowEmpty`, which only the tool itself does because only the tool knows its state was loaded. A
client-only fix would have left the REST route open to any stale tab.

**Done and shipped** in `263f69e9`, round 3 included, with tests that drive the **host** write path —
the gap that let 1,333 green tests miss both losses. (These two paragraphs previously read "the fix in
flight" and "Outstanding: finish round 3 … then commit"; they were written mid-flight and not updated
when the section landed, which left the body of this entry contradicting its own DONE header.)

One consequence of L worth carrying forward: the outbound gate it installed is **client-side**, and
`docs/blocked.md` **B14** records the hole that remains — an open tab still pushes `localStorage` on a
timer with no check that the server's copy has moved on, so a deleted row returns and a freshly
migrated row is overwritten. L stopped the survey being *blanked*; it did not make the row's history
safe from a stale client.

---

## B + C — delete a device with Undo, and delete the only floor · DONE · `83c68498`

B gives every device row an icon-only X with a 5-second Undo; C lets the last remaining floor be
deleted, resetting to a blank Floor 1.

The interesting part is what Undo had to be keyed on. `loadFloor()` resets `devSeq` to 0, so runtime
ids are handed out again after any floor switch — a stash holding an `id` would, after a round trip,
point at a *different* device and restore onto the wrong one silently. The stash therefore holds the
stripped persisted record, its tag, its index and its floor **object**, matched by `cid` (random, never
positional).

Review found three further ways Undo could put the wrong thing back, all fixed:

- `reAdd()` returns without pushing for an unknown kind, and the old code popped regardless — so it
  re-inserted and re-tagged an **unrelated live camera** and still reported success.
- The original tag was restored unconditionally: delete IC5, add a camera (the recount re-issues IC5),
  undo, and IC5 appeared twice.
- "Start Over" blanks a floor in place, so the floor object survived and a pending Undo could resurrect
  a camera onto an empty floor. It now drops the stash, as deleting a floor already did.

Each of those three has a test that was *proven* to fail without its fix, by reversing the guard in
memory and re-running the scenario rather than trusting that the test was load-bearing.

Nothing new reaches the persisted blob — `survey2Meaning` fingerprints it, and a shape change would
void every existing customer survey approval.

**This commit also carries `tests/source-parses.test.mjs`**, which is not from the spec. The B/C review
found a stray brace in `survey-devices.jsx`: the file did not compile, and **1,482 tests stayed green
because nothing in the suite parsed JSX**. This project has no typecheck and no lint, so that class of
error shipped silently until `next build`. The new test runs every file under `app/` and `lib/` through
Next's own SWC transform. It would have caught it, and it caught nothing else — the other 60 changed
files parsed.

---

## D — Enhance blew up the watermark · DONE · `515373b6`

The cause was not in the enhancement. "Enhance" is a **generative redraw** — `/api/enhance` posts the
capture to `gpt-image-1.5` images/edits at 1024px — so there was no filter, sharpen kernel or upscale
to tune. The watermark was already in the image handed to the model: `capture()` stitched up to 16
Google Static Maps tiles edge to edge, and every tile carries the Google logo and imagery attribution
along its bottom edge. A 4×4 capture held that small text **sixteen times, mid-image**, and the model
redrew it smeared at 1024px.

Each tile now contributes only its top rows, so the mosaic carries no text at all. The geometry is
exact — rows advance by the kept height, destination size equals source size — so no seams, no
rescaling, and output dimensions, aspect and JPEG quality are untouched.

This took three rounds, and the two rejections are the useful part:

1. The first version removed **every Google credit** from imagery that is rendered into customer-facing
   proposal PDFs, which Google's Maps Platform terms do not permit. Nothing else in the widget or the
   export path was carrying attribution, so it would have shipped uncredited satellite imagery in a
   contractual document.
2. The second baked one credit into the stored aerial. But the survey *windows* that aerial to a traced
   rect, and for any normally-centred building the SITE SURVEY page cropped the credit straight back
   out — the same defect, now hidden inside the file rather than missing from it. A reopened capture
   could also stack two credits, or feed a credited one back to the model.

The credit is therefore applied where an image is **rendered or delivered**, never where it is stored:
the export plate (closing the cropping hole), the live widget overlay, and Download. One invariant,
checkable in a sentence: *no stored image carries a credit, and every rendered or delivered image
carries exactly one.*

The implementer declined one instruction, correctly: the `dataUrl` that `usePreview()` and `trUse()`
post goes straight into `applyBackground` and is **stored**, so stamping it would have recreated the
very problem round 3 was fixing.

**Unverified:** there is no Google Maps or OpenAI key in this environment, so the rendered result has
never been seen. `PAD = 40` css px clears Google's roughly 25–30px strip with margin, but it is an
estimate. Aerials captured before this fix keep their old tile watermarks until re-captured.

---

## E — the drawing tools · DONE · `904df9d6`

Eight spec items on the floor-plan tool: the mode menu gains Stairs and Block; the Eraser leaves it
(Structure, Area and Block already carry the shared Add/Erase toggle, so a separate control was a
duplicate); a Shapes tool with square, circle, triangle and multi-point; a Select tool with
click/shift-click/marquee, all-or-nothing group drag and undoable delete; rooms nest when drawn wholly
inside a strictly larger room; right-click opens the Room Actions menu and gains "Rotate name"; Street
joins the area names; and the "W × H ft" pill is placed against the real name boxes at a constant
on-screen size, which was half the overlap.

The constraint here was the approval fingerprint, and it holds: `plan.blocks` enters the hash only when
a floor has blocks, so for existing data the hashed JSON is byte-identical — verified by computing the
fingerprint at HEAD and on the working copy and getting the same value both times. A floor *with* a
block hashes differently, which is intended, since the block is part of what the customer approves.

**Not done:** Select has no multi-item edit and moves whole objects rather than corners. Blocks drawn
outside the exported footprint box may be cropped in the PDF viewBox — unchecked.

### Exercised in a browser afterwards · `ce2d750b`

The line above used to end "none of it was exercised in a browser". It has been now, against the real
widget on localhost with a throwaway plan id, driving the tool through its own pointer handlers.

What works, confirmed on screen rather than inferred from the unit tests: the circle and triangle
shapes produce real stepped cell shapes; the multi-point polygon closes on its first corner and fills;
a marquee from empty canvas selects all three rooms and an empty band selects none; and nesting holds
end to end — a Stairs room and a polygon room drawn inside a Garage leave the container's 567 cells
intact, the hit test at an inner cell returns the inner room, and the paint order puts the container
first.

Two things the unit tests could not have caught:

**A defect, now fixed.** Because the nested room paints *over* its container, and the container's name
is anchored at its pole of inaccessibility, a nested room sitting near the middle lands exactly on the
container's name. "Garage" rendered as a washed-out "Ga" buried in the Stairs hatch followed by a crisp
"rage". `IOTDrawGeom.freeCells(room, rooms)` now subtracts nested children before the anchor is chosen,
and all four label anchors — canvas, the dim-pill name boxes and both SVG exports — go through it. The
fingerprint is unmoved, so no customer approval is voided.

**A gap, reported not fixed.** Nesting is only reachable through Stairs mode or the polygon shape. In
Room mode a pointerdown on an existing named room selects it and returns before any drag begins, so
dragging a plain square room inside the Garage creates nothing — it just selects the Garage. The
select-on-tap behaviour is deliberate (it is how a room is renamed), so the two intentions collide on
one gesture, and the ordinary tool cannot produce the feature the spec asked for. Resolving it means
choosing a gesture — modifier-drag, a drag that starts on the container's border, or an explicit "room
inside room" affordance — which is a design decision, not a bug fix. See `blocked.md` B10.

---

## F + I — one card language, and the Addendum moves into the Proposal · DONE · `c109f9b4`

They share two hunks of `gateway-client.jsx`, so they land in one commit rather than a pretend split.

**F** — a submitted or approved Site Survey now reads "Completed ✓" instead of still offering "Edit".
The done/started decision moves into `lib/tool-card.js`, so the hub, the approval bar and the planner
stop each deciding it separately.

The subtle part was `toolAccepted`, which now requires **both** fingerprints to be truthy. The old form
let a legacy acceptance row with a NULL fingerprint match a tool whose current fingerprint was also
falsy — an empty survey reading "approved". All 23 call sites were audited individually: every one
passes a survey or mockup meta, and in the changed class every flip is toward the truthful answer
(active, not approved, unlocked), so no gate opens that was previously closed. Checked against the real
database, old and new differ on **0 of 21** acceptance rows; the only two NULL-fingerprint rows are
pre-binding legacy from July and both their tools have fingerprints. Edited-after-approval correctly
re-opens the card rather than claiming signed — the live case (ASC0038) reads Edit.

**I** — the non-money half only. The Proposal footer is `Record Payment · + Addendum · Download`;
`+ Addendum` appears only once a version is signed and opens the existing section-G builder *inside*
the Proposal view rather than a second editor; addenda list under SENT VERSIONS as "A1 · Nov 20 ·
Signed", numbered from array position with nothing new persisted; the portal's separate Addendum card
is gone and the Proposal card carries "Completed · 1 addendum".

The money and e-sign halves are **not** here and were not worked around — see B1–B4 below.

---

## Still open

**Thirteen items need Ahmed** — `docs/blocked.md` B1–B13. Every section of the spec is otherwise built.

The four that block the rest of section I:

- **B1** — does a signed addendum carry tax and PCP? Changing `getApprovedAddons` moves seven consumers
  at once and would restate balances on live projects. Separately, three definitions of the deposit
  base already disagree, and the customer's payment schedule and the staff's already show different
  numbers today; section I requires them to agree, which changes what a customer is told they owe.
- **B2** — addendum e-sign needs a destructive rebuild of `sign_documents`, the table holding signed
  contractual PDFs.
- **B3** — addenda have no row-per-version storage; stable A1/A2 numbering needs a table or a blob
  change.
- **B4** — "A1" collides with the pinned filename scheme ("Addendum 2").

The two that cost money or trust rather than time:

- **B9** — an abandoned Square checkout can leave a customer shown a Pay button that the endpoint then
  refuses with a 400.
- **B8** — **14 projects are currently telling their customers a proposal is ready to review when none
  was ever published.**

One more that is live and customer-facing:

- **B11** — a legacy survey renders as an EMPTY survey in the portal. Nothing maps the old
  `floors[].B.img` / `floors[].markers` shape onto `survey2`, which is all the project page reads, so a
  legacy-only project shows "Draw the structure first" and "No cameras yet" while the office list shows
  its data. Reproduced on a clone of a real legacy project.

And three that are design or signature decisions rather than defects to fix blind:

- **B10** — the ordinary Room gesture cannot create a nested room; only Stairs mode and the polygon
  shape can. Picking the gesture is Ahmed's call.
- **B12** — the signer refuses `?sign=` in exactly the accepted-but-unsigned state, because its guard
  tests *accepted* rather than *signed*. RED.
- **B13** — "addendum awaiting signature → Sign" was never built; it belongs with the B2/B3 addendum
  decisions.

Both carried-forward unverified items are now closed. Section D's credit was rendered on a canvas at
four output sizes and read back: the plate sits inside the image at every size, the font clamps from 12
to 28px, and roughly an eighth of the plate is near-white text on a dark ground — legible at 1:1 and at
4×, seen on screen, not inferred. Section E was exercised in a browser, which found the label defect
and the gesture gap above.

---

## State of the branch

Fifteen commits on `origin/site-survey-fixes`. **Nothing on `main`** — still at `25916493`, the SEO
commit that predates this run — and **nothing deployed**.

| | |
|---|---|
| `837f7c0c` | J — reminder day label |
| `ca4f80d5` | K — crop tool |
| `f9397090` | G — Addendum uses the Proposal picker |
| `b55cea69` | H — sent-version snapshots |
| `0eea1aca` | the technician balance leak |
| `263f69e9` | L + A — survey persistence, step order |
| `db2f473d` | M + N — one portal, the authorization sweep |
| `919fbc8a` | O — legacy migration + override |
| `83c68498` | B + C — device delete with Undo, delete the only floor (+ the compile gate) |
| `c109f9b4` | F + I — tool-card language, Addendum in the Proposal |
| `904df9d6` | E — drawing tools |
| `515373b6` | D — tile watermark and the rendered credit |
| `ce2d750b` | E round 2 — a nested room no longer buries its container name (found in a browser) |
| `7eca6950` | O·165 + O·166 — projects before the quick actions; a real per-project action |

Four commits each cover two sections, because those pairs co-edited single files too deeply to split
without producing a commit that doesn't compile. Each says so in its message rather than pretending
otherwise. Where files were shared between sections that *could* be separated — `lib/db.js`,
`lib/roles.js`, `proposal-actions.js`, `gateway-client.jsx`, `lib/proposal.js`,
`site-survey-merged.html` — the diffs were split by hunk, and in one case by line, so every commit
carries only its own work. `site-survey-merged.html` was edited by three sections at once; its
`SAT_SRC` and `drawSrc` cache-busters sit on adjacent lines and were separated individually.

Suite: **1235 at baseline → 1547 passing, 0 failing.** `npm run build` compiles clean from a cleared
`.next`.

## O·165 + O·166 — the two items this report once called built · `7eca6950`

An audit of the spec file against the code found two sub-items of section O that had never been built,
after the run had been reported complete. Both were on `/my-projects`: the page still put the quick
actions above the project list, and every card still offered a generic `Open →`.

**O·165** moved the quick actions below the projects and the service calls, and shrank them — heading
1.35→1.05rem and muted, card padding 12/16→9/12, icon 34→28px, grid min 168→150.

**O·166** replaced `Open →` with Approve / Review / Sign / Pay / View, deep-linked through the
gateway's existing `?open=` vocabulary, plus a small Reschedule beside Open when there is an
appointment — pointing at the real `/appt/<token>` flow, using the same signed token the appointment
email already sends that customer.

**The verifier rejected the first attempt and was right four times.** The one that mattered: a CTA
promised things that do not exist. `stageFloorFacts` invents `proposal_status: "accepted"` for any
project parked at `approval_deposit` or later — correct for a status label, wrong for a button — so
**9 of 41 action-bearing cards pointed at an overlay the portal drops**, landing the customer on the
portal home. A card parked at `approval_deposit` with no proposal at all said **Sign**. Cards now carry
an `actionable` gate read from the *unfloored* facts, with the payment leg reusing the portal's own
`payable()` so the card and the overlay agree by construction rather than by two rules kept in step.
Re-run over all 130 real projects: **26 action-bearing cards, 0 pointing at nothing.**

The other three: Completed sat below the todo, so a finished project with a lagging stored stage read
"Approve" instead of "View"; `?sign=1` is refused by the signer in exactly the state Sign is shown for
(dropped — the guard is the signature path, so it went to the owner as **B12**); and "card click still
opens the project page" had never been true, so the card body became a click target that defers to any
link or control inside it, with the title as a real anchor for keyboard users.

Worth recording about the tests: the first attempt's seven tests all passed, and none of them would
have caught any of the four. They asserted the shape of what the function returned and the text of the
source, never that the target on the other end of the link existed. The gate tests added since check
reality, and the count across the live database is the evidence, not the shape.

Two housekeeping notes for whoever works here next. The repo carries **~315 untracked zero-byte files**
(`dashboard/app/div`, `dashboard/app/it.heading`, and many in the root) from an old shell-quoting bug
that predates this run — `git add -A` would sweep them in, so stage by explicit path. And
`docs/migration-report.md` is gitignored on purpose: it contains real customer names and contract
totals.

---

## Who built what (spec rule 40)

Agent and model per section, as the orchestration rules ask. The rule was to escalate
haiku → sonnet → opus only after a failed attempt; where a section was reassigned, both are shown.

| Section | Built by | Model | Reviewed / verified |
|---|---|---|---|
| A — step order | `builder` | sonnet | `reviewer` → `verifier` (opus) |
| B + C — device delete, last floor | `builder` | sonnet | `reviewer` (2 rounds) → `verifier` |
| D — Enhance watermark | `builder` → `data-fixer` | sonnet → opus | `reviewer` → `verifier`, **rejected twice** |
| E — drawing tools | `builder` | sonnet | `reviewer` → `verifier`; re-opened later from a live browser pass |
| F + I — card language, Addendum | `builder` | sonnet | `reviewer` → `verifier` |
| G — Addendum item picker | `builder` | sonnet | `reviewer` → `verifier` |
| H — sent versions | `builder` | sonnet | `reviewer` → `verifier` |
| J — reminder day label | `reminder-fixer` | sonnet | `verifier` |
| K — screenshot crop | `builder` | sonnet | `verifier` |
| L — survey persistence | `data-fixer` | opus | `verifier`, **3 rounds** |
| M + N — one portal, authorization | `builder` → `data-fixer` | sonnet → opus | `code-reviewer` → `verifier` |
| O — legacy migration | `migrator` | opus | `verifier` |
| O·165 + O·166 — my-projects | orchestrator | opus | `verifier`, **rejected on 4 defects** |
| B11 + B12 — legacy adapter, signer | orchestrator | opus | `verifier` ×2, **rejected on scope, then on a consent bug** |

The last two rows are the honest exception to the orchestration rules: they were built in the main
session rather than delegated, because they came out of an audit *after* the run was reported
complete. Both still went through an independent verifier, which rejected both.

---

## How the work was checked

Every section was built by one agent, reviewed by a second, and verified by a third that had to
*exercise* the change rather than read it. Only the verifier could mark a section done.

**It rejected seven sections**, one of them twice, and the rejections were not cosmetic:

- A breadth-first search over 30,216 transitions found one state the survey rail could enter and never
  leave, where Next went *backwards*.
- Compare was mis-marking line items on **36 of 78 real sent proposals** — measured as 15 wrong marks
  on live data, by restoring the broken matcher to prove the oracle could tell.
- A customer could rotate their project's access PIN; the fix was then proven at the database level
  across 44 attack variants.
- The migration's dry run, as documented, wrote to the live database.
- The admin override the migration report routes 38 projects to had **no caller anywhere in the app**,
  and stamped today as the completion date — starting a warranty clock on a job finished months ago.
- A stray brace meant `survey-devices.jsx` did not compile, while the full suite stayed green — because
  no test in the project parsed JSX.
- Section D was rejected twice: once for removing Google's attribution from imagery that goes into
  customer contracts, and again for putting it back somewhere the export reliably cropped off.

Three things were caught only by running the real thing in a browser: the technician balance leak, the
host-side autosync that destroyed a survey row while the UI said "nothing was changed", and section A
shipping without a cache-buster bump, which would have made the whole fix invisible to any browser that
had already loaded the widget.

Two habits earned their keep and are worth repeating. **Claims were attributed before being believed**
— when an agent reported failures it said were someone else's, the failing tests were checked against
what they actually read, and the one failure that was genuinely mine was found that way. And **tests
were proven load-bearing**: each of B/C's three new guards was re-run with its fix reversed in memory,
to confirm the test failed without it. A test that passes either way is worse than no test, because it
reads as coverage.

---

## Deviations from the run's own rules

Recorded so they are decisions rather than omissions.

**Rule 9 — "Typecheck + lint + tests must pass before each commit."** This project has **neither a
typecheck nor a lint**. There is no `tsc`, no eslint config and no `lint` script; `npm test` and
`npm run build` are the only gates. Adding either would be a dependency change, which the scope guard
forbids, so the rule was met as far as it can be: tests and a clean `npm run build` from a cleared
`.next` before every commit, plus a new substitute gate.

That substitute exists because the gap was not theoretical. `survey-devices.jsx` shipped mid-run with
a stray brace: the file did not compile, the Cameras roster and System Planner would have 500'd, and
**all 1,482 tests passed**, because nothing in the suite parsed JSX. `tests/source-parses.test.mjs`
now runs every `app/` and `lib/` file through Next's own SWC transform and every inline `<script>` in
`public/widgets` through `vm.Script`. It is not a type checker and does not pretend to be — it catches
syntax, not types. **A real `tsc --noEmit` / eslint pass remains worth adding, and is the one piece of
rule 9 still genuinely unmet.**

**Rule 6 — "run dry-run only."** Honoured. Two migrations are now written, rehearsed and documented,
and neither has been executed against anything real:

| Migration | Script | Dry-run result |
|---|---|---|
| Section O — legacy projects onto the 3-stage model | `scripts/migrate-legacy-projects.mjs` | see `docs/migration-report.md` (gitignored) |
| B11 — legacy surveys onto `survey2` | `scripts/migrate-legacy-surveys.mjs` | 38 examined → 1 converts, 3 already have `survey2`, 33 no background, 1 held back on an existing row |

Before the survey one is run anywhere real, read **B14**: an open browser tab overwrites tool rows,
so a migrated row can be reverted to pre-migration bytes about a minute later by anyone who has the
project open. Nothing in the code enforces a quiet window.

**Rule 3 — order of work.** Followed for L → A → B, C → G, H, I → M, O → N → J, E, D, F, K. The
exceptions are the two pieces found by auditing the spec after the run was reported complete
(O·165/O·166, then B11/B12), which necessarily ran last.

---

## Closing round — the spec's own leftovers

A final pass over `site-survey-fixes.md`, checking the run's rules as well as its lettered sections.

**B8 is fixed, and it was the only live customer-facing defect that could be closed without an owner
decision.** `customerTodo` announced a proposal from the stage column alone, so any project parked
past `proposal` with nothing published told its customer *"a new proposal is ready — review &
accept"*. It now requires `proposal_published`, the unfloored fact, and the card passes it from the
raw facts rather than from `sf`, which is floored and would have defeated the guard. **14 → 0** on
the live database. The same defect one branch up went with it: `ASC00SR` was asking a customer to
approve a survey that was never submitted.

**Section E's "unchecked" note was a real defect.** `svgPlanBody` draws Blocks, but the export
viewBox came from `planCells()` — structure and rooms only. A Block is by definition land that is
*not* the customer's property, so it sits outside that box, and it was being clipped out of the PNG,
the stored plan SVG and the AI overlay. `planBoundsCells()` now feeds those three. It deliberately
does **not** feed `planFeet()`: the footprint dimension describes the customer's building, and folding
a block into it would overstate their square footage.

**Still open in E, and genuinely ambiguous rather than merely undone.** Spec item 11 asks for a Select
tool that can "move/edit/delete together". Move and delete together are implemented; *edit* together
is not, and the spec does not say what it should mean for a mixed selection of rooms, areas and
blocks — the properties they share are position and existence, which are exactly the two already
covered. Rather than invent a bulk-edit surface, this is left for the owner to specify.

**Section D's `PAD = 40`** remains an estimate. It clears Google's roughly 25–30px attribution strip
with margin, and the rendered credit has been verified at four output sizes, but the trim has never
been measured against a real Static Maps tile because this environment has no Maps key.

Housekeeping done in the same pass: the `ASC-TEST-LEG` legacy clone was deleted now that B11 is
verified (`CSC0119`, its source, untouched), and the **432 untracked zero-byte files** left by an old
shell-quoting bug were removed — the repo's untracked list is now just this spec and the journey-audit
docs.
