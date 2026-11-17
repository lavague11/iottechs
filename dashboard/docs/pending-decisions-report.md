# What would change if you approve — measured, not estimated

Generated while closing out the B-list under the rule *nothing destructive, nothing that changes
existing money*. Every number here was computed against the live local database. **Nothing in this
file has been applied.**

Database backed up first and the backup verified to restore:
`data/backups/dashboard-2026-11-17T00-58-03.db` — 45,748,224 bytes, `integrity_check: ok`,
75 tables / 3,753 rows, zero row-count mismatches against the original.

---

## B6 — the add-on qty rule · **APPLIED 2026-11-17, resolved to 0** · nothing changed

> Applied as measured: **0 of 2 line items affected, 0 clones differ.** The rule is now 0 everywhere
> — `addendumTotals` (untouched), `getApprovedAddons` and `lib/proposal-reuse.js`, which applied the
> `|| 1` a **second** time on the same clone path. 0 was chosen over 1 because it leaves the money
> formula — the one bound into `signedFingerprint` — byte-identical, and because the house rule is to
> never manufacture a number.


The display qty defaults to `|| 1`; the total defaults to `|| 0`. A missing qty therefore counts as
nothing on the add-on and bills as one in a clone.

| | |
|---|---|
| addendum blobs | 7 |
| addenda | 3 |
| line items | 3 |
| **items where the two defaults disagree** | **0** |

**No record in this database is affected.** Aligning the defaults would move no figure. It stays
unapplied because it *could* move one on data that does not exist here yet, and that is your call.

---

## B1 — tax and PCP on a signed addendum · ~~one project, +$49.69~~ **APPLIED 2026-11-17 · $0.00 moved**

> **Superseded by the owner's ruling: _"Tax is not on all customers. It's only if we click it."_**
>
> The measurement below is sound but answers the wrong question — it priced *inheriting the published
> proposal's rate*, when tax is a per-document click. 56 of 84 proposals carry no tax at all.
>
> What shipped instead: the add-on carries its **own** `taxRate`, absent until clicked, never inherited.
> Re-measured after applying — **0 of 3 add-ons and 0 of 31 contracted projects move.** ASC0034 keeps
> its $750.00 add-on and its $3,693.73 balance even though its proposal is taxed at NJ 6.625%.
> The +$49.69 below does not happen. PCP stays out: it is already subtracted at proposal level.

<details><summary>The original measurement, kept for the record</summary>


Current rule: `total = max(0, Σ qty×price − discount)` — no tax, no PCP credit. Proposed rule mirrors
`optionTotals`: `taxable = max(0, sub − discount − pcpCredit)`, then tax at the published proposal's
rate.

Projects with a signed/approved add-on: **2**. Add-ons whose total would change: **1**.

| | |
|---|---|
| project | **ASC0034** |
| add-on | "Added 3 back-lot cameras", signed 2026-07-09 |
| subtotal | $750.00 |
| discount / PCP | $0.00 / $0.00 |
| tax @ 6.625% | **+$49.69** |
| add-on total | $750.00 → **$799.69** |
| **project balance** | **$3,693.73 → $3,743.42** |

**Total additional amount that would be owed across all customers: $49.69.**

This is a customer who has already signed. Restating it changes what they are told they owe after the
fact, which is why it is yours to decide.

</details>

---

## B4 — the "A1" filename scheme · **APPLIED 2026-11-17** · ~~3 of 3 filenames change~~

> **The table below measured a code path with no production caller.** `DOC.ADDENDUM` was referenced
> only by `lib/doc-filename.js` and its own test; the file customers actually receive is the email
> attachment, named by `attachmentName`. Renaming the in-app scheme changed nothing they see.
>
> What did change, and is the real fix: the emailed change order had **no A-number**, so two change
> orders on one project shared one filename. Now:
> `IOT TECHS Change Order - Test Client - ASC0034` **` - A1`**`.pdf`.
>
> `addendumNumberLabel` is now the single definition of the scheme (UI row, in-app download and email
> all read it). An unnumbered add-on still reads "Addendum".


| project | now | proposed |
|---|---|---|
| ASC0128 | `[JOURNEY-TEST] Cedar Pharmacy - CCTV - 0128 - Addendum 1.pdf` | `… - A1.pdf` |
| ASC0111 | `Bug50 Co - CCTV - 0111 - Addendum 1.pdf` | `… - A1.pdf` |
| ASC0034 | `Test Client - CCTV - 0034 - Addendum 1.pdf` | `… - A1.pdf` |

No stored data changes — only what lands in a download folder, and `tests/doc-filename.test.mjs`
pins the current scheme deliberately. Unapplied.

---

## B9 — the stale-pending rule · **LIVE since 2026-11-17** · moves no invoice figure

> Approved and turned on. The secret is now a kill switch (`PAYMENTS_IGNORE_STALE_PENDING="off"`).
> The figures below are what it does, re-measured live: **1 of 31 contracted projects moves**, and
> total / paid / balance are identical in both modes.
>
> Turning it on also surfaced a clock bug that made the 30-minute window useless — `created_at` is
> local time and was being parsed as UTC, inflating every row's age by 5 hours, so a brand-new
> checkout read as stale. Fixed; no existing figure changed by the fix (the one live pending row is
> four months old either way).


Applied behind `PAYMENTS_IGNORE_STALE_PENDING` (unset = off). With it on, a `pending` payment row
older than 30 minutes stops counting against what the customer may pay.

31 projects have a contract; **1** carries a pending row, so one can move:

| | flag OFF | flag ON |
|---|---|---|
| ASC0034 · deposit due | $700.21 | **$834.37** |
| ASC0034 · balance due | $3,559.57 | **$3,693.73** |
| ASC0034 · total / paid / balance | $5,718.73 / $2,025.00 / $3,693.73 | **identical** |
| ASC0129, ASC0128, ASC0127, ASC0126 | — | **identical, no pending rows** |

The blocking row is $134.16, created 2026-07-09 — four months old. `total`, `paid` and `balance`
come from `getProjectFinancialState`, which knows nothing about the flag, so **no invoice figure is
restated in either mode**; only whether the Pay button works.

---

## B2 + B3 — the addendum store · **applied, additive, reversible**

`sign_documents` was never dropped, truncated or rewritten. Addenda got a parallel store instead.
Verified by diffing the migrated copy against the original:

```
tables added:   addendum_sign_documents, addendum_sign_sessions, addendum_versions, addendums
tables removed: (none)
  sign_documents       IDENTICAL  (34 rows)
  sign_sessions        IDENTICAL  (17 rows)
  sign_events          IDENTICAL  (72 rows)
  project_tool_data    IDENTICAL  (159 rows)
  proposals            IDENTICAL  (84 rows)
  project_payments     IDENTICAL  (7 rows)
```

3 addenda copied forward (ASC0034, ASC0111, ASC0128). `--down` was run on the copy and returned the
table set to exactly the original with every table still identical — the drop is lossless because the
JSON blob, which every row is derived from, is only ever read.

**Still yours:** whether the blob or the table becomes the source of truth, and whether addendum
e-sign is wired onto the new document store. Until then the tables are written by the migration and
read by nothing, so they change no behaviour.

---

## B13 — addendum → Sign · still deferred

Unchanged: it needs B2/B3 settled first, since what an addendum signature *is* decides what the CTA
points at. 0 projects are in that state today.
