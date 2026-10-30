# Pricing & Fulfillment Architecture — Master Spec

**Status:** living specification. This is the single source of truth for how pricing, work orders,
technician pay, and profitability relate. UI, reports, and any future AI agent build against these rules.
Supersedes ad-hoc per-feature decisions. Owner-authored architecture (2026-10-30), grounded here in the
current codebase so we build on what exists instead of rebuilding it.

The pipeline:

```
CATALOG → PROPOSAL → WORK ORDER → TECHNICIAN production/pay → PROFITABILITY
```

## The two rules that must never break

1. **Defaults never rewrite snapshots.** Editing a catalog default (name/price/type/tech rate) changes
   the value used for the *next* item added. It never mutates an existing proposal line or an existing
   work-order task.
2. **Customer pricing and technician pricing are different data, connected only through mappings.** A
   technician's pay or production is never inferred from the customer equipment price.

Both rules are **already honored structurally**: a proposal stores its own `payload` JSON per version
(sent versions immutable, row-per-version — see [[signature-binding]], `lib/db.js`), and tech payout
freezes at `wo_finalized_at` ([[work-order-payouts]]). Editing `PROPOSAL_CATALOG` or the price-book presets
does not touch existing proposals. Keep it that way; the work below must not introduce a global rewrite.

---

## The six values

| # | Value | Meaning | Lives in |
|---|-------|---------|----------|
| 1 | **Catalog Default** | default name/price/type for a NEW line | `PROPOSAL_CATALOG` (lib/proposal.js) + price-book presets (localStorage `iot_price_defaults`) |
| 2 | **Proposal Line Snapshot** | what THIS customer was quoted | the proposal `payload` (frozen per version) |
| 3 | **Equipment Cost** | what IoT Techs pays for the hardware | `it.cost` per line (cost-stripped for customers) |
| 4 | **Customer Installation Price** | what we charge the customer for the work | `it.price` per labor line |
| 5 | **Technician Price** | what the tech is paid for a task | `it.techPrice` per line → `saveTechPricingAction`, frozen at WO finalize |
| 6 | **Technician Production** *(calculated, NEW)* | revenue/work credited to the tech who did it | derived from the customer **installation** value of the tech's tasks — NOT the equipment retail price |

Production ≠ equipment price. An $800 NVR does not mean the tech "generated $800." Production comes from
the labor/install value of the tasks the technician actually performs.

---

## Two catalogs (do not build a third)

- **A. Proposal Catalog** — what customers are sold. `PROPOSAL_CATALOG` today. Each canonical item should
  gain: `catalogItemId` (stable id — **names are not identities**), `itemType` (`equipment` | `labor`),
  `defaultCustomerPrice`, `defaultCost` (optional), `associatedWorkTaskIds`, `active`.
- **B. Technician Task Catalog** — the tech pricing schedule. **Already exists** as the rate library /
  `RateLibrary` + `defaultTechPayout`/`seedTechPricingMap`. Each task: `taskId`, `taskName`,
  `technicianPrice`, `productionMapping`, `active`. Reuse it — do not fork a second tech-pricing system.

---

## Equipment vs Labor is a classification, not a payout rule

An item being `equipment` does **not** mean "no technician touches it." Classification says *what we
supply* (equipment) vs *what we charge to install/configure* (labor). The Work Order decides what we pay
the tech to perform the labor.

```
Camera                 EQUIPMENT      16-Channel NVR   EQUIPMENT
Cat6 Drop              LABOR          8TB Hard Drive   EQUIPMENT
Cat6 Termination       LABOR          NVR Setup        LABOR   ← NEW, see below
Camera Mounting        LABOR
Camera Programming     LABOR
Camera Waterproofing   LABOR
```

Parent bundles (`Camera Install Complete`, `NVR · 16-Channel`) are **containers**, not types. Their
children carry the real `itemType`; never force one classification onto the whole bundle.

---

## NVR Setup (NEW)

Every standard NVR config should include a **`NVR Setup`** labor line, auto-created **once per NVR**, after
the drive/storage lines:

```
NVR · N-Channel
 ├─ NVR hardware      EQUIPMENT
 ├─ Hard drive        EQUIPMENT
 ├─ Additional drive  EQUIPMENT
 └─ NVR Setup         LABOR        (seat/format/verify drives, init storage, confirm recording, basic setup)
```

- Maps to a technician task via the EXISTING rate `R.nvr_setup` (no separate tech-pricing system).
- **Never duplicate NVR Setup for the same NVR.**

**✅ P2 COMPLETE.** Canonical item `camera:nvr_setup` (type `labor`, customer **$100**, tech **$10** via
`DEFAULT_RATES.nvr_setup`, owner-set). Helpers in `lib/proposal.js`: `nvrSetupLine(book)` builds the stamped
labor line (`nvrSetup: true` + `catalogItemId`/`itemType`); `ensureNvrSetup(items, book)` keeps **exactly
one** per NVR, inserted after the drives, dropped when the NVR is removed, collapses duplicates — idempotent,
additive, never touches other lines. Wired into `cameraBaselineItems()` + the editor's `applyNvr()`. NOT
applied to historical proposals (snapshot rule). `seedTechPricingMap` gives the NVR Setup line the setup
payout and **zeroes the NVR hardware line** when a setup line exists (no double count); legacy services
without a setup line are unchanged. `inSysbar` excludes the setup line so it renders as a normal labor row
(flat; nesting it inside the NVR lead group is an optional follow-up). Tests: `tests/nvr-setup.test.mjs` (8).
Full suite 1052, build clean.

---

## Conditions (structured, attach to the line id — not the text)

Conditions live on a stable `proposalLineId` and survive renames. Today: `cxEquip` (Customer-Provided
Equipment), `existingCable` (Existing Cable), plus Tested/Not-Tested, via `LINE_CONDITIONS`
(`proposal-terms.js`) — see [[line-item-conditions]]. Target semantics:

- **Customer-Provided Equipment (CPE)** → waives the *hardware* charge ($150 → $0) but **keeps all
  installation labor** (drop, termination, mounting, programming, waterproofing) — we still do the work,
  the tech is still paid.
- **Existing Equipment / Existing Cable** → same hardware-waive behavior when it means we're reusing
  hardware/cable rather than supplying new; labor still applies. Kept as a **separate** condition (different
  fact; the PDF must say the correct one).
- **CPE ⇒ Waived (one-way).** CPE automatically waives the hardware. But **Waived ⇏ CPE** — you may waive
  for promo, goodwill, mistake, warranty, negotiation. Never infer CPE from a bare waive.

---

## Waive preserves the original price

Already true in code: `it.waived = true` keeps `it.price` and `itemTotal()` returns 0
(`lib/proposal.js:697`). Model it explicitly as:

```
snapshotPrice: 150   // retained
waived: true
effectivePrice: 0
waiverReason: "cpe" | "promo" | "existing" | …   // NEW
```

Removing a condition restores the price **from that line's snapshot** (e.g. back to $150) — **never** from
today's catalog (which may now be $175). Add `waiverReason` so we can report Original / Waived / Final.

---

## Proposal line structure (target model)

```
proposalLineId        catalogItemId          nameSnapshot      itemTypeSnapshot
quantity              unitPriceSnapshot       equipmentCostSnapshot
conditions[]          waived  waiverReason
parentServiceId       sortOrder               workTaskMappings[]
```

Not every field needs that literal name; this is the information to model. Today's lines have
`id, name, price, qty, cost, waived, sub[], conditions, techPrice` — **missing**: `catalogItemId`,
`itemType`, `waiverReason`, `workTaskMappings`.

---

## Work Order generation & the three numbers

On **Create Work Order**, read the current/finalized proposal scope and map applicable components to
operational tasks. Equipment still appears (the tech needs to know what they're installing) but equipment
sale price is **not** tech pay.

For each relevant task the WO shows **three distinct numbers**:

| Number | Meaning |
|--------|---------|
| **Customer value** | what the customer pays for that install/labor |
| **Technician production** | work/revenue credited to the tech (default: = customer install value) |
| **Technician pay** | what we owe the tech |

```
NVR SETUP   Customer install value $150 · Technician production $150 · Technician pay $50
```

Today the WO modal shows Customer + Tech payout (one editable column, see
`proposal-tech-pricing.jsx`). **GAP:** the Production column/number.

---

## Profitability (future layer)

Once `cost` is maintained accurately:

```
Customer revenue − Material/equipment cost − Technician payout − other direct = Gross profit
```

Project view: revenue (equipment + install split), material cost, tech production, tech payout, gross
profit/margin. Tech performance: production generated, payout, hours, production/hour, payout/production.

---

## Customer PDF vs internal

Customer PDF sees: equipment, labor, conditions, customer prices, waivers, customer-facing explanation.
Never: tech price, tech payout, internal cost, margin (already enforced server-side via the sanitize pass
— see [[proposal-page]]). A CPE line stays **visible at $0.00** so scope is clear; don't make it disappear.

---

## Inline editing & the action menu (UI contract)

- **Inline edit stays tight** — same row, text → input, no ballooning (DONE 2ea588e). For catalog-backed
  items, saving an edited default name/price updates *this line* **and** the catalog default for future
  adds — never other existing lines.
- **One action menu, two triggers.** Desktop **right-click** and iPhone **press-and-hold** on a line open
  the SAME menu as `•••` (Duplicate · Conditions · Waive · Remove). Suppress the browser's native
  copy/select/inspect/magnifier on a non-editing line; long-press cancels if the finger starts scrolling;
  native text selection only inside an actual input. **GAP** (today: `•••` + tap-to-edit only).

---

## The AI agent's contract (hard rules)

```
Never rewrite an existing proposal because a catalog default changed.
Never rewrite an existing work order because a technician rate changed.
Never infer technician pay from customer equipment price.
Never infer item identity from its display name if a stable id exists.
Never remove installation labor merely because equipment is customer-provided.
Never treat Waived as automatically Customer-Provided Equipment.
CPE may auto-waive hardware; Existing Equipment may auto-waive applicable hardware.
Never expose technician payout or internal cost to customer-facing documents.
Never duplicate NVR Setup for the same NVR.
Never generate an undefined price — if a canonical price/mapping is missing, flag it for staff.
```

The agent retrieves structured catalog records (id, type, default components, work mappings) and executes
these rules — it never guesses business logic from words.

---

## Current state → gaps (build map)

| Capability | State | Where / note |
|---|---|---|
| Proposal snapshot per version, immutable sent versions | **EXISTS** | `lib/db.js` versioning, [[signature-binding]] |
| Catalog edits don't rewrite existing proposals | **EXISTS** (by construction) | proposals carry own payload |
| Per-line conditions (CPE / Existing / Tested) on line id | **EXISTS** | `LINE_CONDITIONS`, [[line-item-conditions]] |
| Waive preserves price, returns $0, customer-visible | **EXISTS** | `itemTotal` `lib/proposal.js:697` |
| Tech pricing per line + freeze at WO finalize | **EXISTS** | `proposal-tech-pricing.jsx`, [[work-order-payouts]] |
| Cost/tech stripped from customer docs | **EXISTS** | server sanitize, [[proposal-page]] |
| Tight inline edit | **DONE** | commit 2ea588e |
| `itemType` (equipment/labor) on catalog + line | **GAP** | catalog is `{name,price,cost}` only |
| Stable `catalogItemId` provenance on lines | **GAP** | lines keyed by instance `id` only |
| `waiverReason` + explicit CPE⇒waive linkage | **PARTIAL** | waive works; reason + one-way link missing |
| `NVR Setup` auto labor line (once per NVR) + task mapping | **GAP** | new |
| WO "Technician Production" (3rd number) | **GAP** | WO shows Customer + Pay only |
| Profitability report (margin) | **PARTIAL** | cost exists; no margin surface |
| Right-click / long-press → action menu, suppress native | **GAP** | `•••` + tap only |
| Catalog-edit-updates-default-not-other-lines on inline save | **VERIFY → likely GAP** | confirm inline save writes the default |

---

## Suggested phases (smallest safe steps first)

- **P1 — Classification + provenance (data model, additive). ✅ COMPLETE (commit pending).** See
  "Phase 1 — implemented" below.
- **P2 — NVR Setup. ✅ COMPLETE.** See the "NVR Setup" section above.
- **P3 — Condition semantics hardened.** `waiverReason`, CPE⇒waive (one-way), restore-from-snapshot on
  condition removal; PDF wording per condition. RED (money) — confirm before shipping.
- **P4 — WO Production number.** Add Technician Production to the WO (default = customer install value of
  the tech's tasks); keep pay separate. RED — confirm.
- **P5 — Action menu parity.** Desktop right-click + iPhone long-press → the shared menu; suppress native
  selection. GREEN (UI).
- **P6 — Profitability + tech performance.** Margin rollups + per-tech production/payout reports. YELLOW.
- **P7 — AI agent.** Structured-record retrieval + the contract above, building on [[ai-command-center]].

Each phase: additive, snapshot-preserving, tested, and for RED phases confirmed with the owner first.

---

## Phase 1 — implemented

Final model (all in `lib/proposal.js`; UI in `proposal-items-editor.jsx`):

- **Catalog item** gains two fields: `type: "equipment" | "labor"` (explicit classification) and a stable
  `id` that is an **explicit, authored, permanent constant** (e.g. `"camera:cat6_drop"`) declared on each
  entry in `RAW_PROPOSAL_CATALOG`. **Canonical catalog ids are declared permanent constants — they are
  NEVER derived from mutable names, base names, service labels, prices, or array order.** A rename/refactor
  of any `name`/`baseName`, a price/cost edit, or a reorder cannot change identity. `withCatalogIds()` is a
  pass-through that *enforces* the invariant (build-time error if an item lacks an explicit id or an id
  repeats); it generates nothing. `catalogSlug()` remains only as an incidental UI helper, never on the
  identity path. `PROPOSAL_CATALOG` is the validated export.
- **Lookups:** `catalogItemById(id)`, `catalogItemByName(name, service?)`, `catalogIdForName(name, service?)`.
- **Proposal line** carries a snapshot: `catalogItemId` (provenance) + `itemType` (classification),
  stamped at creation by `catalogStampFor(name, service)` inside `makePresetBlock` / `makeCameraBundle` /
  `cameraBaselineItems`. Line `id` stays the instance identity. Containers (bundle headers, NVR groups) are
  NOT catalog items → no stamp; their children carry the type.
- **Resolver (no mutation):** `itemTypeOf(line, service)` = stored `itemType` → `catalogItemId` → name
  match → `null` (custom/container). Every line, including legacy, classifies correctly on read.
- **Legacy backfill:** `normalizeProposalProvenance(payload)` — idempotent, additive, never changes
  price/qty/conditions/waiver/totals, never overwrites a stamp. Available as a utility; NOT auto-applied to
  history (the resolver already covers reads).
- **UI:** the shared `ItemMenu` (•••) gains an Equipment/Labor **Type** selector on atomic top-level lines
  (custom/manual items) → `patchItem(id, { itemType })`.
- **Invariants held:** catalog id = canonical identity; line id = instance; line values = snapshots;
  catalog edits affect future adds only (lines carry own price — already true); type stored not inferred
  from the live name; a service may hold mixed equipment/labor children; customer/tech pricing stay
  separate. No customer total changes.
- **Tests:** `tests/catalog-identity.test.mjs` (11 tests — stable/unique ids, **explicit-id hardening**
  (authored literals preserved from first P1 ship, id independent of name/price/cost/order, loader rejects
  missing/duplicate ids), classification, snapshot independence, mixed service, resolver precedence,
  idempotent additive migration). Full suite 1044 pass; production build clean.
- **Ambiguous classification flagged:** `sound` → **Rack & Mount** classed `labor` (mounting work + rack
  hardware). Revisit if it should be equipment.
- **Deferred within P1 scope (noted, low-risk):** a subtle internal Equipment/Labor *indicator* on each
  row (section 19) was left out to avoid clutter; the Type is reachable via the ••• menu. Name-based logic
  that remains (`priceOf`/`displayNameOf` by name, `LOCKED_CATALOG_NAMES`, NVR channel-count pattern
  matching in `proposal-items-editor.jsx`) is intentionally untouched — it keys off the stable `baseName`
  anchor, which is equivalent to id for pricing; converting those to id-based lookups is a safe later pass.
