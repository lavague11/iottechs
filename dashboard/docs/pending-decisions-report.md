# What would change if you approve — measured, not estimated

Generated while closing out the B-list under the rule *nothing destructive, nothing that changes
existing money*. Every number here was computed against the live local database. **Nothing in this
file has been applied.**

Database backed up first and the backup verified to restore:
`data/backups/dashboard-2026-11-17T00-58-03.db` — 45,748,224 bytes, `integrity_check: ok`,
75 tables / 3,753 rows, zero row-count mismatches against the original.

---

## B6 — the add-on qty rule · **nothing would change**

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

## B1 — tax and PCP on a signed addendum · **one project, +$49.69**

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

---

## B4 — the "A1" filename scheme · **3 of 3 filenames change**

| project | now | proposed |
|---|---|---|
| ASC0128 | `[JOURNEY-TEST] Cedar Pharmacy - CCTV - 0128 - Addendum 1.pdf` | `… - A1.pdf` |
| ASC0111 | `Bug50 Co - CCTV - 0111 - Addendum 1.pdf` | `… - A1.pdf` |
| ASC0034 | `Test Client - CCTV - 0034 - Addendum 1.pdf` | `… - A1.pdf` |

No stored data changes — only what lands in a download folder, and `tests/doc-filename.test.mjs`
pins the current scheme deliberately. Unapplied.

---

## B9 — the stale-pending flag · **built, OFF, moves no invoice figure**

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
