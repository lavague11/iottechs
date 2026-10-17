# BYS — Build Your System (white-label quote builder)

**Status:** blueprint (approved direction, pre-refactor). **Owner decision:** name = BYS; first proof vertical after cameras = **POS / Toast**; extraction starts only after this doc is approved.

## What BYS is

**BYS ("Build Your System")** is the white-label *template* behind today's `/build` camera-quote builder. One reusable shell powers many public, customer-facing "Build Your **[X]** System" lead builders — each a self-skinned instance of the same flow:

| Instance | Public label | Vertical |
|---|---|---|
| `cameras` (flagship, exists) | **Build Your Camera System** | CCTV |
| `pos` (2nd — the proof) | **Build Your POS System** | Toast / POS |
| `alarm` | **Build Your Alarm System** | ADT / security |
| `fire` | **Build Your Fire System** | Fire alarm |

Public labels stay spelled out ("Build Your Camera System" converts better than "BYCS"). **BYS** is the internal platform/engine name. Each instance is one **spec** file, not a new app.

## The seam: shell vs spec

Today everything lives in one ~2,900-line file: `public/widgets/cctv-quote-calculator.html`. It is really two things fused. White-labeling = **split them**.

### The SHELL (reusable, vertical-agnostic — ~70%, becomes BYS core)
Lives in the widget today; these move to the core:
- **Flow + chrome:** `STEPS[]`, `go()`/`goNext()`, `chrome()`, the 3-segment progress nav, swipe, the index `drawer`, draft save/resume (`loadDraft`/`localStorage`).
- **Intake step** (`R.contact`, `validateContact`, the `focusout`/`input` handlers, Google Places via `/api/config` + Photon fallback, `smartName`/`fmtPhone`/`emailSuggest`). **This is exactly where the IMPRESS Form Standard lives — build it once in core, every vertical inherits it.** See `docs/impress-form-standard.md` (to be written with the intake pass).
- **Package picker + feature board + selected summary + breakdown** (`pkgPicker`/`pkgBoard`/`pkgSummary`) — already generic: they render from `levels[]` + `tierTotal()`.
- **Quote/submit:** `finalizeQuote`, `submitLead`, the submitted-state view, analytics `postMessage` hooks.
- **Theme tokens** (ivory `--bg` / navy `--fg` / gold `--gold`/`--sel`) and the shared card component (`.nvr-btn`).

### The SPEC (per-vertical — ~30%, one file per instance)
Everything product-specific, today hard-coded in `CONFIG` + `Engine`:
- **catalog** — the parts (CCTV: cameras/NVR/storage; POS: terminals/printers/KDS/router/cabling).
- **pricing engine** — *the hard, vertical-unique part.* CCTV's `Engine.compute`/`sizeStorage` (camera count → storage → recorder sizing → line items) does **not** generalize; each vertical brings its own `price(state) → { lines, total, flags }`.
- **steps / configuration UI** — CCTV's `System` step (cameras + recorder + retention + advanced). POS's is different (locations, terminals, KDS screens, receipt printers, cabling drops).
- **features + packages** — `securityFeatures[]` + `levels[]` (Essential/Smart/Pro). Each vertical defines its own tiers (or none).
- **copy + brand** — header label, ledes, accent color, lead `service` code.

## Vertical spec schema (target)

```js
// specs/<vertical>.js  (one per instance)
export default {
  id: 'pos',
  brand: { label: 'Build Your POS System', accent: '#...', /* optional overrides */ },
  lead: { service: 'POS', endpoint: '/api/leads' },         // service code for createLeadProject
  intake: { /* IMPRESS field set — defaults from core; vertical can add/trim */ },
  catalog: { /* parts + prices */ },
  packages: [ /* optional tiers, same shape as CCTV levels[] */ ],
  features: [ /* optional feature board rows */ ],
  steps: [ /* ordered: intake, <vertical config step(s)>, quote */ ],
  price(state) { /* returns { lines:[{g,label,qty,unit,amt}], total, flags } — the ONLY vertical-unique math */ },
};
```

Core reads a spec by route and renders. The spec is pure data + one `price()` function; no UI framework per vertical.

## Routing

- Keep `/build` → cameras (don't break existing links / homepage overlay / SEO).
- Add `/build/<vertical>` (`/build/pos`, `/build/alarm`, `/build/fire`) selecting the spec. Confirm the current `/build` route wiring (how the widget HTML is served today) during Phase 0.

## Lead delivery (generalize)

Today: `submitLead` → `POST /api/leads/cctv` → `createLeadProject(name,email,phone,address,"CCTV",company,null,{})` (`app/api/leads/cctv/route.js:55`, `lib/db.js:3168`). Only the single `address` string is persisted.

For BYS: make the service code a **spec field** and the route generic — `POST /api/leads` with `{ type, ...contact, snapshot }`, mapping `type → createLeadProject(..., service, ...)`. (Structured address — placeId/lat-lng/components the intake already captures but drops — is a separate backend enhancement, tracked with the IMPRESS pass.)

## Phased plan

- **Phase 0 — Extract (cameras, zero behavior change).** Split the widget into **BYS core** (shell) + a **`cameras` spec** (`CONFIG` + `Engine` + the System step + copy). Acceptance: live `/build` is pixel- and price-identical before/after; all 697 tests green; the camera spec is the only CCTV-specific file. *This single refactor is the whole enabling move.*
- **Phase 1 — POS / Toast spec.** Author `specs/pos.js`: catalog (terminals, KDS, receipt/kitchen printers, router/switch, cabling drops), a POS `price()`, its config step(s), copy, accent. Route `/build/pos`. Proves "new vertical = one spec, no new app."
- **Phase 2+ — Alarm, Fire** as additional specs. Optional: a tiny spec registry + a `/dev` launcher listing all instances.

## Hard parts / risks

1. **Per-vertical pricing engine** is real work each time — it's the irreducible vertical content (POS pricing ≠ camera storage math). The shell saves the other ~70%.
2. **The CCTV `Engine` is intricate** (storage sizing, recorder auto-size, upgrade prompts). Phase 0 must move it behind the `price()` seam *without touching the math* — guard with the existing trace/number tests.
3. **Don't regress `/build`.** It's live, feeds `/api/leads/cctv`, and is opened from the homepage overlay. Phase 0 is a refactor, not a rewrite.
4. **IMPRESS + BYS converge:** do the IMPRESS intake pass *as part of core* so all verticals get the verified-address / validation intake for free (avoid building it twice).

## What to measure (ROI)

- **Time-to-launch a new vertical** (target after Phase 0: a spec in days, not a rebuild).
- **Lead volume + conversion per vertical** (`postMessage` + `/api/leads` already instrument this).
- **Reuse ratio** (lines in core vs per-spec) — proves the white-label claim.

Upside: a per-service-line lead builder IOT TECHS can spin up fast — and a licensable product for other installers.
